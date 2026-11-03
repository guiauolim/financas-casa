import "server-only";
import { type CardCycle, refForNameMonth, transactionInvoiceRefs, addMonthsToRef } from "@/lib/finance/billing";
import { monthRange, toYearMonth, type YearMonth } from "@/lib/finance/dates";
import type { LedgerEntry } from "@/lib/finance/ledger";
import { planInstallments } from "@/lib/finance/installments";
import { defaultSpentBy, type SpentBy } from "@/lib/finance/spent-by";
import type { AccountKind } from "@/lib/validation/accounts";
import type { TxType } from "@/lib/validation/categories";
import type { Scope, TransactionInput } from "@/lib/validation/transactions";
import { ServiceError, throwIf } from "./errors";
import type { Actor, Db } from "./types";

export type TxSource = "whatsapp" | "web" | "import";

export type Transaction = {
  id: string;
  type: TxType;
  amountCents: number;
  description: string | null;
  occurredOn: string;
  source: TxSource;
  createdBy: string | null;
  createdByName: string | null;
  // De quem é o lançamento: membro ou null = Casa (≠ quem lançou).
  spentBy: SpentBy;
  spentByName: string | null;
  cardLastDigits: string | null;
  invoiceRef: string | null; // fatura do cartão ("YYYY-MM" do fechamento) ou paga (pagamento)
  deletedAt: string | null;
  account: { id: string; name: string; kind: AccountKind };
  transferAccount: { id: string; name: string; kind: AccountKind } | null;
  category: { id: string; name: string; icon: string | null } | null;
  // purchaseTotalCents: soma das parcelas não excluídas do grupo (total da compra).
  installment: { groupId: string; number: number; total: number; purchaseTotalCents: number | null } | null;
};

const SELECT = `
  id, type, amount_cents, description, occurred_on, source, created_by, spent_by, card_last_digits, invoice_ref, deleted_at, created_at,
  installment_group_id, installment_number, installment_total,
  account:accounts!transactions_account_id_fkey(id, name, kind),
  transfer_account:accounts!transactions_transfer_account_id_fkey(id, name, kind),
  category:categories!transactions_category_id_fkey(id, name, icon),
  creator:profiles!transactions_created_by_fkey(display_name),
  spender:profiles!transactions_spent_by_fkey(display_name)
`;

type Row = {
  id: string;
  type: TxType;
  amount_cents: number;
  description: string | null;
  occurred_on: string;
  source: TxSource;
  created_by: string | null;
  spent_by: string | null;
  card_last_digits: string | null;
  invoice_ref: string | null;
  deleted_at: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  account: { id: string; name: string; kind: AccountKind } | null;
  transfer_account: { id: string; name: string; kind: AccountKind } | null;
  category: { id: string; name: string; icon: string | null } | null;
  creator: { display_name: string } | null;
  spender: { display_name: string } | null;
};

function toTransaction(row: Row): Transaction {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    description: row.description,
    occurredOn: row.occurred_on,
    source: row.source,
    createdBy: row.created_by,
    createdByName: row.creator?.display_name ?? null,
    spentBy: row.spent_by,
    spentByName: row.spender?.display_name ?? null,
    cardLastDigits: row.card_last_digits,
    invoiceRef: row.invoice_ref,
    deletedAt: row.deleted_at,
    account: row.account ?? { id: "", name: "—", kind: "checking" },
    transferAccount: row.transfer_account,
    category: row.category,
    installment:
      row.installment_group_id && row.installment_number && row.installment_total
        ? {
            groupId: row.installment_group_id,
            number: row.installment_number,
            total: row.installment_total,
            purchaseTotalCents: null,
          }
        : null,
  };
}

export type ListFilters = {
  householdId: string;
  month: YearMonth;
  accountId?: string;
  categoryId?: string;
  // De quem é: id do membro, null = só Casa, undefined = todos.
  spentBy?: SpentBy;
  // Filtro "Fatura": tudo o que está nesta fatura do cartão (inclusive parcelas de compras antigas)
  // e os pagamentos feitos para ela. Ignora `month`.
  invoice?: { accountId: string; ref: string };
};

