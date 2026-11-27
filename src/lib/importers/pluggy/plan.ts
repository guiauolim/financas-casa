import { addMonthsToRef, type CardCycle, invoiceByDueMonth, invoiceFor, paymentInvoiceRef } from "@/lib/finance/billing";
import { categorize, findCategoryByName, type MerchantRule } from "@/lib/finance/categorize";
import { addDays, addMonthsToDate } from "@/lib/finance/dates";
import type { PluggyRole, PluggySourceKind } from "@/lib/finance/pluggy-links";
import { defaultSpentBy, type SpentBy } from "@/lib/finance/spent-by";
import { keyDescription, type PlanCategory, uuidFromKey } from "@/lib/importers/card-statement/plan";
import type { PluggyBill, PluggyInvestment, PluggyTransaction } from "@/lib/pluggy/client";

// Plano da sincronização com a Pluggy. Puro (sem banco nem rede): o serviço busca os dados da
// Pluggy e o estado do banco, chama esta função e grava o resultado. Rodar duas vezes com os
// mesmos dados não muda nada (o id do lançamento é derivado do id da Pluggy).
//
// Regras (ver CLAUDE.md, "Pluggy"):
// - Só a partir de `startDate`; antes fica o que já estava no sistema. No cartão, a partir da FATURA
//   que contém `startDate` (pega o fim do mês anterior que o banco pôs nela).
// - Conta corrente do cofre (role vault): saída → despesa, entrada → receita. Aplicação/resgate,
//   pix entre CPFs da casa e o débito do pagamento de fatura são internos → absorvidos (o
//   pagamento é contado no lado do cartão).
// - Cartão: compra/encargo → despesa; estorno/crédito → receita; pagamento → transferência
//   (conta pagadora → cartão), conciliada com um "Pagar fatura" já lançado quando houver (opção A).
// - Fatura: a do banco (billId → vencimento) quando fechada; senão a estimada pelo melhor dia.
// - Lançamento excluído pelo usuário não volta; categoria e pessoa editadas não são sobrescritas.

const toCents = (value: number) => Math.round(value * 100);
const day = (iso: string) => iso.slice(0, 10);

export type SyncLink = {
  id: string;
  sourceKind: PluggySourceKind;
  externalId: string;
  role: PluggyRole;
  accountId: string | null;
  ownerUserId: string | null;
};

export type SyncCard = CardCycle & {
  accountId: string;
  paymentAccountId: string | null; // conta que paga a fatura (já resolvida pelo serviço)
  holders: ReadonlyMap<string, string>; // final → user_id
};

export type ExistingExternal = {
  externalId: string;
  status: "linked" | "absorbed" | "ignored";
  transactionId: string | null;
  providerStatus: "PENDING" | "POSTED" | null;
  billId: string | null;
  linkId: string | null;
};

export type ExistingTx = {
  id: string;
  source: string;
  type: "expense" | "income" | "transfer";
  amountCents: number;
  occurredOn: string;
  accountId: string;
  transferAccountId: string | null;
  invoiceRef: string | null;
};

export type SourceData =
  | { linkId: string; kind: "bank_account"; balanceCents: number | null; transactions: PluggyTransaction[] }
  | { linkId: string; kind: "card"; transactions: PluggyTransaction[]; bills: PluggyBill[] }
  | { linkId: string; kind: "investments"; investments: PluggyInvestment[] };

export type SyncInput = {
  householdId: string;
  startDate: string;
  today: string;
  links: readonly SyncLink[];
  data: readonly SourceData[];
  cards: ReadonlyMap<string, SyncCard>; // por account_id do cartão
  categories: readonly PlanCategory[];
  rules: readonly MerchantRule[];
  householdDocs: ReadonlySet<string>; // CPFs da casa (só dígitos), só em memória
  institutions: ReadonlyMap<string, string>; // link de investimentos → nome do banco
  existing: ReadonlyMap<string, ExistingExternal>; // por externalId
  existingTx: ReadonlyMap<string, ExistingTx>; // lançamentos ligados + candidatos a conciliação
  // "Pagar fatura" lançados (transferências para cartão) a partir de startDate e ainda sem ligação.
  openPayments: readonly ExistingTx[];
};

