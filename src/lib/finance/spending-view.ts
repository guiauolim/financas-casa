import { type CardCycle, invoiceByRef, invoiceFor, invoiceNameMonth, type InvoiceNaming } from "./billing";
import { type LedgerEntry, type MonthOf, purchaseMonthOf } from "./ledger";

// Duas visões do gasto do mês (escolha lembrada por usuário em profiles.spending_view):
// - "purchase" (Por data da compra): tudo conta no mês da data do lançamento.
// - "invoice" (Por fatura): lançamentos NO cartão (compras, estornos, parcelas) contam no mês
//   da fatura em que caíram — pelo nome escolhido no cartão (fechamento ou vencimento). O que
//   não é do cartão continua pela data. Parcela de compra antiga conta na fatura em que aparece.

export type SpendingView = "purchase" | "invoice";
export const SPENDING_VIEWS = ["purchase", "invoice"] as const satisfies readonly SpendingView[];
export const SPENDING_VIEW_LABELS: Record<SpendingView, string> = {
  purchase: "Por data da compra",
  invoice: "Por fatura",
};

export const isSpendingView = (value: unknown): value is SpendingView =>
  value === "purchase" || value === "invoice";

export type ViewCard = CardCycle & { id: string; naming: InvoiceNaming };

// Fatura (chave) de um lançamento no cartão: a gravada; sem ela, pela data.
export const entryInvoiceRef = (entry: Pick<LedgerEntry, "invoiceRef" | "occurredOn">, card: CardCycle) =>
  entry.invoiceRef ?? invoiceFor(entry.occurredOn, card).ref;

export function spendingMonthOf(view: SpendingView, cards: readonly ViewCard[]): MonthOf {
  if (view === "purchase" || cards.length === 0) return purchaseMonthOf;
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
