import { addDays, compareYM, daysInMonth, monthRange, parseISODate, weekRange, yearMonthOf, type YearMonth } from "./dates";
import { type DateRange, entriesInMonth, inRange, type LedgerEntry, type MonthOf, purchaseMonthOf } from "./ledger";

// Regras de orçamento.
//
// - Gasto considerado = despesas (type "expense"). No mensal, o mês de cada despesa vem de
//   `monthOf`: no sistema, o cartão conta no mês da fatura (`invoiceMonthOf`, lib/finance/spending-view);
//   sem `monthOf`, pela data da compra (cada parcela no mês da própria data).
//   Transferências (inclusive pagamento de fatura) e receitas nunca contam: o gasto
//   no cartão já foi contado na compra.
// - Mensal: total da casa (sem categoria) ou por categoria, no mês.
// - Semanal: por cartão, semana de segunda a domingo, sempre pela data da compra.
// - Status: ok (< 80%), atenção (80% a 100%), estourado (> 100%).

export type BudgetPeriod = "monthly" | "weekly";
export type BudgetStatus = "ok" | "attention" | "over";

export type BudgetRule = {
  id: string;
  period: BudgetPeriod;
  categoryId: string | null;
  accountId: string | null;
  limitCents: number;
};

export type BudgetScope = "total" | "category" | "card";

export function budgetScope(budget: Pick<BudgetRule, "period" | "categoryId">): BudgetScope {
  if (budget.period === "weekly") return "card";
  return budget.categoryId ? "category" : "total";
}

export type BudgetProgress = {
  spentCents: number;
  limitCents: number;
  percent: number; // 0–∞, arredondado para baixo (99,9% ainda é 99)
  status: BudgetStatus;
  remainingCents: number; // quanto ainda dá para gastar (0 se estourou)
  overCents: number; // quanto passou do limite (0 se não estourou)
};

export const ATTENTION_RATIO = 0.8;

export function budgetStatus(spentCents: number, limitCents: number): BudgetProgress {
  if (!(limitCents > 0)) throw new RangeError("O limite precisa ser maior que zero.");
  // Comparações em inteiros: spent * 100 vs limit * 80 (sem float nas fronteiras).
  const status: BudgetStatus =
    spentCents > limitCents ? "over" : spentCents * 100 >= limitCents * 80 ? "attention" : "ok";
  return {
    spentCents,
    limitCents,
    percent: Math.floor((spentCents * 100) / limitCents),
    status,
    remainingCents: Math.max(0, limitCents - spentCents),
    overCents: Math.max(0, spentCents - limitCents),
  };
}

export type SpentFilter = DateRange & { categoryId?: string | null; accountId?: string | null };

export function expenseSpent(entries: readonly LedgerEntry[], filter: SpentFilter): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.type !== "expense" || !inRange(entry.occurredOn, filter)) continue;
    if (filter.categoryId && entry.categoryId !== filter.categoryId) continue;
    if (filter.accountId && entry.accountId !== filter.accountId) continue;
    total += entry.amountCents;
  }
  return total;
}

// Despesas que contam no mês (pelo `monthOf`), opcionalmente só de uma categoria.
export function monthExpenseSpent(
  entries: readonly LedgerEntry[],
  month: YearMonth,
  { categoryId, monthOf = purchaseMonthOf }: { categoryId?: string | null; monthOf?: MonthOf } = {},
): number {
  let total = 0;
  for (const entry of entriesInMonth(entries, month, monthOf)) {
    if (entry.type !== "expense") continue;
    if (categoryId && entry.categoryId !== categoryId) continue;
    total += entry.amountCents;
  }
  return total;
}

export type BudgetContext = { month: YearMonth; today: string; monthOf?: MonthOf };

// Período avaliado: o mês selecionado (mensal) ou a semana de `today` (semanal).
export function budgetRange(budget: Pick<BudgetRule, "period">, { month, today }: { month: YearMonth; today: string }) {
  return budget.period === "weekly" ? weekRange(today) : monthRange(month);
}

export type EvaluatedBudget = BudgetRule & { scope: BudgetScope; range: DateRange } & BudgetProgress;