export type NewTransaction = {
  id: string;
  account_id: string;
  transfer_account_id: string | null;
  category_id: string | null;
  type: "expense" | "income" | "transfer";
  amount_cents: number;
  description: string;
  occurred_on: string;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  spent_by: SpentBy;
  card_last_digits: string | null;
  invoice_ref: string | null;
};

export type TxPatch = { id: string; amount_cents?: number; occurred_on?: string; invoice_ref?: string | null };

export type ExternalRow = {
  external_id: string;
  link_id: string;
  transaction_id: string | null;
  status: "linked" | "absorbed" | "ignored";
  provider_status: "PENDING" | "POSTED" | null;
  bill_id: string | null;
  occurred_on: string;
};

export type InvestmentUpsert = {
  external_id: string;
  owner_user_id: string;
  name: string;
  asset_class: "fixed_income" | "treasury" | "stock" | "etf" | "fund" | "other";
  institution: string | null;
  quantity: number | null;
  value_cents: number;
  value_as_of: string;
  archived_on: string | null;
};

export type SyncPlan = {
  inserts: NewTransaction[];
  updates: TxPatch[];
  deletes: string[]; // ids de lançamentos source='pluggy' que sumiram da Pluggy (PENDING)
  externals: ExternalRow[];
  externalDeletes: string[];
  accountBalances: { accountId: string; cents: number }[];
  // Melhor dia de compra aprendido do banco (dia seguinte ao último fechamento), quando mudou.
  cardClosingDays: { accountId: string; closingDay: number }[];
  linkBalances: { linkId: string; cents: number | null }[];
  investments: InvestmentUpsert[];
  warnings: string[];
  counts: { created: number; updated: number; deleted: number; absorbed: number; reconciled: number; uncategorized: number };
};

const maxRef = (a: string, b: string | null) => (b && b > a ? b : a);

// Ciclo aprendido das faturas fechadas do banco: a última fechada (pela data de vencimento) e o
// melhor dia = dia seguinte ao fechamento dela. null se o banco não informou fechamento.
export function learnedCycle(
  bills: readonly PluggyBill[],
  card: CardCycle,
): { lastClosedRef: string; closingDay: number } | null {
  const last = [...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).at(-1);
  if (!last) return null;
  const lastClosedRef = invoiceByDueMonth(day(last.dueDate).slice(0, 7), card).ref;
  if (!last.billClosingDate) return { lastClosedRef, closingDay: card.closingDay };
  return { lastClosedRef, closingDay: Number(addDays(day(last.billClosingDate), 1).slice(8, 10)) };
}

// Primeira fatura que vem da Pluggy num cartão: a que contém a data do corte.
export const pluggyCardStartRef = (startDate: string, card: CardCycle) => invoiceFor(startDate, card).ref;

export const pluggyTxId = (householdId: string, externalId: string) => uuidFromKey(`pluggy|${householdId}|${externalId}`);

const counterpartDoc = (tx: PluggyTransaction) => {
  const side = tx.type === "DEBIT" ? tx.paymentData?.receiver : tx.paymentData?.payer;
  return side?.documentNumber?.value?.replace(/\D/g, "") || null;
};

const isInvestmentMove = (tx: PluggyTransaction) => {
  const op = tx.operationType ?? "";
  return /APLIC|RESGATE/.test(op) && !/RENDIMENTO/.test(op);
};
const FEE = /\b(IOF|ANUIDADE|JUROS|MULTA|ENCARGOS?|TARIFA)\b/i;
const CARD_PAYMENT_DESC = /pagamento|pagto/i;
const BANK_CARD_PAYMENT_DESC = /fatura/i;

export const isCardPayment = (tx: PluggyTransaction) =>
  tx.amount < 0 && (tx.operationType === "PAGAMENTO_FATURA" || CARD_PAYMENT_DESC.test(tx.description));

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);

