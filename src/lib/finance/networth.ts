import { type BalanceAccount, type CardAccount, cardInvoices, totalBalance } from "./balances";
import { addMonthsYM, compareYM, monthRange, type YearMonth, yearMonthOf } from "./dates";
import type { LedgerEntry } from "./ledger";
import { investedValueAt, type PortfolioInvestment, type Snapshot, snapshotsByInvestment } from "./portfolio";

// Patrimônio = saldo das contas + investimentos ativos − faturas em aberto.

export type NetWorthInput = {
  moneyAccounts: readonly BalanceAccount[]; // contas que não são cartão
  cards: readonly CardAccount[];
  ledger: readonly LedgerEntry[];
  investments: readonly PortfolioInvestment[];
  snapshots: readonly Snapshot[];
};

export type NetWorth = {
  accountsCents: number;
  investmentsCents: number;
  invoicesCents: number; // quanto se deve nos cartões (positivo = dívida)
  totalCents: number;
};

// Dívida do cartão numa data: fatura aberta + fechadas não pagas (só com lançamentos até a
// data; compras parceladas futuras ainda não contam), menos crédito pago a mais.
export function cardDebtAt(card: CardAccount, ledger: readonly LedgerEntry[], asOf: string): number {
  const entries = ledger.filter((entry) => entry.occurredOn <= asOf);
  const { open, closedUnpaid, creditCents } = cardInvoices(card, entries, asOf);
  return open.remainingCents + closedUnpaid.reduce((sum, i) => sum + i.remainingCents, 0) - creditCents;
}

export function netWorthAt(asOf: string, input: NetWorthInput): NetWorth {
  const accountsCents = totalBalance(input.moneyAccounts, input.ledger, asOf);
  const investmentsCents = investedValueAt(asOf, input.investments, snapshotsByInvestment(input.snapshots));
  const invoicesCents = input.cards.reduce((sum, card) => sum + cardDebtAt(card, input.ledger, asOf), 0);
  return { accountsCents, investmentsCents, invoicesCents, totalCents: accountsCents + investmentsCents - invoicesCents };
}

export type NetWorthReport = NetWorth & {
  asOf: string; // hoje no mês corrente; último dia nos meses passados
  previousAsOf: string; // último dia do mês anterior
  changeCents: number; // variação no mês
};

// Patrimônio do mês escolhido e a variação em relação ao fim do mês anterior.
export function netWorthForMonth(month: YearMonth, today: string, input: NetWorthInput): NetWorthReport {
  const asOf = compareYM(month, yearMonthOf(today)) >= 0 ? today : monthRange(month).to;
  const previousAsOf = monthRange(addMonthsYM(yearMonthOf(asOf), -1)).to;
  const current = netWorthAt(asOf, input);
  const previous = netWorthAt(previousAsOf, input);
  return { ...current, asOf, previousAsOf, changeCents: current.totalCents - previous.totalCents };
}
