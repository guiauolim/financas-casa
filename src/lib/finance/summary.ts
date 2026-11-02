import { addMonthsYM, monthRange, toYearMonth, type YearMonth } from "./dates";
import { inRange, type LedgerEntry } from "./ledger";

export type SummaryInput = { type: "expense" | "income" | "transfer"; amountCents: number };

export type Summary = { incomeCents: number; expenseCents: number; balanceCents: number; count: number };

// Totais de uma lista de lançamentos. Transferências (inclusive pagamento de fatura,
// que é transferência da conta para o cartão) não são entrada nem saída: o gasto já
// foi contado na compra.
export function summarize(items: readonly SummaryInput[]): Summary {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const item of items) {
    if (item.type === "income") incomeCents += item.amountCents;
    else if (item.type === "expense") expenseCents += item.amountCents;
  }
  return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents, count: items.length };
}

export type MonthTotals = { month: string; incomeCents: number; expenseCents: number }; // month "YYYY-MM"

// Entradas e saídas dos `count` meses que terminam em `endMonth` (mais antigo primeiro).
export function monthlySeries(entries: readonly LedgerEntry[], endMonth: YearMonth, count = 6): MonthTotals[] {
  return Array.from({ length: count }, (_, i) => {
    const ym = addMonthsYM(endMonth, i - count + 1);
    const range = monthRange(ym);
    const { incomeCents, expenseCents } = summarize(entries.filter((e) => inRange(e.occurredOn, range)));
    return { month: toYearMonth(ym), incomeCents, expenseCents };
  });
}

// Despesas do mês por categoria (null = sem categoria), maior gasto primeiro.
export function expensesByCategory(
  entries: readonly LedgerEntry[],
  month: YearMonth,
): { categoryId: string | null; spentCents: number }[] {
  const range = monthRange(month);
  const totals = new Map<string | null, number>();
  for (const entry of entries) {
    if (entry.type !== "expense" || !inRange(entry.occurredOn, range)) continue;
    totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + entry.amountCents);
  }
  return [...totals.entries()]
    .map(([categoryId, spentCents]) => ({ categoryId, spentCents }))
    .sort((a, b) => b.spentCents - a.spentCents);
}
