import type { LedgerEntry } from "./ledger";

// A Conta Conjunta é o "cofre" da casa: salários entram nela, pix e débitos saem dela e a fatura
// do cartão é paga por ela. Estas regras escolhem a conta padrão e leem quando a fatura foi paga.
// Não existe pagamento automático: o pagamento é sempre uma transferência lançada.

export type PaymentAccountCandidate = {
  id: string;
  kind: string;
  ownerUserId: string | null;
  archived: boolean;
};

// Conta padrão para pagar a fatura e para receber receitas: a conta corrente conjunta (sem dono)
// ativa; senão a primeira conta corrente ativa; senão nenhuma. Ordem = a recebida.
export function defaultPaymentAccount<T extends PaymentAccountCandidate>(accounts: readonly T[]): T | null {
  const checking = accounts.filter((a) => a.kind === "checking" && !a.archived);
  return checking.find((a) => a.ownerUserId === null) ?? checking[0] ?? null;
}

// Conta que paga a fatura do cartão: a escolhida (se ainda existe, ativa e não é cartão) ou a padrão.
export function cardPaymentAccount<T extends PaymentAccountCandidate>(
  card: { paymentAccountId: string | null },
  accounts: readonly T[],
): T | null {
  const chosen = accounts.find((a) => a.id === card.paymentAccountId);
  if (chosen && !chosen.archived && chosen.kind !== "credit_card") return chosen;
  return defaultPaymentAccount(accounts);
}

// Data do último pagamento lançado para a fatura `ref` do cartão (transferência para ele com essa
// fatura gravada), ou null.
export function invoicePaidOn(
  cardId: string,
  ref: string,
  entries: readonly Pick<LedgerEntry, "type" | "occurredOn" | "transferAccountId" | "invoiceRef">[],
): string | null {
  let last: string | null = null;
  for (const entry of entries) {
    if (entry.type !== "transfer" || entry.transferAccountId !== cardId || entry.invoiceRef !== ref) continue;
    if (last === null || entry.occurredOn > last) last = entry.occurredOn;
  }
  return last;
}
