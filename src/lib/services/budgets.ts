import "server-only";
import {
  type BudgetContext,
  type BudgetRule,
  type EvaluatedBudget,
  evaluateBudget,
  type MonthProjection,
  monthProjection,
  weeklyByDay,
} from "@/lib/finance/budget";
import { invoiceByRef, invoiceLabel, refForNameMonth } from "@/lib/finance/billing";
import { toYearMonth, type YearMonth } from "@/lib/finance/dates";
import { type LedgerEntry, purchaseMonthOf as purchaseMonthOfFallback } from "@/lib/finance/ledger";
import { type MonthPlan, monthPlan } from "@/lib/finance/month-plan";
import { type CardPacing, cardPacing } from "@/lib/finance/pacing";
import { pendingOnAccount, type RecurringMonth, recurringMonth } from "@/lib/finance/recurring";
import { type BudgetInput, budgetColumns } from "@/lib/validation/budgets";
import { isUniqueViolation, ServiceError, throwIf } from "./errors";
import { entryInvoiceRef, invoiceMonthOf } from "@/lib/finance/spending-view";
import { type Account, type CycleCard, isCycleCard, listAccounts } from "./accounts";
import { listRecurringBills, type RecurringBillRow } from "./recurring-bills";
import { listLedger } from "./transactions";
import type { Actor, Db } from "./types";

export type Budget = BudgetRule & {
  category: { id: string; name: string; icon: string | null; archived: boolean } | null;
  account: { id: string; name: string; archived: boolean } | null;
};

const SELECT = `
  id, period, category_id, account_id, limit_cents,
  category:categories!budgets_category_id_fkey(id, name, icon, archived),
  account:accounts!budgets_account_id_fkey(id, name, archived)
`;

type Row = {
  id: string;
  period: BudgetRule["period"];
  category_id: string | null;
  account_id: string | null;
  limit_cents: number;
  category: Budget["category"];
  account: Budget["account"];
};

const toBudget = (row: Row): Budget => ({
  id: row.id,
  period: row.period,
  categoryId: row.category_id,
  accountId: row.account_id,
  limitCents: row.limit_cents,
  category: row.category,
  account: row.account,
});

export async function listBudgets(db: Db, { householdId }: { householdId: string }): Promise<Budget[]> {
  const { data, error } = await db
    .from("budgets")
    .select(SELECT)
    .eq("household_id", householdId)
    .order("created_at")
    .returns<Row[]>();
  throwIf(error);
  return (data ?? []).map(toBudget);
}

export async function getBudget(db: Db, { householdId, budgetId }: { householdId: string; budgetId: string }) {
  const { data, error } = await db
    .from("budgets")
    .select(SELECT)
    .eq("household_id", householdId)
    .eq("id", budgetId)
    .returns<Row[]>()
    .maybeSingle();
  throwIf(error);
  return data ? toBudget(data) : null;
}

// Categoria precisa ser de despesa e cartão precisa ser cartão, ambos da casa e ativos
// (a não ser que já fossem os do orçamento editado).
async function assertReferences(db: Db, householdId: string, input: BudgetInput, current?: Budget) {
  if (input.scope === "category") {
    const { data, error } = await db
      .from("categories")
      .select("id, type, archived")
      .eq("household_id", householdId)
      .eq("id", input.categoryId)
      .maybeSingle();
    throwIf(error);
    if (!data) throw new ServiceError("Categoria não encontrada.", "categoryId");
    if (data.type !== "expense") throw new ServiceError("Escolha uma categoria de despesa.", "categoryId");
    if (data.archived && current?.categoryId !== data.id) {
      throw new ServiceError("Esta categoria está arquivada.", "categoryId");
    }
  }
  if (input.scope === "card" || input.scope === "invoice") {
    const { data, error } = await db
      .from("accounts")
      .select("id, kind, archived, closing_day, due_day")
      .eq("household_id", householdId)
      .eq("id", input.accountId)
      .maybeSingle();
    throwIf(error);
    if (!data) throw new ServiceError("Cartão não encontrado.", "accountId");
    if (data.kind !== "credit_card") throw new ServiceError("Este limite é só para cartão de crédito.", "accountId");
    if (input.scope === "invoice" && (data.closing_day === null || data.due_day === null)) {
      throw new ServiceError("Cadastre o melhor dia de compra e o vencimento do cartão para usar o limite da fatura.", "accountId");
    }
    if (data.archived && current?.accountId !== data.id) {
      throw new ServiceError("Este cartão está arquivado.", "accountId");
    }
  }
}

