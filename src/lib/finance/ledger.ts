import { toYearMonth, type YearMonth } from "./dates";

// Lançamento "leve" usado pelas regras de orçamento, saldo e fatura (sem joins).
export type LedgerEntry = {
  type: "expense" | "income" | "transfer";
  amountCents: number;
  occurredOn: string; // "YYYY-MM-DD" (America/Sao_Paulo)
  accountId: string;
  transferAccountId: string | null;
  categoryId: string | null;
  spentBy?: string | null; // de quem é (null = Casa)
  // Fatura gravada no lançamento ("YYYY-MM" do fechamento): no cartão, a fatura da compra; num
  // pagamento (transferência para o cartão), a fatura paga. null/ausente = calcular pela data.
  invoiceRef?: string | null;
};

export type DateRange = { from: string; to: string }; // inclusivo

export const inRange = (date: string, { from, to }: DateRange) => date >= from && date <= to;

// Mês ("YYYY-MM") em que um lançamento conta nos relatórios mensais. Os serviços usam sempre
// `invoiceMonthOf` (no cartão, o mês da fatura — lib/finance/spending-view); `purchaseMonthOf`
// (mês da data da compra) é o padrão das funções puras e fica para uso interno.
export type MonthOf = (entry: LedgerEntry) => string;

export const purchaseMonthOf: MonthOf = (entry) => entry.occurredOn.slice(0, 7);

export function entriesInMonth<T extends LedgerEntry>(
  entries: readonly T[],
  month: YearMonth,
  monthOf: MonthOf = purchaseMonthOf,
): T[] {
  const key = toYearMonth(month);
  return entries.filter((entry) => monthOf(entry) === key);
}

// Período dos relatórios da Visão geral: um mês, ou "Todos os meses" = todos até `until`
// (inclusive; parcelas de meses futuros ficam de fora).
export type Period = YearMonth | { until: YearMonth };

export const isAllMonths = (period: Period): period is { until: YearMonth } => "until" in period;

export function entriesInPeriod<T extends LedgerEntry>(
  entries: readonly T[],
  period: Period,
  monthOf: MonthOf = purchaseMonthOf,
): T[] {
  if (!isAllMonths(period)) return entriesInMonth(entries, period, monthOf);
  const until = toYearMonth(period.until);
  return entries.filter((entry) => monthOf(entry) <= until);
}

// Primeiro mês ("YYYY-MM") com lançamento até `until`, ou null se não houver.
export function firstMonthOf(entries: readonly LedgerEntry[], until: YearMonth, monthOf: MonthOf = purchaseMonthOf): string | null {
  const last = toYearMonth(until);
  let first: string | null = null;
  for (const entry of entries) {
    const month = monthOf(entry);
    if (month <= last && (first === null || month < first)) first = month;
  }
  return first;
}
