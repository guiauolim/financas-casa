import { addMonthsYM, clampedDate, parseISODate, toYearMonth, type YearMonth } from "./dates";

// Regras de fatura do cartão de crédito.
//
// Convenção (a mais comum nos bancos brasileiros):
// - A fatura de um mês fecha no `closingDay` (limitado ao último dia do mês: 31 em
//   fevereiro fecha dia 28/29).
// - Compra feita ANTES do dia do fechamento entra na fatura que fecha naquele mês;
//   compra NO dia do fechamento ou depois vai para a fatura seguinte (o dia do
//   fechamento é o "melhor dia de compra").
// - O vencimento é no mesmo mês do fechamento se `dueDay > closingDay`; senão, no
//   mês seguinte. Também limitado ao fim do mês.
// - A fatura é identificada pelo mês do vencimento (`reference`, "YYYY-MM").

export type CardCycle = { closingDay: number; dueDay: number };

export type Invoice = {
  reference: string; // mês do vencimento, "YYYY-MM"
  closingDate: string; // "YYYY-MM-DD"
  dueDate: string;
  periodStart: string; // primeira data de compra que entra nesta fatura
  periodEnd: string; // última data de compra que entra nesta fatura (véspera do fechamento)
};

function assertDay(day: number, label: string) {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new RangeError(`${label} inválido: ${day}`);
}

export function closingDateFor(ym: YearMonth, closingDay: number): string {
  assertDay(closingDay, "closing_day");
  return clampedDate(ym, closingDay);
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Fatura que fecha no mês `closingMonth`.
export function invoiceClosingIn(closingMonth: YearMonth, card: CardCycle): Invoice {
  assertDay(card.closingDay, "closing_day");
  assertDay(card.dueDay, "due_day");
  const closingDate = closingDateFor(closingMonth, card.closingDay);
  const dueMonth = card.dueDay > card.closingDay ? closingMonth : addMonthsYM(closingMonth, 1);
  const previousClosing = closingDateFor(addMonthsYM(closingMonth, -1), card.closingDay);
  return {
    reference: toYearMonth(dueMonth),
    closingDate,
    dueDate: clampedDate(dueMonth, card.dueDay),
    periodStart: previousClosing,
    periodEnd: dayBefore(closingDate),
  };
}

// Em qual fatura cai uma compra feita em `purchaseDate` ("YYYY-MM-DD").
export function invoiceFor(purchaseDate: string, card: CardCycle): Invoice {
  const parsed = parseISODate(purchaseDate);
  if (!parsed) throw new RangeError(`Data inválida: ${purchaseDate}`);
  const closingThisMonth = closingDateFor(parsed, card.closingDay);
  const closingMonth = purchaseDate < closingThisMonth ? parsed : addMonthsYM(parsed, 1);
  return invoiceClosingIn(closingMonth, card);
}

// Fatura identificada pelo mês de vencimento ("YYYY-MM").
export function invoiceByReference(reference: YearMonth, card: CardCycle): Invoice {
  const closingMonth = card.dueDay > card.closingDay ? reference : addMonthsYM(reference, -1);
  return invoiceClosingIn(closingMonth, card);
}
