import { addMonthsYM, addDays, clampedDate, formatMonthLong, parseISODate, parseYearMonth, toYearMonth, type YearMonth } from "./dates";

// Regras de fatura do cartão de crédito.
//
// Convenção:
// - `closingDay` é o **melhor dia de compra**: compras a partir deste dia vão para a próxima
//   fatura. A fatura fecha na véspera (o "fechamento" = último dia de compras). Ex.: melhor dia
//   26 → a fatura de novembro cobre 26/10 a 25/11 e fecha em 25/11.
// - Em mês curto o dia é limitado ao último dia do mês (31 em fevereiro = 28/29).
// - O vencimento é no mesmo mês do melhor dia se `dueDay > closingDay`; senão, no mês seguinte.
//   Também limitado ao fim do mês.
// - A fatura é identificada pelo **mês do fechamento** (`ref`, "YYYY-MM"). É essa chave que fica
//   gravada em `transactions.invoice_ref`: não muda se o nome exibido for pelo vencimento nem se
//   o melhor dia de compra for corrigido depois.
// - Nome exibido ("fatura de novembro"): mês do fechamento ou do vencimento, por cartão
//   (`InvoiceNaming`). Ver `invoiceNameMonth`.
// - Parcelas caem em faturas consecutivas a partir da fatura da compra (`installmentRefs`).
// - Pagamento de fatura paga a última fatura já fechada na data do pagamento (`paymentInvoiceRef`).
//
// O espelho SQL destas regras (para o backfill e o trigger de segurança) está na migration 0008.

export type CardCycle = { closingDay: number; dueDay: number };

export type InvoiceNaming = "closing" | "due";
export const INVOICE_NAMINGS = ["closing", "due"] as const satisfies readonly InvoiceNaming[];
export const INVOICE_NAMING_LABELS: Record<InvoiceNaming, string> = { closing: "Fechamento", due: "Vencimento" };

export type Invoice = {
  ref: string; // mês do fechamento, "YYYY-MM" — chave da fatura (transactions.invoice_ref)
  dueMonth: string; // mês do vencimento, "YYYY-MM"
  closingDate: string; // fechamento: último dia de compras desta fatura
  dueDate: string;
  periodStart: string; // primeira data de compra que entra nesta fatura
  periodEnd: string; // última data de compra (= closingDate)
};

function assertDay(day: number, label: string) {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new RangeError(`${label} inválido: ${day}`);
}

// Melhor dia de compra no mês `ym` (limitado ao fim do mês): a partir dele, a compra vai para a
// fatura seguinte.
export function bestPurchaseDate(ym: YearMonth, closingDay: number): string {
  assertDay(closingDay, "closing_day");
  return clampedDate(ym, closingDay);
}

function toRefYM(ref: string): YearMonth {
  const parsed = parseYearMonth(ref);
  if (!parsed) throw new RangeError(`Fatura inválida: ${ref}`);
  return parsed;
}

export const isInvoiceRef = (value: string) => parseYearMonth(value) !== null;

export function addMonthsToRef(ref: string, delta: number): string {
  return toYearMonth(addMonthsYM(toRefYM(ref), delta));
}

// Fatura cujo melhor dia de compra (fim do ciclo) cai no mês `boundaryMonth`.
function invoiceByBoundary(boundaryMonth: YearMonth, card: CardCycle): Invoice {
  assertDay(card.closingDay, "closing_day");
  assertDay(card.dueDay, "due_day");
  const closingDate = addDays(bestPurchaseDate(boundaryMonth, card.closingDay), -1);
  const dueMonth = card.dueDay > card.closingDay ? boundaryMonth : addMonthsYM(boundaryMonth, 1);
  return {
    ref: closingDate.slice(0, 7),
    dueMonth: toYearMonth(dueMonth),
    closingDate,
    dueDate: clampedDate(dueMonth, card.dueDay),
    periodStart: bestPurchaseDate(addMonthsYM(boundaryMonth, -1), card.closingDay),
    periodEnd: closingDate,
  };
}