const DUPLICATE: Record<BudgetInput["scope"], [string, string?]> = {
  total: ["Já existe um orçamento mensal da casa. Edite o existente.", "scope"],
  category: ["Já existe um orçamento para esta categoria.", "categoryId"],
  invoice: ["Já existe um limite da fatura para este cartão.", "accountId"],
  card: ["Já existe um limite semanal para este cartão.", "accountId"],
};

export async function createBudget(db: Db, actor: Actor, input: BudgetInput): Promise<string> {
  await assertReferences(db, actor.householdId, input);
  const { data, error } = await db
    .from("budgets")
    .insert({ ...budgetColumns(input), household_id: actor.householdId })
    .select("id")
    .single();
  if (isUniqueViolation(error)) throw new ServiceError(...DUPLICATE[input.scope]);
  throwIf(error);
  return data!.id;
}

export async function updateBudget(db: Db, actor: Actor, budgetId: string, input: BudgetInput): Promise<void> {
  const current = await getBudget(db, { householdId: actor.householdId, budgetId });
  if (!current) throw new ServiceError("Orçamento não encontrado.");
  await assertReferences(db, actor.householdId, input, current);
  const { error } = await db
    .from("budgets")
    .update(budgetColumns(input))
    .eq("household_id", actor.householdId)
    .eq("id", budgetId);
  if (isUniqueViolation(error)) throw new ServiceError(...DUPLICATE[input.scope]);
  throwIf(error);
}

export async function deleteBudget(db: Db, actor: Actor, budgetId: string): Promise<void> {
  const { data, error } = await db
    .from("budgets")
    .delete()
    .eq("household_id", actor.householdId)
    .eq("id", budgetId)
    .select("id");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Orçamento não encontrado.");
}

// ───────────────────────── Situação dos orçamentos ─────────────────────────

export type BudgetWithStatus = Budget & EvaluatedBudget;

export type BudgetStatusReport = {
  month: YearMonth;
  today: string;
  // Projeção do gasto total da casa no mês (existe mesmo sem orçamento mensal).
  projection: MonthProjection;
  total: BudgetWithStatus | null;
  categories: BudgetWithStatus[]; // mais usado (%) primeiro
  cards: (BudgetWithStatus & { days: { date: string; spentCents: number }[] })[];
  // Limite da fatura com o ritmo semanal (fatura com o nome do mês escolhido).
  invoices: InvoiceBudget[];
  // Contas fixas do mês (null = nenhuma cadastrada) e o plano do mês (sobra prevista).
  recurring: RecurringMonth<RecurringBillRow> | null;
  plan: MonthPlan;
};

export type InvoiceBudget = BudgetWithStatus & {
  invoiceRef: string;
  invoiceLabel: string; // "fatura de novembro de 2026"
  dueDate: string;
  pacing: CardPacing;
};

// Extras comprometidos por cartão/fatura (ex.: contas fixas no cartão ainda não lançadas).
export type CommittedExtras = (cardId: string, invoiceRef: string) => number;

