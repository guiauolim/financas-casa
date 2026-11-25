import type { YearMonth } from "./dates";
import { entriesInMonth, type LedgerEntry, type MonthOf } from "./ledger";
import type { RecurringMonth } from "./recurring";

// Plano do mês: quanto deve sobrar para a reserva (a caixinha do cartão).
//
//   sobra prevista = receitas do mês
//                  − contas fixas fora do cartão (lançado ou, se faltar, o previsto)
//                  − cartões (o limite da fatura ou, se passou dele ou não houver limite, o gasto)
//                  − outros gastos fora do cartão já lançados (pix, débito sem conta fixa)
//
// Contas fixas no cartão já estão dentro do cartão. Estorno no cartão não é receita do mês.

export type MonthPlan = {
  incomeCents: number;
  fixedCents: number;
  cardsCents: number;
  otherCents: number;
  leftoverCents: number; // pode ser negativo (vai usar a reserva)
};

export function monthPlan({
  entries,
  month,
  monthOf,
  cardIds,
  invoiceLimits,
  recurring,
}: {
  entries: readonly LedgerEntry[];
  month: YearMonth;
  monthOf: MonthOf;
  cardIds: ReadonlySet<string>;
  invoiceLimits: ReadonlyMap<string, number>; // cartão -> limite da fatura do mês
  recurring: RecurringMonth | null;
}): MonthPlan {
  let incomeCents = 0;
  let otherCents = 0;
  let fixedPaidOutside = 0;
  const cardSpent = new Map<string, number>();
  for (const e of entriesInMonth(entries, month, monthOf)) {
    const onCard = cardIds.has(e.accountId);
    if (e.type === "income" && !onCard) incomeCents += e.amountCents;
    if (e.type !== "expense") continue;
    if (onCard) cardSpent.set(e.accountId, (cardSpent.get(e.accountId) ?? 0) + e.amountCents);
    else if (e.recurringBillId) fixedPaidOutside += e.amountCents;
    else otherCents += e.amountCents;
  }
  const fixedPendingOutside = (recurring?.items ?? []).reduce(
    (sum, i) => (i.status !== "paid" && !cardIds.has(i.bill.accountId) ? sum + i.bill.amountCents : sum),
    0,
  );
  let cardsCents = 0;
  for (const id of new Set([...cardSpent.keys(), ...invoiceLimits.keys()])) {
    cardsCents += Math.max(invoiceLimits.get(id) ?? 0, cardSpent.get(id) ?? 0);
  }
  const fixedCents = fixedPaidOutside + fixedPendingOutside;
  return {
    incomeCents,
    fixedCents,
    cardsCents,
    otherCents,
    leftoverCents: incomeCents - fixedCents - cardsCents - otherCents,
  };
}
