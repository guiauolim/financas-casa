import { type CardCycle, type Invoice, invoiceFor } from "./billing";
import type { LedgerEntry } from "./ledger";

// ───────────────────────── Saldo de conta ─────────────────────────

export type BalanceAccount = {
  id: string;
  openingBalanceCents: number;
  openingBalanceDate: string | null; // sem data: considera todos os lançamentos
};

// Saldo = saldo inicial + entradas − saídas − transferências que saem + transferências que entram,
// só com lançamentos a partir de `openingBalanceDate` e até `asOf` (lançamentos futuros não contam).
export function accountBalance(account: BalanceAccount, entries: readonly LedgerEntry[], asOf?: string): number {
  let balance = account.openingBalanceCents;
  for (const entry of entries) {
    if (account.openingBalanceDate && entry.occurredOn < account.openingBalanceDate) continue;
    if (asOf && entry.occurredOn > asOf) continue;
    if (entry.accountId === account.id) {
      balance += entry.type === "income" ? entry.amountCents : -entry.amountCents;
    } else if (entry.type === "transfer" && entry.transferAccountId === account.id) {
      balance += entry.amountCents;
    }
  }
  return balance;
}

export function totalBalance(
  accounts: readonly BalanceAccount[],
  entries: readonly LedgerEntry[],
  asOf?: string,
): number {
  return accounts.reduce((sum, account) => sum + accountBalance(account, entries, asOf), 0);
}

// ───────────────────────── Faturas do cartão ─────────────────────────

export type InvoiceBalance = Invoice & {
  chargesCents: number; // compras − estornos do ciclo
  paidCents: number; // pagamentos alocados a esta fatura
  remainingCents: number; // quanto falta pagar
};

export type CardInvoices = {
  open: InvoiceBalance; // fatura do ciclo de hoje
  closedUnpaid: InvoiceBalance[]; // faturas já fechadas com saldo a pagar (mais antiga primeiro)
  creditCents: number; // pago a mais (sobra depois de quitar tudo)
};

// settledReferences: faturas ("YYYY-MM" do vencimento) que se sabe que já foram pagas fora do
// sistema — ex.: importadas de um arquivo "Fatura Paga", cujo pagamento não foi lançado.
export type CardAccount = CardCycle & { id: string; settledReferences?: ReadonlySet<string> };

// Compras (despesa no cartão) caem na fatura pela data da compra (billing.ts). Estorno
// (receita no cartão) abate a fatura do seu ciclo. Transferência que sai do cartão
// (saque/crédito) conta como compra.
//
// Pagamentos (transferências PARA o cartão) quitam as faturas em ordem, da mais antiga para
// a mais nova (FIFO). Assim o pagamento da fatura anterior, que costuma cair dentro do ciclo
// atual, não abate a fatura aberta; e o que for pago a mais (adiantado) abate a aberta.
export function cardInvoices(card: CardAccount, entries: readonly LedgerEntry[], today: string): CardInvoices {
  const invoices = new Map<string, InvoiceBalance>();
  const invoiceOf = (date: string) => {
    const invoice = invoiceFor(date, card);
    let current = invoices.get(invoice.reference);
    if (!current) {
      current = { ...invoice, chargesCents: 0, paidCents: 0, remainingCents: 0 };
      invoices.set(invoice.reference, current);
    }
    return current;
  };

  let paymentsCents = 0;
  for (const entry of entries) {
    if (entry.accountId === card.id) {
      invoiceOf(entry.occurredOn).chargesCents += entry.type === "income" ? -entry.amountCents : entry.amountCents;
    } else if (entry.type === "transfer" && entry.transferAccountId === card.id) {
      paymentsCents += entry.amountCents;
    }
  }
  const open = invoiceOf(today);

  // Ciclo com mais estorno que compra vira crédito para as outras faturas.
  const ordered = [...invoices.values()].sort((a, b) => a.closingDate.localeCompare(b.closingDate));
  let pool = paymentsCents;
  for (const invoice of ordered) if (invoice.chargesCents < 0) pool -= invoice.chargesCents;
  for (const invoice of ordered) {
    const due = Math.max(0, invoice.chargesCents);
    invoice.paidCents = Math.min(due, pool);
    invoice.remainingCents = due - invoice.paidCents;
    pool -= invoice.paidCents;
    // Paga fora do sistema (depois do vencimento): quitada. Absorve primeiro os pagamentos
    // lançados (se houver), para não virarem crédito na fatura aberta.
    if (card.settledReferences?.has(invoice.reference) && invoice.dueDate <= today) {
      invoice.paidCents = due;
      invoice.remainingCents = 0;
    }
  }

  return {
    open,
    closedUnpaid: ordered.filter((invoice) => invoice.closingDate <= today && invoice.remainingCents > 0),
    creditCents: pool,
  };
}
