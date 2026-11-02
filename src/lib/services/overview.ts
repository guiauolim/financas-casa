import "server-only";
import { type CardInvoices, cardInvoices } from "@/lib/finance/balances";
import { projectedCents, weekToDate } from "@/lib/finance/budget";
import { compareYM, monthRange, type YearMonth, yearMonthOf } from "@/lib/finance/dates";
import { buildInsights, type Insight } from "@/lib/finance/insights";
import { inRange } from "@/lib/finance/ledger";
import { type NetWorthReport, netWorthForMonth } from "@/lib/finance/networth";
import { expensesByCategory, expensesByPerson, type MonthTotals, monthlySeries, type Summary, summarize } from "@/lib/finance/summary";
import { type Account, listAccounts } from "./accounts";
import { type BudgetStatusReport, type BudgetWithStatus, buildBudgetStatus, listBudgets } from "./budgets";
import { listSettledInvoices } from "./card-invoices";
import { listCategories } from "./categories";
import { listMembers } from "./households";
import { listInvestments, listSnapshots } from "./investments";
import { netWorthInput } from "./networth";
import { listLedger } from "./transactions";
import type { Db } from "./types";

export type CategorySpending = {
  categoryId: string | null;
  name: string;
  icon: string | null;
  spentCents: number;
  budget: BudgetWithStatus | null;
};

export type CardInvoiceSummary = { account: Pick<Account, "id" | "name" | "archived"> } & CardInvoices;

export type MonthOverview = {
  month: YearMonth;
  today: string;
  isCurrentMonth: boolean;
  hasTransactions: boolean; // a casa tem algum lançamento (qualquer mês)
  summary: Summary; // entradas − saídas do mês
  budgets: BudgetStatusReport;
  categories: CategorySpending[];
  series: MonthTotals[]; // 6 meses terminando no mês escolhido
  // Contas + investimentos − faturas em aberto, hoje (ou no fim do mês escolhido), e variação no mês.
  netWorth: NetWorthReport;
  invoices: CardInvoiceSummary[];
  insights: Insight[];
  // Despesas do mês por pessoa (spent_by): Casa (null) e cada membro, nessa ordem.
  byPerson: { spentBy: string | null; name: string; memberIndex: number; spentCents: number }[];
};

// Junta os dados da Visão geral. Toda regra vem de lib/finance; aqui só se busca e combina.
export async function getMonthOverview(
  db: Db,
  { householdId, month, today }: { householdId: string; month: YearMonth; today: string },
): Promise<MonthOverview> {
  const [ledger, budgetList, accounts, categoryList, investments, snapshots, members, settled] = await Promise.all([
    listLedger(db, { householdId }),
    listBudgets(db, { householdId }),
    listAccounts(db, { householdId, includeArchived: true }),
    listCategories(db, { householdId, includeArchived: true }),
    listInvestments(db, { householdId, includeArchived: true }),
    listSnapshots(db, { householdId }),
    listMembers(db, { householdId }),
    listSettledInvoices(db, { householdId }),
  ]);

  const isCurrentMonth = compareYM(month, yearMonthOf(today)) === 0;
  const range = monthRange(month);
  const budgets = buildBudgetStatus(budgetList, ledger, { month, today });

  // Gastos por categoria: as que tiveram gasto no mês + as que têm orçamento (mesmo sem gasto).
  const categoryById = new Map(categoryList.map((c) => [c.id, c]));
  const budgetByCategory = new Map(budgets.categories.map((b) => [b.categoryId, b]));
  const spent = expensesByCategory(ledger, month);
  const categories: CategorySpending[] = spent.map(({ categoryId, spentCents }) => {
    const category = categoryId ? categoryById.get(categoryId) : undefined;
    return {
      categoryId,
      name: category?.name ?? "Sem categoria",
      icon: category?.icon ?? null,
      spentCents,
      budget: (categoryId && budgetByCategory.get(categoryId)) || null,
    };
  });
  for (const budget of budgets.categories) {
    if (spent.some((s) => s.categoryId === budget.categoryId)) continue;
    categories.push({
      categoryId: budget.categoryId,
      name: budget.category?.name ?? "Categoria",
      icon: budget.category?.icon ?? null,
      spentCents: 0,
      budget,
    });
  }

  const invoices: CardInvoiceSummary[] = accounts
    .filter((a) => a.kind === "credit_card" && a.closingDay && a.dueDay)
    .map((a) => ({
      account: { id: a.id, name: a.name, archived: a.archived },
      ...cardInvoices(
        { id: a.id, closingDay: a.closingDay!, dueDay: a.dueDay!, settledReferences: settled.get(a.id) },
        ledger,
        today,
      ),
    }))
    // Cartão arquivado só aparece se ainda deve algo.
    .filter((c) => !c.account.archived || c.open.remainingCents > 0 || c.closedUnpaid.length > 0);

  const insights = buildInsights({
    today,
    isCurrentMonth,
    monthlyTotal: budgets.total
      ? {
          limitCents: budgets.total.limitCents,
          spentCents: budgets.total.spentCents,
          projectedCents: projectedCents(budgets.projection),
        }
      : null,
    categories: budgets.categories.map((b) => ({
      name: b.category?.name ?? "Categoria",
      spentCents: b.spentCents,
      limitCents: b.limitCents,
    })),
    invoices: invoices.flatMap((c) =>
      [...c.closedUnpaid, c.open].map((i) => ({
        cardName: c.account.name,
        remainingCents: i.remainingCents,
        dueDate: i.dueDate,
      })),
    ),
    week: weekToDate(ledger, today),
  });

  return {
    month,
    today,
    isCurrentMonth,
    hasTransactions: ledger.length > 0,
    summary: summarize(ledger.filter((e) => inRange(e.occurredOn, range))),
    budgets,
    categories,
    series: monthlySeries(ledger, month, 6),
    netWorth: netWorthForMonth(month, today, netWorthInput(accounts, ledger, investments, snapshots, settled)),
    invoices,
    insights,
    byPerson: expensesByPerson(
      ledger,
      month,
      members.map((m) => m.userId),
    ).map((p) => {
      const index = members.findIndex((m) => m.userId === p.spentBy);
      return { ...p, name: index < 0 ? "Casa" : members[index]!.displayName, memberIndex: index };
    }),
  };
}
