import "server-only";
import { monthRange, type YearMonth } from "@/lib/finance/dates";
import { planInstallments } from "@/lib/finance/installments";
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
  deletedAt: string | null;
  account: { id: string; name: string; kind: AccountKind };
  transferAccount: { id: string; name: string; kind: AccountKind } | null;
  category: { id: string; name: string; icon: string | null } | null;
  installment: { groupId: string; number: number; total: number } | null;
};

const SELECT = `
  id, type, amount_cents, description, occurred_on, source, created_by, deleted_at, created_at,
  installment_group_id, installment_number, installment_total,
  account:accounts!transactions_account_id_fkey(id, name, kind),
  transfer_account:accounts!transactions_transfer_account_id_fkey(id, name, kind),
  category:categories!transactions_category_id_fkey(id, name, icon),
  creator:profiles!transactions_created_by_fkey(display_name)
`;

type Row = {
  id: string;
  type: TxType;
  amount_cents: number;
  description: string | null;
  occurred_on: string;
  source: TxSource;
  created_by: string | null;
  deleted_at: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  account: { id: string; name: string; kind: AccountKind } | null;
  transfer_account: { id: string; name: string; kind: AccountKind } | null;
  category: { id: string; name: string; icon: string | null } | null;
  creator: { display_name: string } | null;
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
    deletedAt: row.deleted_at,
    account: row.account ?? { id: "", name: "—", kind: "checking" },
    transferAccount: row.transfer_account,
    category: row.category,
    installment:
      row.installment_group_id && row.installment_number && row.installment_total
        ? { groupId: row.installment_group_id, number: row.installment_number, total: row.installment_total }
        : null,
  };
}

export type ListFilters = {
  householdId: string;
  month: YearMonth;
  accountId?: string;
  categoryId?: string;
  createdBy?: string;
};

export async function listTransactions(db: Db, filters: ListFilters): Promise<Transaction[]> {
  const { from, to } = monthRange(filters.month);
  let query = db
    .from("transactions")
    .select(SELECT)
    .eq("household_id", filters.householdId)
    .is("deleted_at", null)
    .gte("occurred_on", from)
    .lte("occurred_on", to);
  // Filtro por conta inclui transferências que chegam nela (ex.: pagamento de fatura no cartão).
  if (filters.accountId) {
    query = query.or(`account_id.eq.${filters.accountId},transfer_account_id.eq.${filters.accountId}`);
  }
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.createdBy) query = query.eq("created_by", filters.createdBy);
  const { data, error } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<Row[]>();
  throwIf(error);
  return (data ?? []).map(toTransaction);
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
  return data ? toTransaction(data) : null;
}

// Confere no servidor que conta, destino e categoria são da casa, estão ativos
// (a não ser que já fossem os da transação editada) e combinam com o tipo.
async function assertReferences(
  db: Db,
  householdId: string,
  input: TransactionInput,
  current?: Transaction,
): Promise<void> {
  const accountIds = [input.accountId, input.type === "transfer" ? input.transferAccountId : null].filter(
    (id): id is string => Boolean(id),
  );
  const { data: accounts, error } = await db
    .from("accounts")
    .select("id, kind, archived")
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

  const categoryId = input.type === "transfer" ? undefined : input.categoryId;
  if (categoryId) {
    const { data: category, error: categoryError } = await db
      .from("categories")
      .select("id, type, archived")
      .eq("household_id", householdId)
      .eq("id", categoryId)
      .maybeSingle();
    throwIf(categoryError);
    if (!category) throw new ServiceError("Categoria não encontrada.", "categoryId");
    if (category.type !== input.type) throw new ServiceError("A categoria não é deste tipo de lançamento.", "categoryId");
    if (category.archived && current?.category?.id !== categoryId) {
      throw new ServiceError("Esta categoria está arquivada.", "categoryId");
    }
  }
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
  await assertReferences(db, actor.householdId, input);
  const base = { ...fields(input), household_id: actor.householdId, created_by: actor.userId, source };
  const count = input.type === "expense" ? input.installments : 1;

  const groupId = count > 1 ? crypto.randomUUID() : null;
  const rows =
    count > 1
      ? planInstallments(input.amountCents, count, input.occurredOn).map((p) => ({
          ...base,
          amount_cents: p.amountCents,
          occurred_on: p.occurredOn,
          installment_group_id: groupId,
          installment_number: p.number,
          installment_total: p.total,
        }))
      : [{ ...base, amount_cents: input.amountCents, occurred_on: input.occurredOn }];

  const { data, error } = await db.from("transactions").insert(rows).select("id");
  throwIf(error);
  return { ids: (data ?? []).map((row) => row.id), groupId };
}

// Edita um lançamento. Em parcelas, `scope = "following"` aplica conta, categoria,
// descrição e valor da parcela também às parcelas seguintes do grupo; a data só
// muda na parcela editada (cada parcela tem o seu mês).
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
  await assertReferences(db, actor.householdId, input, current);

  const shared = { ...fields(input), amount_cents: input.amountCents };
  const { error } = await db
    .from("transactions")
    .update({ ...shared, occurred_on: input.occurredOn })
    .eq("household_id", actor.householdId)
    .eq("id", transactionId);
  throwIf(error);

  if (scope === "following" && current.installment) {
    const { error: followingError } = await db
      .from("transactions")
      .update(shared)
      .eq("household_id", actor.householdId)
      .eq("installment_group_id", current.installment.groupId)
      .gt("installment_number", current.installment.number)
      .is("deleted_at", null);
    throwIf(followingError);
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
