import "server-only";
import { type CardInvoices, cardInvoices } from "@/lib/finance/balances";
import { invoiceLabel } from "@/lib/finance/billing";
import { projectedCents, weekToDate } from "@/lib/finance/budget";
import { compareYM, parseYearMonth, toYearMonth, type YearMonth, yearMonthOf } from "@/lib/finance/dates";
import { buildInsights, type Insight } from "@/lib/finance/insights";
import { firstMonthOf, type Period } from "@/lib/finance/ledger";
import { invoiceMonthOf } from "@/lib/finance/spending-view";
import { type NetWorthReport, netWorthForMonth } from "@/lib/finance/networth";
import { expensesByCategory, expensesByPerson, type MonthTotals, monthlySeries, type Summary, summarizeMonth } from "@/lib/finance/summary";
import { type Account, isCycleCard, listAccounts } from "./accounts";
import { type BudgetStatusReport, type BudgetWithStatus, buildBudgetStatus, listBudgets } from "./budgets";
import { listSettledInvoices, toCardAccount } from "./card-invoices";
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

export type CardInvoiceSummary = {
  account: Pick<Account, "id" | "name" | "archived" | "creditLimitCents" | "invoiceNaming">;
  openName: string; // "fatura de novembro de 2026"
  closedNames: Record<string, string>; // ref -> nome, das fechadas não pagas
} & CardInvoices;

export type MonthOverview = {
  // "month": só `month`. "all": todos os meses até o atual (`month` = mês atual); resumo,
  // categorias e pessoas somam o período; orçamentos, insights e patrimônio são do mês atual.
  period: "month" | "all";
  month: YearMonth;
  firstMonth: string | null; // "YYYY-MM" do primeiro lançamento (até o mês atual)
  monthsCount: number; // meses no período (1 no modo mês)
  today: string;
  isCurrentMonth: boolean;
  hasTransactions: boolean; // a casa tem algum lançamento (qualquer mês)
  summary: Summary; // entradas − saídas do período
  budgets: BudgetStatusReport;
  categories: CategorySpending[];
  series: MonthTotals[]; // 6 meses terminando no mês escolhido (todos os meses: de 6 a 12)
  // Contas + investimentos − faturas em aberto, hoje (ou no fim do mês escolhido), e variação no mês.
  netWorth: NetWorthReport;
  invoices: CardInvoiceSummary[];
  insights: Insight[];
  // Despesas do mês por pessoa (spent_by): Casa (null) e cada membro, nessa ordem.
  byPerson: { spentBy: string | null; name: string; memberIndex: number; spentCents: number }[];
};

// Meses de `first` a `last` ("YYYY-MM"), inclusive.
const monthsBetween = (first: string, last: string) => {
  const a = parseYearMonth(first)!;
  const b = parseYearMonth(last)!;
  return (b.year - a.year) * 12 + (b.month - a.month) + 1;
};

// Junta os dados da Visão geral. Toda regra vem de lib/finance; aqui só se busca e combina.
// `month: "all"` = todos os meses até o atual.
export async function getMonthOverview(
  db: Db,
  {
    householdId,
    month: requested,
    today,
  }: { householdId: string; month: YearMonth | "all"; today: string },
): Promise<MonthOverview> {
  const allMonths = requested === "all";
  const month = allMonths ? yearMonthOf(today) : requested;
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
  const cycleCards = accounts.filter(isCycleCard);
  // Em que mês cada lançamento conta: no cartão, a fatura (pelo nome do cartão); o resto, a data.
  const monthOf = invoiceMonthOf(
    cycleCards.map((c) => ({ id: c.id, closingDay: c.closingDay, dueDay: c.dueDay, naming: c.invoiceNaming })),
  );
  const budgets = buildBudgetStatus(budgetList, ledger, { month, today, monthOf });
  const period: Period = allMonths ? { until: month } : month;
  const firstMonth = firstMonthOf(ledger, month, monthOf);
  const monthsCount = allMonths && firstMonth ? monthsBetween(firstMonth, toYearMonth(month)) : 1;

  // Gastos por categoria: as que tiveram gasto no mês + as que têm orçamento (mesmo sem gasto).
  const categoryById = new Map(categoryList.map((c) => [c.id, c]));
  const budgetByCategory = new Map(budgets.categories.map((b) => [b.categoryId, b]));
  // Em todos os meses não há orçamento (é mensal): só o gasto por categoria.
  const spent = expensesByCategory(ledger, period, monthOf);
  const categories: CategorySpending[] = spent.map(({ categoryId, spentCents }) => {
    const category = categoryId ? categoryById.get(categoryId) : undefined;
    return {
      categoryId,
      name: category?.name ?? "Sem categoria",
      icon: category?.icon ?? null,
      spentCents,
      budget: (!allMonths && categoryId && budgetByCategory.get(categoryId)) || null,
    };
  });
  for (const budget of allMonths ? [] : budgets.categories) {
    if (spent.some((s) => s.categoryId === budget.categoryId)) continue;
    categories.push({
      categoryId: budget.categoryId,
      name: budget.category?.name ?? "Categoria",
      icon: budget.category?.icon ?? null,
      spentCents: 0,
      budget,
    });
  }

  const invoices: CardInvoiceSummary[] = cycleCards
    .map((a) => {
      const result = cardInvoices(toCardAccount(a, settled), ledger, today);
      return {
        account: {
          id: a.id,
          name: a.name,
          archived: a.archived,
          creditLimitCents: a.creditLimitCents,
          invoiceNaming: a.invoiceNaming,
        },
        openName: invoiceLabel(result.open, a.invoiceNaming),
        closedNames: Object.fromEntries(result.closedUnpaid.map((i) => [i.ref, invoiceLabel(i, a.invoiceNaming)])),
        ...result,
      };
    })
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
    period: allMonths ? "all" : "month",
    month,
    firstMonth,
    monthsCount,
    today,
    isCurrentMonth,
    hasTransactions: ledger.length > 0,
    summary: summarizeMonth(ledger, period, monthOf),
    budgets,
    categories,
    series: monthlySeries(ledger, month, allMonths ? Math.min(12, Math.max(6, monthsCount)) : 6, monthOf),
    netWorth: netWorthForMonth(month, today, netWorthInput(accounts, ledger, investments, snapshots, settled)),
    invoices,
    insights,
    byPerson: expensesByPerson(
      ledger,
      period,
      members.map((m) => m.userId),
      monthOf,
    ).map((p) => {
      const index = members.findIndex((m) => m.userId === p.spentBy);
      return { ...p, name: index < 0 ? "Casa" : members[index]!.displayName, memberIndex: index };
    }),
  };
}
