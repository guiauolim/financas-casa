// Lançamento "leve" usado pelas regras de orçamento, saldo e fatura (sem joins).
// Só lançamentos não excluídos entram aqui (o serviço já filtra `deleted_at`).
export type LedgerEntry = {
  type: "expense" | "income" | "transfer";
  amountCents: number;
  occurredOn: string; // "YYYY-MM-DD" (America/Sao_Paulo)
  accountId: string;
  transferAccountId: string | null;
  categoryId: string | null;
};

export type DateRange = { from: string; to: string }; // inclusivo

export const inRange = (date: string, { from, to }: DateRange) => date >= from && date <= to;