type CardForView = { id: string; naming: "closing" | "due" } & CardCycle;

async function listViewCards(db: Db, householdId: string): Promise<CardForView[]> {
  const { data, error } = await db
    .from("accounts")
    .select("id, closing_day, due_day, invoice_naming")
    .eq("household_id", householdId)
    .eq("kind", "credit_card");
  throwIf(error);
  return (data ?? []).flatMap((a) =>
    a.closing_day && a.due_day
      ? [{ id: a.id, closingDay: a.closing_day, dueDay: a.due_day, naming: a.invoice_naming === "due" ? ("due" as const) : ("closing" as const) }]
      : [],
  );
}

// Condição (sintaxe do PostgREST) do que conta no mês: fora do cartão pela data; no cartão,
// pela fatura cujo nome é o mês (regra "por fatura" do sistema).
async function monthCondition(db: Db, filters: ListFilters): Promise<string> {
  const { from, to } = monthRange(filters.month);
  const byDate = `occurred_on.gte.${from},occurred_on.lte.${to}`;
  const cards = await listViewCards(db, filters.householdId);
  if (cards.length === 0) return `and(${byDate})`;
  const monthKey = toYearMonth(filters.month);
  return `or(${[
    `and(${byDate},account_id.not.in.(${cards.map((c) => c.id).join(",")}))`,
    ...cards.map((card) => `and(account_id.eq.${card.id},invoice_ref.eq.${refForNameMonth(monthKey, card.naming, card)})`),
  ].join(",")})`;
}

export async function listTransactions(db: Db, filters: ListFilters): Promise<Transaction[]> {
  let query = db.from("transactions").select(SELECT).eq("household_id", filters.householdId).is("deleted_at", null);
  const conditions: string[] = [];
  if (filters.invoice) {
    const { accountId, ref } = filters.invoice;
    query = query.eq("invoice_ref", ref);
    conditions.push(`or(account_id.eq.${accountId},transfer_account_id.eq.${accountId})`);
  } else {
    conditions.push(await monthCondition(db, filters));
  }
  // Filtro por conta inclui transferências que chegam nela (ex.: pagamento de fatura no cartão).
  if (filters.accountId) {
    conditions.push(`or(account_id.eq.${filters.accountId},transfer_account_id.eq.${filters.accountId})`);
  }
  query = query.or(`and(${conditions.join(",")})`);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.spentBy === null) query = query.is("spent_by", null).neq("type", "transfer");
  else if (filters.spentBy) query = query.eq("spent_by", filters.spentBy);
  const { data, error } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<Row[]>();
  throwIf(error);
  return withPurchaseTotals(db, filters.householdId, (data ?? []).map(toTransaction));
}

// Preenche o total da compra das parcelas (soma das parcelas não excluídas de
// cada grupo), para a lista e a edição mostrarem "3/10 · total R$ X".
async function withPurchaseTotals(db: Db, householdId: string, transactions: Transaction[]): Promise<Transaction[]> {
  const groupIds = [...new Set(transactions.flatMap((tx) => (tx.installment ? [tx.installment.groupId] : [])))];
  if (groupIds.length === 0) return transactions;
  const { data, error } = await db
    .from("transactions")
    .select("installment_group_id, amount_cents")
    .eq("household_id", householdId)
    .in("installment_group_id", groupIds)
    .is("deleted_at", null);
  throwIf(error);
  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.installment_group_id) continue;
    totals.set(row.installment_group_id, (totals.get(row.installment_group_id) ?? 0) + row.amount_cents);
  }
  return transactions.map((tx) =>
    tx.installment
      ? { ...tx, installment: { ...tx.installment, purchaseTotalCents: totals.get(tx.installment.groupId) ?? null } }
      : tx,
  );
}

// Últimos lançamentos do mês (mais recentes primeiro), para a Visão geral.
export async function listRecentTransactions(
  db: Db,
  { householdId, month, limit = 8 }: { householdId: string; month: YearMonth; limit?: number },
): Promise<Transaction[]> {
  const { from, to } = monthRange(month);
  const { data, error } = await db
    .from("transactions")
    .select(SELECT)
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Row[]>();
  throwIf(error);
  return withPurchaseTotals(db, householdId, (data ?? []).map(toTransaction));
}