const ASSET_CLASS: Record<string, InvestmentUpsert["asset_class"]> = {
  TREASURY: "treasury",
  CDB: "fixed_income",
  LCI: "fixed_income",
  LCA: "fixed_income",
  DEBENTURE: "fixed_income",
  STOCK: "stock",
  ETF: "etf",
  INVESTMENT_FUND: "fund",
};
const assetClassOf = (inv: PluggyInvestment): InvestmentUpsert["asset_class"] =>
  ASSET_CLASS[inv.subtype ?? ""] ??
  (inv.type === "FIXED_INCOME" ? "fixed_income" : inv.type === "MUTUAL_FUND" ? "fund" : inv.type === "EQUITY" ? "stock" : "other");

export function planPluggySync(input: SyncInput): SyncPlan {
  const { householdId, startDate, categories, rules, existing, existingTx } = input;
  const linksById = new Map(input.links.map((l) => [l.id, l]));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const usable = categories.filter((c) => !c.archived);
  const category = (type: "expense" | "income", name: string) =>
    findCategoryByName(usable.filter((c) => c.type === type), name)?.id ?? null;
  const feeCategory = category("expense", "Impostos e taxas");
  const refundCategory = category("income", "Reembolso");
  const salaryCategory = category("income", "Salário");
  const yieldCategory = category("income", "Rendimentos");
  const otherIncomeCategory = category("income", "Outras receitas");
  const otherExpenseCategory = category("expense", "Outros");

  const plan: SyncPlan = {
    inserts: [],
    updates: [],
    deletes: [],
    externals: [],
    externalDeletes: [],
    accountBalances: [],
    linkBalances: [],
    cardClosingDays: [],
    investments: [],
    warnings: [],
    counts: { created: 0, updated: 0, deleted: 0, absorbed: 0, reconciled: 0, uncategorized: 0 },
  };
  const seen = new Set<string>();
  const usedPayments = new Set<string>();
  const syncedLinkIds = new Set<string>();

  const pickCategory = (description: string, type: "expense" | "income") => {
    const result = categorize(description, { categories, rules, type });
    if (result.via !== "fallback" && result.categoryId) return result.categoryId;
    return type === "income" ? otherIncomeCategory : (result.categoryId ?? otherExpenseCategory);
  };

  // Pagamentos vindos dos cartões (para absorver o débito espelhado na conta corrente).
  const cardPayments: { amountCents: number; date: string }[] = [];
  for (const source of input.data) {
    if (source.kind !== "card") continue;
    for (const tx of source.transactions) {
      if (isCardPayment(tx)) cardPayments.push({ amountCents: toCents(Math.abs(tx.amount)), date: day(tx.date) });
    }
  }

  // Registra uma transação da Pluggy: nova, já existente (atualiza), excluída pelo usuário (pula).
  const record = (
    tx: PluggyTransaction,
    link: SyncLink,
    billId: string | null,
    build: () => { status: "linked" | "absorbed"; tx?: NewTransaction; reconcileWith?: string },
  ) => {
    seen.add(tx.id);
    const occurredOn = day(tx.date);
    const providerStatus = tx.status ?? null;
    const prior = existing.get(tx.id);
    const base = { external_id: tx.id, link_id: link.id, provider_status: providerStatus, bill_id: billId, occurred_on: occurredOn };

    if (prior) {
      if (prior.status === "linked" && prior.transactionId) {
        const current = existingTx.get(prior.transactionId);
        if (current && current.source === "pluggy") {
          const next = build();
          if (next.tx) {
            const patch: TxPatch = { id: current.id };
            if (next.tx.amount_cents !== current.amountCents) patch.amount_cents = next.tx.amount_cents;
            if (next.tx.occurred_on !== current.occurredOn) patch.occurred_on = next.tx.occurred_on;
            if (next.tx.invoice_ref !== current.invoiceRef) patch.invoice_ref = next.tx.invoice_ref;
            if (Object.keys(patch).length > 1) {
              plan.updates.push(patch);
              plan.counts.updated++;
            }
          }
        }
      }
      // Excluído pelo usuário (transactionId null), absorvido ou conciliado: só atualiza o estado.
      plan.externals.push({ ...base, transaction_id: prior.transactionId, status: prior.status });
      return;
    }

    const next = build();
    if (next.status === "absorbed") {
      plan.counts.absorbed++;
      plan.externals.push({ ...base, transaction_id: null, status: "absorbed" });
      return;
    }
    if (next.reconcileWith) {
      plan.counts.reconciled++;
      plan.externals.push({ ...base, transaction_id: next.reconcileWith, status: "linked" });
      return;
    }
    if (!next.tx) return;
    plan.inserts.push(next.tx);
    plan.counts.created++;
    if (next.tx.type === "expense" && next.tx.category_id === otherExpenseCategory) plan.counts.uncategorized++;
    plan.externals.push({ ...base, transaction_id: next.tx.id, status: "linked" });
  };

  const balances = new Map<string, number>();
  const addBalance = (accountId: string, cents: number) => balances.set(accountId, (balances.get(accountId) ?? 0) + cents);

  for (const source of input.data) {
    const link = linksById.get(source.linkId);
    if (!link || link.role === "ignore") continue;
    syncedLinkIds.add(link.id);

    // ───────────── Conta corrente do cofre ─────────────
    if (source.kind === "bank_account" && link.role === "vault" && link.accountId) {
      const accountId = link.accountId;
      plan.linkBalances.push({ linkId: link.id, cents: source.balanceCents });
      if (source.balanceCents != null) addBalance(accountId, source.balanceCents);
      for (const tx of source.transactions) {
        if (day(tx.date) < startDate) continue;
        record(tx, link, null, () => {
          const amountCents = toCents(Math.abs(tx.amount));
          const doc = counterpartDoc(tx);
          if (isInvestmentMove(tx) || (doc && input.householdDocs.has(doc))) return { status: "absorbed" };
          if (tx.type === "DEBIT") {
            const mirrorsCard = cardPayments.some(
              (p) => p.amountCents === amountCents && Math.abs(daysBetween(p.date, day(tx.date))) <= 5,
            );
            if (mirrorsCard || BANK_CARD_PAYMENT_DESC.test(tx.description)) return { status: "absorbed" };
          }
          const type = tx.type === "DEBIT" ? "expense" : "income";
          const op = tx.operationType ?? "";
          const categoryId =
            type === "income" && op.includes("RENDIMENTO") && yieldCategory
              ? yieldCategory
              : type === "income" && op === "FOLHA_PAGAMENTO" && salaryCategory
                ? salaryCategory
                : pickCategory(tx.description, type);
          return {
            status: "linked",
            tx: {
              id: pluggyTxId(householdId, tx.id),
              account_id: accountId,
              transfer_account_id: null,
              category_id: categoryId,
              type,
              amount_cents: amountCents,
              description: tx.description,
              occurred_on: day(tx.date),
              installment_group_id: null,
              installment_number: null,
              installment_total: null,
              spent_by: defaultSpentBy({
                categoryHouseholdDefault: categoryId ? byId.get(categoryId)?.householdDefault : false,
                personUserId: link.ownerUserId,
              }),
              card_last_digits: null,
              invoice_ref: null,
            },
          };
        });
      }
      continue;
    }

    // ───────────── Cartão ─────────────
    if (source.kind === "card" && link.role === "card" && link.accountId) {
      const card = input.cards.get(link.accountId);
      if (!card) {
        plan.warnings.push("Cartão ligado sem melhor dia de compra/vencimento cadastrado: não sincronizado.");
        continue;
      }
      const bills = new Map(source.bills.map((b) => [b.id, b]));
      // O fechamento vem do banco: o melhor dia da estimativa é o dia seguinte ao último fechamento
      // informado (varia de mês a mês), e nada sem fatura do banco cai numa fatura já fechada.
      const learned = learnedCycle(source.bills, card);
      const estimateCycle = learned ? { ...card, closingDay: learned.closingDay } : card;
      if (learned && learned.closingDay !== card.closingDay) {
        plan.cardClosingDays.push({ accountId: card.accountId, closingDay: learned.closingDay });
      }
      // No cartão o corte é pela FATURA: entra tudo da fatura que contém startDate em diante
      // (compras do fim do mês anterior que o banco pôs nela, ex.: 26 a 31/10 na de novembro).
      const startRef = pluggyCardStartRef(startDate, card);
      for (const tx of source.transactions) {
        const occurredOn = day(tx.date);
        const meta = tx.creditCardMetadata;
        const bill = meta?.billId ? bills.get(meta.billId) : undefined;
        const billId = bill ? bill.id : null;
        const amountCents = toCents(Math.abs(tx.amount));
        const last4 = meta?.cardNumber?.replace(/\D/g, "").slice(-4) || null;
        // Fatura do banco (billId → vencimento) quando fechada; senão a estimada pelo melhor dia.
        const invoiceRef = bill
          ? invoiceByDueMonth(day(bill.dueDate).slice(0, 7), card).ref
          : maxRef(invoiceFor(occurredOn, estimateCycle).ref, learned ? addMonthsToRef(learned.lastClosedRef, 1) : null);

        if (isCardPayment(tx)) {
          // Pagamento: pela data (o de antes do corte paga uma fatura que já estava no sistema).
          if (occurredOn < startDate) continue;
          record(tx, link, billId, () => {
            const match = input.openPayments.find(
              (p) =>
                !usedPayments.has(p.id) &&
                p.transferAccountId === card.accountId &&
                p.amountCents === amountCents &&
                Math.abs(daysBetween(p.occurredOn, occurredOn)) <= 5,
            );
            if (match) {
              usedPayments.add(match.id);
              return { status: "linked", reconcileWith: match.id };
            }
            if (!card.paymentAccountId) {
              plan.warnings.push("Pagamento de fatura sem conta pagadora: escolha a conta que paga o cartão.");
              return { status: "absorbed" };
            }
            return {
              status: "linked",
              tx: {
                id: pluggyTxId(householdId, tx.id),
                account_id: card.paymentAccountId,
                transfer_account_id: card.accountId,
                category_id: null,
                type: "transfer",
                amount_cents: amountCents,
                description: tx.description,
                occurred_on: occurredOn,
                installment_group_id: null,
                installment_number: null,
                installment_total: null,
                spent_by: null,
                card_last_digits: null,
                invoice_ref: paymentInvoiceRef(occurredOn, card),
              },
            };
          });
          continue;
        }

        if (invoiceRef < startRef) continue;
        record(tx, link, billId, () => {
          const type = tx.amount < 0 ? "income" : "expense";
          const categoryId =
            type === "expense" && FEE.test(tx.description) && feeCategory
              ? feeCategory
              : type === "income"
                ? (() => {
                    const result = categorize(tx.description, { categories, rules, type: "income" });
                    return result.via !== "fallback" && result.categoryId ? result.categoryId : (refundCategory ?? otherIncomeCategory);
                  })()
                : pickCategory(tx.description, "expense");
          const total = meta?.totalInstallments && meta.totalInstallments > 1 ? meta.totalInstallments : null;
          const number = total ? (meta?.installmentNumber ?? null) : null;
          const purchaseDate = meta?.purchaseDate
            ? day(meta.purchaseDate)
            : number
              ? addMonthsToDate(occurredOn, -(number - 1))
              : occurredOn;
          return {
            status: "linked",
            tx: {
              id: pluggyTxId(householdId, tx.id),
              account_id: card.accountId,
              transfer_account_id: null,
              category_id: categoryId,
              type,
              amount_cents: amountCents,
              description: tx.description,
              occurred_on: occurredOn,
              installment_group_id: total
                ? uuidFromKey(`pluggy|${householdId}|${link.externalId}|${last4 ?? ""}|${purchaseDate}|${keyDescription(tx.description.replace(/\s*\d{1,2}\/\d{1,2}\s*$/, ""))}|${total}`)
                : null,
              installment_number: number,
              installment_total: total,
              spent_by: defaultSpentBy({
                categoryHouseholdDefault: categoryId ? byId.get(categoryId)?.householdDefault : false,
                personUserId: (last4 ? card.holders.get(last4) : undefined) ?? link.ownerUserId,
              }),
              card_last_digits: last4,
              invoice_ref: invoiceRef,
            },
          };
        });
      }
      continue;
    }

    // ───────────── Investimentos ─────────────
    if (source.kind === "investments") {
      const active = source.investments.filter((i) => i.status !== "TOTAL_WITHDRAWAL");
      const activeCents = active.reduce((sum, i) => sum + toCents(i.balance ?? 0), 0);
      if (link.role === "reserve" && link.accountId) {
        plan.linkBalances.push({ linkId: link.id, cents: activeCents });
        addBalance(link.accountId, activeCents);
        continue;
      }
      if (link.role === "investments") {
        plan.linkBalances.push({ linkId: link.id, cents: activeCents });
        if (!link.ownerUserId) {
          plan.warnings.push("Investimentos sem dono: escolha de quem é o login em Configurações → Bancos.");
          continue;
        }
        // Uma aplicação por compra na Pluggy → um ativo por título (nome + vencimento).
        const groups = new Map<string, PluggyInvestment[]>();
        for (const inv of source.investments) {
          const key = `${keyDescription(inv.name)}|${inv.dueDate ? day(inv.dueDate) : ""}`;
          groups.set(key, [...(groups.get(key) ?? []), inv]);
        }
        for (const [key, list] of groups) {
          const live = list.filter((i) => i.status !== "TOTAL_WITHDRAWAL");
          const dates = list.map((i) => (i.date ? day(i.date) : input.today)).sort();
          const asOf = dates.at(-1) ?? input.today;
          const quantities = live.map((i) => i.quantity).filter((q): q is number => q != null);
          plan.investments.push({
            external_id: `pluggy:${key}`,
            owner_user_id: link.ownerUserId,
            name: list[0]!.name,
            asset_class: assetClassOf(list[0]!),
            institution: input.institutions.get(link.id) ?? null,
            quantity: quantities.length ? quantities.reduce((a, b) => a + b, 0) : null,
            value_cents: live.reduce((sum, i) => sum + toCents(i.balance ?? 0), 0),
            value_as_of: asOf > input.today ? input.today : asOf,
            archived_on: live.length === 0 ? (asOf > input.today ? input.today : asOf) : null,
          });
        }
      }
    }
  }

  // PENDING que sumiu da Pluggy (compra cancelada, ou trocada pela definitiva): sai do sistema.
  for (const prior of existing.values()) {
    if (seen.has(prior.externalId) || !prior.linkId || !syncedLinkIds.has(prior.linkId)) continue;
    if (prior.providerStatus !== "PENDING") continue;
    plan.externalDeletes.push(prior.externalId);
    const tx = prior.transactionId ? existingTx.get(prior.transactionId) : undefined;
    if (tx && tx.source === "pluggy") {
      plan.deletes.push(tx.id);
      plan.counts.deleted++;
    }
  }

  plan.accountBalances = [...balances].map(([accountId, cents]) => ({ accountId, cents }));
  return plan;
}

