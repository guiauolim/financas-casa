import "server-only";
import { type CardAccount, cardInvoices, type InvoiceBalance, type InvoiceTotalRow, ledgerFromInvoiceTotals } from "@/lib/finance/balances";
import { invoiceByRef, invoiceLabel, invoiceNameMonth, isInvoiceRef, refForNameMonth } from "@/lib/finance/billing";
import { parseYearMonth } from "@/lib/finance/dates";
import type { LedgerEntry } from "@/lib/finance/ledger";
import { type CycleCard, isCycleCard, listAccounts } from "./accounts";
import { throwIf } from "./errors";
import { listTransactions, type Transaction } from "./transactions";
import type { Db } from "./types";

// Faturas do cartão: leitura pela fatura GRAVADA em cada lançamento (transactions.invoice_ref),
// sem recalcular. Usado pela Visão geral, pelas seções de fatura de Transações e (fase do bot)
// por perguntas como "quanto está a fatura de novembro?".

// Somas por cartão e fatura feitas no banco (RPC card_invoice_totals, migration 0009): bastam
// para Total / Pago / Falta sem baixar todos os lançamentos (ver ledgerFromInvoiceTotals).
export async function listInvoiceTotals(db: Db, { householdId }: { householdId: string }): Promise<LedgerEntry[]> {
  const { data, error } = await db.rpc("card_invoice_totals", { p_household_id: householdId });
  throwIf(error);
  const rows: InvoiceTotalRow[] = (data ?? []).map((row) => ({
    kind: row.kind === "payment" ? "payment" : "charge",
    accountId: row.account_id,
    invoiceRef: row.invoice_ref,
    occurredOn: row.occurred_on,
    amountCents: Number(row.amount_cents),
  }));
  return ledgerFromInvoiceTotals(rows);
}

// Faturas pagas fora do sistema (importadas como "Fatura Paga"): cartão -> faturas ("YYYY-MM" do
// fechamento). Entram em CardAccount.settledRefs (lib/finance/balances).
export async function listSettledInvoices(
  db: Db,
  { householdId }: { householdId: string },
): Promise<Map<string, Set<string>>> {
  const { data, error } = await db
    .from("card_statement_imports")
    .select("account_id, invoice_ref")
    .eq("household_id", householdId)
    .eq("paid", true);
  throwIf(error);
  const result = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const set = result.get(row.account_id) ?? new Set<string>();
    set.add(row.invoice_ref);
    result.set(row.account_id, set);
  }
  return result;
}

export const toCardAccount = (card: CycleCard, settled?: ReadonlyMap<string, ReadonlySet<string>>): CardAccount => ({
  id: card.id,
  closingDay: card.closingDay,
  dueDay: card.dueDay,
  settledRefs: settled?.get(card.id),
});

export type InvoiceStatus = "open" | "closed" | "future";

export type NamedInvoice = InvoiceBalance & {
  name: string; // "fatura de novembro de 2026" (pelo nome escolhido no cartão)
  nameMonth: string; // "YYYY-MM" que dá nome à fatura
  status: InvoiceStatus;
};

function nameInvoice(card: CycleCard, invoice: InvoiceBalance, openRef: string): NamedInvoice {
  return {
    ...invoice,
    name: invoiceLabel(invoice, card.invoiceNaming),
    nameMonth: invoiceNameMonth(invoice, card.invoiceNaming),
    status: invoice.ref === openRef ? "open" : invoice.ref < openRef ? "closed" : "future",
  };
}

export function cardInvoicesNamed(
  card: CycleCard,
  ledger: readonly LedgerEntry[],
  today: string,
  settled: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const result = cardInvoices(toCardAccount(card, settled), ledger, today);
  return { ...result, named: result.invoices.map((i) => nameInvoice(card, i, result.open.ref)) };
}

// A fatura `ref` entre as calculadas; sem movimento, zerada.
export function findNamedInvoice(card: CycleCard, named: readonly NamedInvoice[], openRef: string, ref: string): NamedInvoice {
  return (
    named.find((i) => i.ref === ref) ??
    nameInvoice(card, { ...invoiceByRef(ref, card), chargesCents: 0, paidCents: 0, remainingCents: 0 }, openRef)
  );
}

export type CardInvoiceDetail = {
  card: CycleCard;
  invoice: NamedInvoice;
  transactions: Transaction[]; // compras, estornos e parcelas da fatura + pagamentos feitos para ela
};

// Uma fatura de um cartão pela chave (mês do fechamento): total igual ao do banco, quanto já foi
// pago e os lançamentos dela (inclusive parcelas de compras antigas).
export async function getCardInvoice(
  db: Db,
  { householdId, accountId, ref, today }: { householdId: string; accountId: string; ref: string; today: string },
): Promise<CardInvoiceDetail | null> {
  if (!isInvoiceRef(ref)) return null;
  const [accounts, ledger, settled] = await Promise.all([
    listAccounts(db, { householdId, includeArchived: true }),
    listInvoiceTotals(db, { householdId }),
    listSettledInvoices(db, { householdId }),
  ]);
  const card = accounts.find((a) => a.id === accountId);
  if (!card || !isCycleCard(card)) return null;
  const { named, open } = cardInvoicesNamed(card, ledger, today, settled);
  const found = findNamedInvoice(card, named, open.ref, ref);
  const transactions = await listTransactions(db, {
    householdId,
    month: parseYearMonth(ref)!,
    invoice: { accountId: card.id, ref },
  });
  return { card, invoice: found, transactions };
}

// "Quanto está a fatura de novembro?": as faturas cujo NOME é o mês informado ("YYYY-MM"), em cada
// cartão com ciclo (ou só no cartão pedido). O nome segue a escolha do cartão (fechamento/vencimento).
export async function findCardInvoicesByName(
  db: Db,
  { householdId, month, today, accountId }: { householdId: string; month: string; today: string; accountId?: string },
): Promise<CardInvoiceDetail[]> {
  if (!isInvoiceRef(month)) return [];
  const accounts = await listAccounts(db, { householdId, includeArchived: true });
  const cards = accounts.filter(isCycleCard).filter((c) => (accountId ? c.id === accountId : !c.archived));
  const details = await Promise.all(
    cards.map((card) =>
      getCardInvoice(db, { householdId, accountId: card.id, ref: refForNameMonth(month, card.invoiceNaming, card), today }),
    ),
  );
  return details.filter((d): d is CardInvoiceDetail => d !== null);
}
