import { clampedDate, type YearMonth } from "./dates";
import type { LedgerEntry, MonthOf } from "./ledger";

// Contas fixas (aluguel, luz, internet, assinaturas): o previsto de todo mês.
//
// - Nada é lançado sozinho: "Lançar" cria o lançamento ligado (`recurringBillId`).
// - Paga no mês = existe lançamento ligado que conta no mês pela regra do sistema (`monthOf`:
//   no cartão, a fatura; o resto, a data).
// - Prevista = sem lançamento ligado e o vencimento ainda não passou; atrasada = passou.
// - Vencimento = dia `dueDay` do mês (31 em mês curto = último dia).

export type RecurringBill = {
  id: string;
  name: string;
  categoryId: string;
  accountId: string;
  amountCents: number; // previsto
  dueDay: number;
  spentBy: string | null;
  active: boolean;
};

export type BillStatus = "paid" | "pending" | "late";

export type BillMonth<B extends RecurringBill = RecurringBill> = {
  bill: B;
  dueDate: string;
  status: BillStatus;
  paidCents: number; // soma dos lançamentos ligados no mês
  paidOn: string | null; // data do último lançamento ligado
};

export type RecurringMonth<B extends RecurringBill = RecurringBill> = {
  items: BillMonth<B>[]; // atrasadas, previstas (por vencimento) e pagas
  expectedCents: number; // pagas (valor lançado) + não pagas (valor previsto)
  paidCents: number;
  pendingCents: number; // previsto das que faltam lançar
};

export type BillEntry = Pick<LedgerEntry, "type" | "amountCents" | "occurredOn" | "accountId" | "invoiceRef"> & {
  recurringBillId?: string | null;
};

const ORDER: Record<BillStatus, number> = { late: 0, pending: 1, paid: 2 };

export function recurringMonth<B extends RecurringBill>(
  bills: readonly B[],
  entries: readonly BillEntry[],
  { month, today, monthOf }: { month: YearMonth; today: string; monthOf: MonthOf },
): RecurringMonth<B> {
  const key = `${month.year}-${String(month.month).padStart(2, "0")}`;
  const linked = new Map<string, { cents: number; last: string }>();
  for (const e of entries) {
    if (!e.recurringBillId || e.type !== "expense") continue;
    if (monthOf({ ...e, transferAccountId: null, categoryId: null }) !== key) continue;
    const current = linked.get(e.recurringBillId);
    linked.set(e.recurringBillId, {
      cents: (current?.cents ?? 0) + e.amountCents,
      last: current && current.last > e.occurredOn ? current.last : e.occurredOn,
    });
  }

  const items = bills
    .filter((bill) => bill.active || linked.has(bill.id))
    .map((bill): BillMonth<B> => {
      const dueDate = clampedDate(month, bill.dueDay);
      const paid = linked.get(bill.id);
      const status: BillStatus = paid ? "paid" : dueDate < today ? "late" : "pending";
      return { bill, dueDate, status, paidCents: paid?.cents ?? 0, paidOn: paid?.last ?? null };
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.dueDate.localeCompare(b.dueDate) || a.bill.name.localeCompare(b.bill.name, "pt-BR"));

  let paidCents = 0;
  let pendingCents = 0;
  for (const item of items) {
    if (item.status === "paid") paidCents += item.paidCents;
    else pendingCents += item.bill.amountCents;
  }
  return { items, expectedCents: paidCents + pendingCents, paidCents, pendingCents };
}

// Previsto das contas fixas ainda não lançadas numa conta (no cartão: entra como comprometido
// no limite da fatura do mês).
export const pendingOnAccount = (month: RecurringMonth, accountId: string) =>
  month.items.reduce((sum, i) => (i.status !== "paid" && i.bill.accountId === accountId ? sum + i.bill.amountCents : sum), 0);

// Contas que vencem de hoje até `days` dias à frente e ainda não foram lançadas.
export const dueSoon = (month: RecurringMonth, today: string, until: string) =>
  month.items.filter((i) => i.status === "pending" && i.dueDate >= today && i.dueDate <= until);