// Melhor dia de compra sugerido pelas faturas fechadas. Entre duas faturas seguidas, o melhor dia
// fica depois da última compra à vista de uma e até a primeira compra da seguinte. Se as faturas
// concordam (maior "depois" ≤ menor "até"), pega o meio; se o banco variou o fechamento, a mediana
// do dia seguinte à última compra. null sem dados suficientes.
export function suggestClosingDay(transactions: readonly PluggyTransaction[], bills: readonly PluggyBill[]): number | null {
  const range = new Map<string, { first: string; last: string }>();
  for (const tx of transactions) {
    const meta = tx.creditCardMetadata;
    if (!meta?.billId || tx.amount <= 0 || (meta.totalInstallments ?? 1) > 1) continue;
    const date = day(tx.date);
    const r = range.get(meta.billId);
    range.set(meta.billId, r ? { first: r.first < date ? r.first : date, last: r.last > date ? r.last : date } : { first: date, last: date });
  }
  const ordered = [...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((b) => range.get(b.id));
  const after: number[] = [];
  const until: number[] = [];
  for (let i = 0; i + 1 < ordered.length; i++) {
    const cur = ordered[i];
    const next = ordered[i + 1];
    if (!cur || !next) continue;
    after.push(Number(addDays(cur.last, 1).slice(8, 10)));
    until.push(Number(next.first.slice(8, 10)));
  }
  if (after.length < 2) return null;
  const lower = Math.max(...after);
  const upper = Math.min(...until);
  if (lower <= upper) return Math.ceil((lower + upper) / 2);
  const sorted = [...after].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}