export function invoicePacing(
  budget: BudgetWithStatus,
  card: CycleCard,
  ledger: readonly LedgerEntry[],
  { month, today }: { month: YearMonth; today: string },
  extras?: CommittedExtras,
): InvoiceBudget {
  const ref = refForNameMonth(toYearMonth(month), card.invoiceNaming, card);
  const invoice = invoiceByRef(ref, card);
  const invoiceEntries = ledger.filter((e) => e.accountId === card.id && entryInvoiceRef(e, card) === ref);
  return {
    ...budget,
    invoiceRef: ref,
    invoiceLabel: invoiceLabel(invoice, card.invoiceNaming),
    dueDate: invoice.dueDate,
    pacing: cardPacing({
      limitCents: budget.limitCents,
      cycle: { from: invoice.periodStart, to: invoice.periodEnd },
      today,
      invoiceEntries,
      extraCommittedCents: extras?.(card.id, ref) ?? 0,
    }),
  };
}

// Monta a situação a partir de dados já carregados (a Visão geral reaproveita o ledger).
export function buildBudgetStatus(
  budgets: readonly Budget[],
  ledger: readonly LedgerEntry[],
  context: BudgetContext & {
    accounts?: readonly Account[]; // todas as contas (cartões com ciclo têm limite da fatura)
    bills?: readonly RecurringBillRow[];
  },
): BudgetStatusReport {
  const { month, today, accounts = [], bills = [], monthOf = purchaseMonthOfFallback } = context;
  const evaluated = budgets.map((b) => ({ ...b, ...evaluateBudget(b, ledger, context) }));
  const cardById = new Map(accounts.filter(isCycleCard).map((c) => [c.id, c]));
  const recurring = bills.length ? recurringMonth(bills, ledger, { month, today, monthOf }) : null;
  // Contas fixas do cartão ainda não lançadas entram como comprometido na fatura do mês.
  const extras: CommittedExtras = (cardId) => (recurring ? pendingOnAccount(recurring, cardId) : 0);
  const invoices = evaluated.flatMap((b) => {
    const card = b.scope === "invoice" && b.accountId ? cardById.get(b.accountId) : undefined;
    return card ? [invoicePacing(b, card, ledger, { month, today }, extras)] : [];
  });
  return {
    month,
    today,
    projection: monthProjection(ledger, context),
    total: evaluated.find((b) => b.scope === "total") ?? null,
    categories: evaluated
      .filter((b) => b.scope === "category")
      .sort((a, b) => b.spentCents * a.limitCents - a.spentCents * b.limitCents || b.spentCents - a.spentCents),
    cards: evaluated
      .filter((b) => b.scope === "card")
      .map((b) => ({ ...b, days: weeklyByDay(ledger, today, b.accountId) }))
      .sort((a, b) => b.percent - a.percent),
    invoices,
    recurring,
    plan: monthPlan({
      entries: ledger,
      month,
      monthOf,
      cardIds: new Set(accounts.filter((a) => a.kind === "credit_card").map((a) => a.id)),
      invoiceLimits: new Map(invoices.map((b) => [b.accountId!, b.limitCents])),
      recurring,
    }),
  };
}

// Usado pela tela de Orçamentos e (Fase 7) pela tool get_budget_status do bot.
// No cartão, o gasto conta no mês da fatura (lib/finance/spending-view); o semanal, pela data.
export async function getBudgetStatus(
  db: Db,
  {
    householdId,
    month,
    today,
  }: { householdId: string; month: YearMonth; today: string },
): Promise<BudgetStatusReport> {
  const [budgets, ledger, accounts, bills] = await Promise.all([
    listBudgets(db, { householdId }),
    listLedger(db, { householdId }),
    listAccounts(db, { householdId, includeArchived: true }),
    listRecurringBills(db, { householdId }),
  ]);
  const cards = accounts.filter(isCycleCard);
  const monthOf = invoiceMonthOf(
    cards.map((c) => ({ id: c.id, closingDay: c.closingDay, dueDay: c.dueDay, naming: c.invoiceNaming })),
  );
  return buildBudgetStatus(budgets, ledger, { month, today, monthOf, accounts, bills });
}