export function evaluateBudget(budget: BudgetRule, entries: readonly LedgerEntry[], context: BudgetContext): EvaluatedBudget {
  const range = budgetRange(budget, context);
  const spent =
    budget.period === "weekly"
      ? expenseSpent(entries, { ...range, accountId: budget.accountId })
      : monthExpenseSpent(entries, context.month, { categoryId: budget.categoryId, monthOf: context.monthOf });
  return { ...budget, scope: budgetScope(budget), range, ...budgetStatus(spent, budget.limitCents) };
}

export function evaluateBudgets(
  budgets: readonly BudgetRule[],
  entries: readonly LedgerEntry[],
  context: BudgetContext,
): EvaluatedBudget[] {
  return budgets.map((budget) => evaluateBudget(budget, entries, context));
}

// Gasto por dia da semana (segunda → domingo) na semana de `today`, opcionalmente só de um cartão.
export function weeklyByDay(
  entries: readonly LedgerEntry[],
  today: string,
  accountId?: string | null,
): { date: string; spentCents: number }[] {
  const { from } = weekRange(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(from, i);
    return { date, spentCents: expenseSpent(entries, { from: date, to: date, accountId }) };
  });
}

export type MonthProjection =
  | { kind: "past"; projectedCents: number } // mês fechado: o gasto real
  | { kind: "future" } // mês que ainda não começou
  | { kind: "too-early" } // dia 1: pouco dado para extrapolar
  | { kind: "current"; projectedCents: number; daysElapsed: number; daysInMonth: number };

// Projeção do mês no ritmo atual: gasto até hoje / dias passados × dias do mês.
// - `daysElapsed` inclui hoje (no dia 15, 15 dias).
// - No dia 1 não projeta (um mercado no dia 1 viraria 30 mercados).
// - Nunca fica abaixo do que já está lançado no mês (ex.: parcelas com data futura).
// - Contando por fatura, o que conta no mês mas tem data anterior a ele (compras do fim do mês
//   passado e parcelas antigas na fatura) entra fixo, sem ser extrapolado.
export function monthProjection(
  entries: readonly LedgerEntry[],
  { month, today, categoryId, monthOf = purchaseMonthOf }: BudgetContext & { categoryId?: string | null },
): MonthProjection {
  const range = monthRange(month);
  const inMonth = entriesInMonth(entries, month, monthOf).filter(
    (e) => e.type === "expense" && (!categoryId || e.categoryId === categoryId),
  );
  const monthSpent = inMonth.reduce((sum, e) => sum + e.amountCents, 0);
  const todayYM = yearMonthOf(today);
  const cmp = compareYM(month, todayYM);
  if (cmp < 0) return { kind: "past", projectedCents: monthSpent };
  if (cmp > 0) return { kind: "future" };

  const day = parseISODate(today)!.day;
  if (day === 1) return { kind: "too-early" };
  const total = daysInMonth(month.year, month.month);
  let carriedIn = 0;
  let spentToDate = 0;
  for (const e of inMonth) {
    if (e.occurredOn < range.from) carriedIn += e.amountCents;
    else if (e.occurredOn <= today) spentToDate += e.amountCents;
  }
  // Arredonda para o centavo mais próximo; inteiros até aqui.
  const paced = carriedIn + Math.round((spentToDate * total) / day);
  return { kind: "current", projectedCents: Math.max(paced, monthSpent), daysElapsed: day, daysInMonth: total };
}

export const projectedCents = (projection: MonthProjection): number | null =>
  projection.kind === "past" || projection.kind === "current" ? projection.projectedCents : null;

// Gasto da semana até hoje vs. o mesmo trecho da semana anterior (segunda até o mesmo dia).
export function weekToDate(entries: readonly LedgerEntry[], today: string): { currentCents: number; previousCents: number } {
  const { from } = weekRange(today);
  return {
    currentCents: expenseSpent(entries, { from, to: today }),
    previousCents: expenseSpent(entries, { from: addDays(from, -7), to: addDays(today, -7) }),
  };
}
