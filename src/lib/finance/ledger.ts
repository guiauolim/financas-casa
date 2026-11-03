import { toYearMonth, type YearMonth } from "./dates";

// Lançamento "leve" usado pelas regras de orçamento, saldo e fatura (sem joins).
// Só lançamentos não excluídos entram aqui (o serviço já filtra `deleted_at`).
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

// Mês ("YYYY-MM") em que um lançamento conta nos relatórios mensais. O padrão é o mês da data
// da compra; a visão "Por fatura" troca, no cartão, pelo mês da fatura (lib/finance/spending-view).
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
