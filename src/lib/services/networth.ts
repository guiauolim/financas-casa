import "server-only";
import type { YearMonth } from "@/lib/finance/dates";
import { yearMonthOf } from "@/lib/finance/dates";
import type { LedgerEntry } from "@/lib/finance/ledger";
import { type NetWorthInput, type NetWorthReport, netWorthForMonth } from "@/lib/finance/networth";
import type { Snapshot } from "@/lib/finance/portfolio";
import { type Account, isCycleCard, listAccounts } from "./accounts";
import { listSettledInvoices, toCardAccount } from "./card-invoices";
import { type Investment, listInvestments, listSnapshots, toPortfolioInvestment } from "./investments";
import { listLedger } from "./transactions";
import type { Db } from "./types";

// Monta a entrada do cálculo de patrimônio: contas ativas que não são cartão, todos os
// cartões com ciclo (arquivado ainda pode dever) e todos os investimentos (os arquivados
// contam até a data de arquivamento).
export function netWorthInput(
  accounts: readonly Account[],
  ledger: readonly LedgerEntry[],
  investments: readonly Investment[],
  snapshots: readonly Snapshot[],
  settled: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): NetWorthInput {
  return {
    moneyAccounts: accounts.filter((a) => a.kind !== "credit_card" && !a.archived),
    cards: accounts.filter(isCycleCard).map((card) => toCardAccount(card, settled)),
    ledger,
    investments: investments.map(toPortfolioInvestment),
    snapshots,
  };
}

// Patrimônio da casa (base da tool `get_net_worth` do bot).
export async function getNetWorth(
  db: Db,
  { householdId, today, month }: { householdId: string; today: string; month?: YearMonth },
): Promise<NetWorthReport> {
  const [accounts, ledger, investments, snapshots, settled] = await Promise.all([
    listAccounts(db, { householdId, includeArchived: true }),
    listLedger(db, { householdId }),
    listInvestments(db, { householdId, includeArchived: true }),
    listSnapshots(db, { householdId }),
    listSettledInvoices(db, { householdId }),
  ]);
  return netWorthForMonth(
    month ?? yearMonthOf(today),
    today,
    netWorthInput(accounts, ledger, investments, snapshots, settled),
  );
}
