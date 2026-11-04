import { type CardCycle, type Invoice, invoiceByRef, invoiceFor } from "./billing";
import type { LedgerEntry } from "./ledger";
import { entryInvoiceRef } from "./spending-view";

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
  chargesCents: number; // compras − estornos da fatura
  paidCents: number; // pagamentos alocados a esta fatura
  remainingCents: number; // quanto falta pagar
};

export type CardInvoices = {
  open: InvoiceBalance; // fatura do ciclo de hoje
  closedUnpaid: InvoiceBalance[]; // faturas já fechadas com saldo a pagar (mais antiga primeiro)
  invoices: InvoiceBalance[]; // todas as faturas com movimento (mais antiga primeiro), inclusive futuras
  creditCents: number; // pago a mais (sobra depois de quitar tudo)
  // Limite comprometido: tudo o que falta pagar, inclusive parcelas em faturas futuras, menos o crédito.
  limitUsedCents: number;
};

// settledRefs: faturas ("YYYY-MM" do fechamento) que se sabe que já foram pagas fora do sistema
// — ex.: importadas de um arquivo "Fatura Paga", cujo pagamento não foi lançado.
export type CardAccount = CardCycle & { id: string; settledRefs?: ReadonlySet<string> };

// Cada lançamento no cartão conta na fatura gravada nele (`invoiceRef`; sem ela, pela data —
// billing.ts): compra soma, estorno (receita no cartão) abate, transferência que sai do cartão
// (saque/crédito) conta como compra.
//
// Pagamentos (transferências PARA o cartão) com fatura gravada quitam primeiro essa fatura; o que
// sobrar, e os pagamentos sem fatura, quitam as faturas em ordem, da mais antiga para a mais nova
// (FIFO). Assim o pagamento da fatura anterior, que costuma cair dentro do ciclo atual, não abate a
// fatura aberta; e o que for pago a mais (adiantado) abate a aberta.
export function cardInvoices(card: CardAccount, entries: readonly LedgerEntry[], today: string): CardInvoices {
  const invoices = new Map<string, InvoiceBalance>();
  const invoiceOf = (ref: string) => {
    let current = invoices.get(ref);
    if (!current) {
      current = { ...invoiceByRef(ref, card), chargesCents: 0, paidCents: 0, remainingCents: 0 };
      invoices.set(ref, current);
    }
    return current;
  };

  let pool = 0;
  const directPayments = new Map<string, number>();
  for (const entry of entries) {
    if (entry.accountId === card.id) {
      invoiceOf(entryInvoiceRef(entry, card)).chargesCents += entry.type === "income" ? -entry.amountCents : entry.amountCents;
    } else if (entry.type === "transfer" && entry.transferAccountId === card.id) {
      if (entry.invoiceRef) directPayments.set(entry.invoiceRef, (directPayments.get(entry.invoiceRef) ?? 0) + entry.amountCents);
      else pool += entry.amountCents;
    }
  }
  const open = invoiceOf(invoiceFor(today, card).ref);

  const ordered = [...invoices.values()].sort((a, b) => a.ref.localeCompare(b.ref));
  // Fatura com mais estorno que compra vira crédito para as outras.
  for (const invoice of ordered) if (invoice.chargesCents < 0) pool -= invoice.chargesCents;
  // Pagamento com fatura: primeiro nela; a sobra (ou fatura sem compras) vai para o FIFO.
  for (const [ref, cents] of directPayments) {
    const invoice = invoices.get(ref);
    const applied = invoice ? Math.min(Math.max(0, invoice.chargesCents), cents) : 0;
    if (invoice) invoice.paidCents = applied;
    pool += cents - applied;
  }
  for (const invoice of ordered) {
    const due = Math.max(0, invoice.chargesCents);
    const extra = Math.min(due - invoice.paidCents, pool);
    invoice.paidCents += extra;
    pool -= extra;
    invoice.remainingCents = due - invoice.paidCents;
    // Paga fora do sistema (depois do vencimento): quitada. Absorve primeiro os pagamentos
    // lançados (se houver), para não virarem crédito na fatura aberta.
    if (card.settledRefs?.has(invoice.ref) && invoice.dueDate <= today) {
      invoice.paidCents = due;
      invoice.remainingCents = 0;
    }
  }

  const outstanding = ordered.reduce((sum, invoice) => sum + invoice.remainingCents, 0);
  return {
    open,
    closedUnpaid: ordered.filter((invoice) => invoice.closingDate < today && invoice.remainingCents > 0),
    invoices: ordered,
    creditCents: pool,
    limitUsedCents: Math.max(0, outstanding - pool),
  };
}

// ───────────────────────── Totais agregados ─────────────────────────

// Linha de card_invoice_totals (migration 0009): soma por cartão e fatura, feita no banco.
// - charge: lançamentos no cartão (compras/saques − estornos) da fatura `invoiceRef`; sem fatura
//   gravada, os de uma data (`occurredOn`).
// - payment: transferências para o cartão que pagam `invoiceRef` (null = FIFO).
export type InvoiceTotalRow = {
  kind: "charge" | "payment";
  accountId: string;
  invoiceRef: string | null;
  occurredOn: string | null;
  amountCents: number;
};

// Converte os totais em lançamentos equivalentes para `cardInvoices`: o resultado (total, pago,
// falta, crédito) é o mesmo de passar todos os lançamentos, sem precisar baixá-los.
export function ledgerFromInvoiceTotals(rows: readonly InvoiceTotalRow[]): LedgerEntry[] {
  return rows.map((row) => {
    const occurredOn = row.occurredOn ?? `${row.invoiceRef}-01`;
    if (row.kind === "payment") {
      return {
        type: "transfer",
        amountCents: row.amountCents,
        occurredOn,
        accountId: "",
        transferAccountId: row.accountId,
        categoryId: null,
        invoiceRef: row.invoiceRef,
      };
    }
    return {
      type: row.amountCents < 0 ? "income" : "expense",
      amountCents: Math.abs(row.amountCents),
      occurredOn,
      accountId: row.accountId,
      transferAccountId: null,
      categoryId: null,
      invoiceRef: row.invoiceRef,
    };
  });
}