// Com melhor dia ≥ 2 o fechamento cai no mesmo mês; com melhor dia 1 fecha no último dia do mês anterior.
const boundaryOfRef = (ref: string, card: CardCycle) => addMonthsYM(toRefYM(ref), card.closingDay === 1 ? 1 : 0);

// Fatura pela chave (mês do fechamento, "YYYY-MM").
export function invoiceByRef(ref: string, card: CardCycle): Invoice {
  return invoiceByBoundary(boundaryOfRef(ref, card), card);
}

// Em qual fatura cai uma compra feita em `purchaseDate` ("YYYY-MM-DD").
export function invoiceFor(purchaseDate: string, card: CardCycle): Invoice {
  const parsed = parseISODate(purchaseDate);
  if (!parsed) throw new RangeError(`Data inválida: ${purchaseDate}`);
  const boundary = bestPurchaseDate(parsed, card.closingDay);
  return invoiceByBoundary(purchaseDate < boundary ? parsed : addMonthsYM(parsed, 1), card);
}

// Fatura que vence no mês `dueMonth` ("YYYY-MM") — ex.: a de um arquivo do banco, que só traz o vencimento.
export function invoiceByDueMonth(dueMonth: string, card: CardCycle): Invoice {
  const due = toRefYM(dueMonth);
  return invoiceByBoundary(card.dueDay > card.closingDay ? due : addMonthsYM(due, -1), card);
}

// Faturas das parcelas 1..total de uma compra cuja 1ª parcela cai em `firstRef`: consecutivas.
export function installmentRefs(firstRef: string, total: number): string[] {
  return Array.from({ length: total }, (_, i) => addMonthsToRef(firstRef, i));
}

// Fatura que um pagamento feito em `date` quita: a última já fechada (a anterior à aberta).
export function paymentInvoiceRef(date: string, card: CardCycle): string {
  return addMonthsToRef(invoiceFor(date, card).ref, -1);
}

// Mês que dá nome à fatura ("YYYY-MM"): o do fechamento ou o do vencimento.
export function invoiceNameMonth(invoice: Pick<Invoice, "ref" | "dueMonth">, naming: InvoiceNaming): string {
  return naming === "due" ? invoice.dueMonth : invoice.ref;
}

// Chave da fatura cujo nome é `month` ("fatura de novembro" → ref), conforme o nome do cartão.
export function refForNameMonth(month: string, naming: InvoiceNaming, card: CardCycle): string {
  return naming === "due" ? invoiceByDueMonth(month, card).ref : toYearMonth(toRefYM(month));
}

// "fatura de novembro de 2026"
export function invoiceLabel(invoice: Pick<Invoice, "ref" | "dueMonth">, naming: InvoiceNaming): string {
  return `fatura de ${formatMonthLong(toRefYM(invoiceNameMonth(invoice, naming)))}`;
}

// Faturas de um lançamento novo (site e bot), uma por linha gravada (parcelas: `count` > 1):
// - no cartão (compra, estorno, saque): a fatura da data e, nas parcelas, as seguintes em sequência;
// - transferência para um cartão (pagamento de fatura): a última fatura fechada na data;
// - fora do cartão: null.
// `account`/`transferTo` = ciclo do cartão (null se não for cartão com ciclo).
export function transactionInvoiceRefs({
  type,
  occurredOn,
  count = 1,
  account,
  transferTo = null,
}: {
  type: "expense" | "income" | "transfer";
  occurredOn: string;
  count?: number;
  account: CardCycle | null;
  transferTo?: CardCycle | null;
}): (string | null)[] {
  if (account) return installmentRefs(invoiceFor(occurredOn, account).ref, count);
  if (type === "transfer" && transferTo) return [paymentInvoiceRef(occurredOn, transferTo)];
  return Array.from({ length: count }, () => null);
}
