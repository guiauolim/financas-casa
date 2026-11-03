import { addMonthsYM, toYearMonth, type YearMonth } from "./dates";
import { entriesInMonth, type LedgerEntry, type MonthOf, purchaseMonthOf } from "./ledger";

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

// Totais do mês. `monthOf` decide em que mês cada lançamento conta (data da compra ou fatura).
export function summarizeMonth(entries: readonly LedgerEntry[], month: YearMonth, monthOf: MonthOf = purchaseMonthOf): Summary {
  return summarize(entriesInMonth(entries, month, monthOf));
}

// Entradas e saídas dos `count` meses que terminam em `endMonth` (mais antigo primeiro).
export function monthlySeries(
  entries: readonly LedgerEntry[],
  endMonth: YearMonth,
  count = 6,
  monthOf: MonthOf = purchaseMonthOf,
): MonthTotals[] {
  return Array.from({ length: count }, (_, i) => {
    const ym = addMonthsYM(endMonth, i - count + 1);
    const { incomeCents, expenseCents } = summarizeMonth(entries, ym, monthOf);
    return { month: toYearMonth(ym), incomeCents, expenseCents };
  });
}

// Despesas do mês por categoria (null = sem categoria), maior gasto primeiro.
export function expensesByCategory(
  entries: readonly LedgerEntry[],
  month: YearMonth,
  monthOf: MonthOf = purchaseMonthOf,
): { categoryId: string | null; spentCents: number }[] {
  const totals = new Map<string | null, number>();
  for (const entry of entriesInMonth(entries, month, monthOf)) {
    if (entry.type !== "expense") continue;
    totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + entry.amountCents);
  }
  return [...totals.entries()]
    .map(([categoryId, spentCents]) => ({ categoryId, spentCents }))
    .sort((a, b) => b.spentCents - a.spentCents);
}

// Despesas do mês por pessoa (spent_by; null = Casa). Sempre inclui Casa e cada membro
// informado (com 0 se não gastou), na ordem: Casa, depois os membros.
export function expensesByPerson(
  entries: readonly LedgerEntry[],
  month: YearMonth,
  memberIds: readonly string[],
  monthOf: MonthOf = purchaseMonthOf,
): { spentBy: string | null; spentCents: number }[] {
  const totals = new Map<string | null, number>([[null, 0], ...memberIds.map((id) => [id, 0] as const)]);
  for (const entry of entriesInMonth(entries, month, monthOf)) {
    if (entry.type !== "expense") continue;
    // Membro que saiu da casa (spent_by virou null) ou desconhecido conta como Casa.
    const key = entry.spentBy && totals.has(entry.spentBy) ? entry.spentBy : null;
    totals.set(key, (totals.get(key) ?? 0) + entry.amountCents);
  }
  return [...totals.entries()].map(([spentBy, spentCents]) => ({ spentBy, spentCents }));
}
