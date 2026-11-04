import "server-only";
import { parseYearMonth, toYearMonth, type YearMonth } from "@/lib/finance/dates";
import { type MonthCard, monthInvoiceRef } from "@/lib/finance/month-view";
import { isCycleCard, listAccounts } from "./accounts";
import { cardInvoicesNamed, findNamedInvoice, listInvoiceTotals, listSettledInvoices, type NamedInvoice } from "./card-invoices";
import { listMonthTransactions, type Transaction } from "./transactions";
import type { Db } from "./types";

// Dados de um mês da tela Transações (e do bot: "o que gastei em novembro?"). Os lançamentos vêm
// sem filtro; quem mostra separa e filtra com groupMonth (lib/finance/month-view), que é puro e
// roda também no navegador — trocar filtro não vai ao servidor.

export type MonthInvoice = {
  card: MonthCard & { name: string; archived: boolean };
  invoice: NamedInvoice; // fatura com o nome do mês: período, vencimento, total, pago, falta
};

export type TransactionsMonth = {
  month: string; // "YYYY-MM"
  today: string;
  invoices: MonthInvoice[]; // um por cartão com ciclo (arquivado só se tiver lançamento na fatura)
  transactions: Transaction[];
};

// 4 consultas em paralelo: contas, lançamentos do mês (+ total das parcelas), totais das faturas
// e faturas pagas fora do sistema. Nada de ledger inteiro.
export async function getTransactionsMonth(
  db: Db,
  { householdId, month, today }: { householdId: string; month: YearMonth; today: string },
): Promise<TransactionsMonth> {
  const monthKey = toYearMonth(month);
  const [accounts, transactions, totals, settled] = await Promise.all([
    listAccounts(db, { householdId, includeArchived: true }),
    listMonthTransactions(db, { householdId, month }),
    listInvoiceTotals(db, { householdId }),
    listSettledInvoices(db, { householdId }),
  ]);

  const invoices = accounts.filter(isCycleCard).flatMap((account): MonthInvoice[] => {
    const card: MonthInvoice["card"] = {
      id: account.id,
      name: account.name,
      archived: account.archived,
      closingDay: account.closingDay,
      dueDay: account.dueDay,
      naming: account.invoiceNaming,
    };
    const ref = monthInvoiceRef(monthKey, card);
    if (account.archived && !transactions.some((tx) => tx.account.id === account.id && tx.invoiceRef === ref)) return [];
    const ledger = totals.filter((e) => e.accountId === account.id || e.transferAccountId === account.id);
    const { named, open } = cardInvoicesNamed(account, ledger, today, settled);
    return [{ card, invoice: findNamedInvoice(account, named, open.ref, ref) }];
  });

  return { month: monthKey, today, invoices, transactions };
}

export const isMonthParam = (value: string | null | undefined): value is string => Boolean(value && parseYearMonth(value));
