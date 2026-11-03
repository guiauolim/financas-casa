import { type CardCycle, invoiceByRef, invoiceFor, invoiceNameMonth, type InvoiceNaming } from "./billing";
import { type LedgerEntry, type MonthOf, purchaseMonthOf } from "./ledger";

// Regra do sistema para o gasto do mês ("por fatura"): lançamentos NO cartão (compras, estornos,
// parcelas) contam no mês da fatura em que caíram — pelo nome escolhido no cartão (fechamento ou
// vencimento). O que não é do cartão continua pela data. Parcela de compra antiga conta na fatura
// em que aparece. A contagem pela data da compra (`purchaseMonthOf`, em ledger.ts) fica só para
// uso interno (ex.: limite semanal do cartão); não há opção na UI.

export type ViewCard = CardCycle & { id: string; naming: InvoiceNaming };

// Fatura (chave) de um lançamento no cartão: a gravada; sem ela, pela data.
export const entryInvoiceRef = (entry: Pick<LedgerEntry, "invoiceRef" | "occurredOn">, card: CardCycle) =>
  entry.invoiceRef ?? invoiceFor(entry.occurredOn, card).ref;

export function invoiceMonthOf(cards: readonly ViewCard[]): MonthOf {
  if (cards.length === 0) return purchaseMonthOf;
  const byId = new Map(cards.map((card) => [card.id, card]));
  const nameCache = new Map<string, string>(); // `${cardId}|${ref}` -> mês do nome
  return (entry) => {
    const card = byId.get(entry.accountId);
    if (!card) return purchaseMonthOf(entry);
    const ref = entryInvoiceRef(entry, card);
    const key = `${card.id}|${ref}`;
    let month = nameCache.get(key);
    if (month === undefined) {
      month = invoiceNameMonth(invoiceByRef(ref, card), card.naming);
      nameCache.set(key, month);
    }
    return month;
  };
}