const LEDGER_PAGE = 1000; // limite padrão de linhas por resposta do PostgREST

// Todos os lançamentos não excluídos da casa em formato leve (sem joins), base de
// saldos, faturas e orçamentos. Pagina para não ser cortado em 1000 linhas.
export async function listLedger(db: Db, { householdId }: { householdId: string }): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("transactions")
      .select("id, type, amount_cents, occurred_on, account_id, transfer_account_id, category_id, spent_by, invoice_ref")
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("occurred_on")
      .order("id")
      .range(page * LEDGER_PAGE, (page + 1) * LEDGER_PAGE - 1);
    throwIf(error);
    for (const row of data ?? []) {
      entries.push({
        type: row.type,
        amountCents: row.amount_cents,
        occurredOn: row.occurred_on,
        accountId: row.account_id,
        transferAccountId: row.transfer_account_id,
        categoryId: row.category_id,
        spentBy: row.spent_by,
        invoiceRef: row.invoice_ref,
      });
    }
    if ((data?.length ?? 0) < LEDGER_PAGE) return entries;
  }
}

export async function listDeletedTransactions(db: Db, { householdId }: { householdId: string }) {
  const { data, error } = await db
    .from("transactions")
    .select(SELECT)
    .eq("household_id", householdId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(200)
    .returns<Row[]>();
  throwIf(error);
  return (data ?? []).map(toTransaction);
}

export async function getTransaction(
  db: Db,
  { householdId, transactionId }: { householdId: string; transactionId: string },
): Promise<Transaction | null> {
  const { data, error } = await db
    .from("transactions")
    .select(SELECT)
    .eq("household_id", householdId)
    .eq("id", transactionId)
    .returns<Row[]>()
    .maybeSingle();
  throwIf(error);
  if (!data) return null;
  const transaction = toTransaction(data);
  if (transaction.deletedAt) return transaction;
  const [withTotal] = await withPurchaseTotals(db, householdId, [transaction]);
  return withTotal!;
}

// Confere no servidor que conta, destino e categoria são da casa, estão ativos
// (a não ser que já fossem os da transação editada) e combinam com o tipo.
async function assertReferences(
  db: Db,
  householdId: string,
  input: TransactionInput,
  current?: Transaction,
): Promise<{ categoryHouseholdDefault: boolean; cycles: Map<string, CardCycle | null> }> {
  const accountIds = [input.accountId, input.type === "transfer" ? input.transferAccountId : null].filter(
    (id): id is string => Boolean(id),
  );
  const { data: accounts, error } = await db
    .from("accounts")
    .select("id, kind, archived, closing_day, due_day")
    .eq("household_id", householdId)
    .in("id", accountIds);
  throwIf(error);
  const keep = new Set([current?.account.id, current?.transferAccount?.id]);
  for (const [index, id] of accountIds.entries()) {
    const account = accounts?.find((a) => a.id === id);
    const field = index === 0 ? "accountId" : "transferAccountId";
    if (!account) throw new ServiceError("Conta não encontrada.", field);
    if (account.archived && !keep.has(id)) throw new ServiceError("Esta conta está arquivada.", field);
  }
  // Ciclo dos cartões envolvidos (para a fatura do lançamento).
  const cycles = new Map<string, CardCycle | null>(
    (accounts ?? []).map((a) => [
      a.id,
      a.kind === "credit_card" && a.closing_day && a.due_day ? { closingDay: a.closing_day, dueDay: a.due_day } : null,
    ]),
  );

  const categoryId = input.type === "transfer" ? undefined : input.categoryId;
  let categoryHouseholdDefault = false;
  if (categoryId) {
    const { data: category, error: categoryError } = await db
      .from("categories")
      .select("id, type, archived, household_default")
      .eq("household_id", householdId)
      .eq("id", categoryId)
      .maybeSingle();
    throwIf(categoryError);
    if (!category) throw new ServiceError("Categoria não encontrada.", "categoryId");
    if (category.type !== input.type) throw new ServiceError("A categoria não é deste tipo de lançamento.", "categoryId");
    if (category.archived && current?.category?.id !== categoryId) {
      throw new ServiceError("Esta categoria está arquivada.", "categoryId");
    }
    categoryHouseholdDefault = category.household_default;
  }

  const spentBy = input.type === "transfer" ? undefined : input.spentBy;
  if (spentBy) {
    const { data: member, error: memberError } = await db
      .from("profiles")
      .select("user_id")
      .eq("household_id", householdId)
      .eq("user_id", spentBy)
      .maybeSingle();
    throwIf(memberError);
    if (!member) throw new ServiceError("Escolha um membro da casa.", "spentBy");
  }
  return { categoryHouseholdDefault, cycles };
}

// Faturas de um lançamento (uma por linha): regra em lib/finance/billing (transactionInvoiceRefs).
function invoiceRefsFor(input: TransactionInput, cycles: Map<string, CardCycle | null>, count = 1) {
  return transactionInvoiceRefs({
    type: input.type,
    occurredOn: input.occurredOn,
    count,
    account: cycles.get(input.accountId) ?? null,
    transferTo: input.type === "transfer" ? (cycles.get(input.transferAccountId) ?? null) : null,
  });
}

// De quem é: transferência não é de ninguém; sem escolha explícita vale a regra única
// (categoria da casa → Casa; senão quem está lançando — no bot, quem mandou a mensagem).
function resolveSpentBy(input: TransactionInput, categoryHouseholdDefault: boolean, personUserId: string, fallback?: SpentBy): SpentBy {
  if (input.type === "transfer") return null;
  if (input.spentBy !== undefined) return input.spentBy;
  if (fallback !== undefined) return fallback;
  return defaultSpentBy({ categoryHouseholdDefault, personUserId });
}

function fields(input: TransactionInput) {
  return {
    type: input.type,
    account_id: input.accountId,
    transfer_account_id: input.type === "transfer" ? input.transferAccountId : null,
    category_id: input.type === "transfer" ? null : (input.categoryId ?? null),
    description: input.description ?? null,
  };
}

export type CreatedTransactions = { ids: string[]; groupId: string | null };

// Cria um lançamento. Despesa parcelada vira N linhas com o mesmo
// installment_group_id (um único insert: ou entram todas, ou nenhuma).
export async function createTransaction(
  db: Db,
  actor: Actor,
  input: TransactionInput,
  { source = "web" }: { source?: TxSource } = {},
): Promise<CreatedTransactions> {
  const { categoryHouseholdDefault, cycles } = await assertReferences(db, actor.householdId, input);
  const base = {
    ...fields(input),
    spent_by: resolveSpentBy(input, categoryHouseholdDefault, actor.userId),
    household_id: actor.householdId,
    created_by: actor.userId,
    source,
  };
  const count = input.type === "expense" ? input.installments : 1;

  const groupId = count > 1 ? crypto.randomUUID() : null;
  // Fatura gravada no lançamento; parcelas em faturas consecutivas.
  const refs = invoiceRefsFor(input, cycles, count);
  const rows =
    count > 1
      ? planInstallments(input.amountCents, count, input.occurredOn).map((p, i) => ({
          ...base,
          amount_cents: p.amountCents,
          occurred_on: p.occurredOn,
          installment_group_id: groupId,
          installment_number: p.number,
          installment_total: p.total,
          invoice_ref: refs[i] ?? null,
        }))
      : [{ ...base, amount_cents: input.amountCents, occurred_on: input.occurredOn, invoice_ref: refs[0] ?? null }];

  const { data, error } = await db.from("transactions").insert(rows).select("id");
  throwIf(error);
  return { ids: (data ?? []).map((row) => row.id), groupId };
}

// Edita um lançamento. Em parcelas, `scope = "following"` aplica conta, categoria,
// descrição e valor da parcela também às parcelas seguintes do grupo; a data só
// muda na parcela editada (cada parcela tem o seu mês).
//
// Fatura (invoice_ref): fica a gravada (ex.: a do arquivo importado), a não ser que mudem a
// data, a conta, o destino ou o tipo — aí é recalculada pela nova data (a tela avisa). Se a
// conta mudar nas parcelas seguintes, elas seguem em faturas consecutivas a partir desta.
export async function updateTransaction(
  db: Db,
  actor: Actor,
  transactionId: string,
  input: TransactionInput,
  scope: Scope = "one",
): Promise<void> {
  const current = await getTransaction(db, { householdId: actor.householdId, transactionId });
  if (!current || current.deletedAt) throw new ServiceError("Lançamento não encontrado.");
  if (current.installment && input.type !== "expense") {
    throw new ServiceError("Parcelas são sempre despesas.", "type");
  }
  const { categoryHouseholdDefault, cycles } = await assertReferences(db, actor.householdId, input, current);

  const shared = {
    ...fields(input),
    spent_by: resolveSpentBy(input, categoryHouseholdDefault, actor.userId, current.spentBy),
    amount_cents: input.amountCents,
  };
  const accountChanged =
    input.accountId !== current.account.id ||
    input.type !== current.type ||
    (input.type === "transfer" ? input.transferAccountId : null) !== (current.transferAccount?.id ?? null);
  const recompute = accountChanged || input.occurredOn !== current.occurredOn;
  const invoiceRef = recompute ? (invoiceRefsFor(input, cycles)[0] ?? null) : current.invoiceRef;
  const { error } = await db
    .from("transactions")
    .update({ ...shared, occurred_on: input.occurredOn, invoice_ref: invoiceRef })
    .eq("household_id", actor.householdId)
    .eq("id", transactionId);
  throwIf(error);

  if (scope === "following" && current.installment) {
    const following = () =>
      db
        .from("transactions")
        .update(shared)
        .eq("household_id", actor.householdId)
        .eq("installment_group_id", current.installment!.groupId)
        .gt("installment_number", current.installment!.number)
        .is("deleted_at", null);
    const { error: followingError } = await following();
    throwIf(followingError);

    // Conta trocada: as próximas parcelas vão para as faturas seguintes do novo cartão.
    if (accountChanged) {
      const { data: rows, error: rowsError } = await db
        .from("transactions")
        .select("id, installment_number")
        .eq("household_id", actor.householdId)
        .eq("installment_group_id", current.installment.groupId)
        .gt("installment_number", current.installment.number)
        .is("deleted_at", null);
      throwIf(rowsError);
      for (const row of rows ?? []) {
        const ref = invoiceRef ? addMonthsToRef(invoiceRef, (row.installment_number ?? 0) - current.installment.number) : null;
        const { error: refError } = await db
          .from("transactions")
          .update({ invoice_ref: ref })
          .eq("household_id", actor.householdId)
          .eq("id", row.id);
        throwIf(refError);
      }
    }
  }
}

async function setDeleted(
  db: Db,
  actor: Actor,
  transactionId: string,
  scope: Scope,
  deleted: boolean,
): Promise<number> {
  const current = await getTransaction(db, { householdId: actor.householdId, transactionId });
  if (!current) throw new ServiceError("Lançamento não encontrado.");

  let query = db
    .from("transactions")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("household_id", actor.householdId);
  if (scope === "following" && current.installment) {
    query = query
      .eq("installment_group_id", current.installment.groupId)
      .gte("installment_number", current.installment.number);
  } else {
    query = query.eq("id", transactionId);
  }
  query = deleted ? query.is("deleted_at", null) : query.not("deleted_at", "is", null);
  const { data, error } = await query.select("id");
  throwIf(error);
  return data?.length ?? 0;
}

// Soft delete: vai para a lixeira (e o bot pode "desfazer").
export const deleteTransaction = (db: Db, actor: Actor, transactionId: string, scope: Scope = "one") =>
  setDeleted(db, actor, transactionId, scope, true);

export const restoreTransaction = (db: Db, actor: Actor, transactionId: string, scope: Scope = "one") =>
  setDeleted(db, actor, transactionId, scope, false);
