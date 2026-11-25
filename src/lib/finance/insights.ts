import { normalizeMerchant } from "./categorize";
import { addMonthsYM, daysBetween, formatDayMonth, type YearMonth } from "./dates";
import { entriesInMonth, type LedgerEntry, type MonthOf } from "./ledger";
import { formatBRL } from "./money";

// Insights da Visão geral calculados por regra (sem IA). No máximo 3, os mais graves primeiro.

export type InsightTone = "danger" | "warning" | "info" | "positive";
export type Insight = { id: string; tone: InsightTone; text: string };

export type InsightsInput = {
  today: string;
  isCurrentMonth: boolean; // regras "de agora" (projeção, faturas, semana) só no mês atual
  monthlyTotal: { limitCents: number; spentCents: number; projectedCents: number | null } | null;
  categories: readonly { name: string; spentCents: number; limitCents: number }[];
  invoices: readonly { cardName: string; remainingCents: number; dueDate: string }[];
  week: { currentCents: number; previousCents: number } | null;
  // Limite da fatura com a semana em andamento (lib/finance/pacing): substitui o "semana x semana".
  pacing?: {
    cardName: string;
    allowanceCents: number;
    spentCents: number;
    lastWeekBalanceCents: number | null; // sobra (> 0) ou excesso (< 0) da semana anterior no ciclo
    nextWeeksCents: number | null;
  } | null;
  // Categorias do mês contra a média dos 3 meses anteriores (categoryTrends).
  trends?: readonly CategoryTrend[];
  // Maiores comércios da fatura atual (topMerchants).
  merchants?: { cardName: string; items: readonly { name: string; cents: number }[] } | null;
  // Contas fixas não lançadas (lib/finance/recurring): atrasadas e as que vencem em breve.
  bills?: readonly { name: string; dueDate: string; amountCents: number; late: boolean }[];
};

export const MAX_INSIGHTS = 3;
const SEVERITY: Record<InsightTone, number> = { danger: 0, warning: 1, info: 2, positive: 3 };
const WEEK_THRESHOLD_PERCENT = 10;
const INVOICE_WINDOW_DAYS = 7;
const BILL_WINDOW_DAYS = 3;
// Categoria "acima da média": pelo menos 20% e R$ 100 acima (sem ruído de valor pequeno).
export const TREND_MIN_PERCENT = 20;
export const TREND_MIN_CENTS = 10_000;

export type CategoryTrend = { name: string; currentCents: number; averageCents: number };

// Gasto do mês por categoria × média dos `months` meses anteriores (pelo `monthOf` do sistema).
// Só categorias com média > 0 (sem histórico não há comparação).
export function categoryTrends(
  entries: readonly LedgerEntry[],
  { month, monthOf, names, months = 3 }: { month: YearMonth; monthOf: MonthOf; names: ReadonlyMap<string, string>; months?: number },
): CategoryTrend[] {
  const sumBy = (ym: YearMonth) => {
    const totals = new Map<string, number>();
    for (const e of entriesInMonth(entries, ym, monthOf)) {
      if (e.type !== "expense" || !e.categoryId) continue;
      totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amountCents);
    }
    return totals;
  };
  const current = sumBy(month);
  const previous = Array.from({ length: months }, (_, i) => sumBy(addMonthsYM(month, -(i + 1))));
  const trends: CategoryTrend[] = [];
  for (const [categoryId, currentCents] of current) {
    const total = previous.reduce((sum, m) => sum + (m.get(categoryId) ?? 0), 0);
    if (total <= 0) continue;
    trends.push({ name: names.get(categoryId) ?? "Categoria", currentCents, averageCents: Math.round(total / months) });
  }
  return trends;
}

// Maiores comércios (descrição normalizada) entre as despesas dadas.
export function topMerchants(
  entries: readonly { type: LedgerEntry["type"]; amountCents: number; description?: string | null }[],
  limit = 3,
): { name: string; cents: number }[] {
  const totals = new Map<string, { name: string; cents: number }>();
  for (const e of entries) {
    if (e.type !== "expense" || !e.description) continue;
    const key = normalizeMerchant(e.description);
    if (!key) continue;
    const current = totals.get(key);
    if (current) current.cents += e.amountCents;
    else totals.set(key, { name: e.description.trim(), cents: e.amountCents });
  }
  return [...totals.values()].sort((a, b) => b.cents - a.cents).slice(0, limit);
}


function monthInsight(input: InsightsInput): Insight | null {
  const total = input.monthlyTotal;
  if (!total) return null;
  const { limitCents, spentCents, projectedCents } = total;
  if (spentCents > limitCents) {
    const verb = input.isCurrentMonth ? "já passou" : "fechou";
    return {
      id: "month",
      tone: "danger",
      text: `O gasto do mês ${verb} ${formatBRL(spentCents - limitCents)} acima do orçamento.`,
    };
  }
  if (!input.isCurrentMonth) {
    return { id: "month", tone: "positive", text: `O mês fechou dentro do orçamento, com ${formatBRL(limitCents - spentCents)} de folga.` };
  }
  if (projectedCents === null) return null;
  if (projectedCents > limitCents) {
    return {
      id: "month",
      tone: "warning",
      text: `No ritmo atual, o mês fecha em ${formatBRL(projectedCents)}, ${formatBRL(projectedCents - limitCents)} acima do orçamento.`,
    };
  }
  return {
    id: "month",
    tone: "positive",
    text: `No ritmo atual, o mês fecha em ${formatBRL(projectedCents)}, dentro do orçamento.`,
  };
}

function categoryInsight(input: InsightsInput): Insight | null {
  let worst: InsightsInput["categories"][number] | null = null;
  for (const c of input.categories) {
    if (c.spentCents > c.limitCents && (!worst || c.spentCents - c.limitCents > worst.spentCents - worst.limitCents)) {
      worst = c;
    }
  }
  if (worst) {
    return { id: "category", tone: "danger", text: `${worst.name} estourou: ${formatBRL(worst.spentCents - worst.limitCents)} acima do limite.` };
  }
  // Nenhuma estourada: a que está mais perto do limite (≥ 80%).
  let closest: InsightsInput["categories"][number] | null = null;
  for (const c of input.categories) {
    if (c.spentCents * 100 < c.limitCents * 80) continue;
    if (!closest || c.spentCents * closest.limitCents > closest.spentCents * c.limitCents) closest = c;
  }
  if (!closest) return null;
  const percent = Math.floor((closest.spentCents * 100) / closest.limitCents);
  return { id: "category", tone: "warning", text: `${closest.name} já usou ${percent}% do orçamento do mês.` };
}

function dueText(days: number, dueDate: string) {
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  return `vence em ${days} dias (${formatDayMonth(dueDate)})`;
}

function invoiceInsight(input: InsightsInput): Insight | null {
  if (!input.isCurrentMonth) return null;
  const candidates = input.invoices
    .filter((i) => i.remainingCents > 0)
    .map((i) => ({ ...i, days: daysBetween(input.today, i.dueDate) }))
    .filter((i) => i.days <= INVOICE_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);
  const next = candidates[0];
  if (!next) return null;
  if (next.days < 0) {
    return {
      id: "invoice",
      tone: "danger",
      text: `A fatura do ${next.cardName} venceu em ${formatDayMonth(next.dueDate)} e ainda tem ${formatBRL(next.remainingCents)} a pagar.`,
    };
  }
  return {
    id: "invoice",
    tone: "warning",
    text: `A fatura do ${next.cardName}, de ${formatBRL(next.remainingCents)}, ${dueText(next.days, next.dueDate)}.`,
  };
}

function pacingInsight(input: InsightsInput): Insight | null {
  const p = input.pacing;
  if (!p) return null;
  const left = p.allowanceCents - p.spentCents;
  if (left < 0) {
    const next = p.nextWeeksCents !== null ? ` Para fechar a fatura no limite, as próximas semanas têm cerca de ${formatBRL(p.nextWeeksCents)} cada.` : "";
    return { id: "pacing", tone: "danger", text: `${p.cardName}: a semana passou ${formatBRL(-left)} do liberado.${next}` };
  }
  if (p.allowanceCents > 0 && p.spentCents * 100 >= p.allowanceCents * 80) {
    return { id: "pacing", tone: "warning", text: `${p.cardName}: restam ${formatBRL(left)} para esta semana (de ${formatBRL(p.allowanceCents)}).` };
  }
  if (p.lastWeekBalanceCents !== null && p.lastWeekBalanceCents > 0) {
    return {
      id: "pacing",
      tone: "positive",
      text: `${p.cardName}: na semana passada sobraram ${formatBRL(p.lastWeekBalanceCents)}, então esta semana dá ${formatBRL(p.allowanceCents)} (ainda faltam ${formatBRL(left)}).`,
    };
  }
  if (p.lastWeekBalanceCents !== null && p.lastWeekBalanceCents < 0) {
    return {
      id: "pacing",
      tone: "info",
      text: `${p.cardName}: a semana passada passou ${formatBRL(-p.lastWeekBalanceCents)}, então esta semana fica com ${formatBRL(p.allowanceCents)} (ainda faltam ${formatBRL(left)}).`,
    };
  }
  return { id: "pacing", tone: "info", text: `${p.cardName}: esta semana dá ${formatBRL(p.allowanceCents)}; já foram ${formatBRL(p.spentCents)}.` };
}

function billsInsight(input: InsightsInput): Insight | null {
  if (!input.isCurrentMonth || !input.bills?.length) return null;
  const late = input.bills.filter((b) => b.late);
  if (late.length) {
    const first = late[0]!;
    const text =
      late.length === 1
        ? `A conta fixa ${first.name} venceu em ${formatDayMonth(first.dueDate)} e ainda não foi lançada.`
        : `${late.length} contas fixas venceram e ainda não foram lançadas (${formatBRL(late.reduce((s, b) => s + b.amountCents, 0))}).`;
    return { id: "bills", tone: "danger", text };
  }
  const soon = input.bills.filter((b) => {
    const days = daysBetween(input.today, b.dueDate);
    return days >= 0 && days <= BILL_WINDOW_DAYS;
  });
  if (!soon.length) return null;
  const cents = soon.reduce((s, b) => s + b.amountCents, 0);
  const text =
    soon.length === 1
      ? `${soon[0]!.name} (${formatBRL(cents)}) ${dueText(daysBetween(input.today, soon[0]!.dueDate), soon[0]!.dueDate)}.`
      : `${soon.length} contas fixas vencem nos próximos ${BILL_WINDOW_DAYS} dias (${formatBRL(cents)}).`;
  return { id: "bills", tone: "warning", text };
}

function trendInsight(input: InsightsInput): Insight | null {
  let top: CategoryTrend | null = null;
  for (const t of input.trends ?? []) {
    const diff = t.currentCents - t.averageCents;
    if (diff < TREND_MIN_CENTS || diff * 100 < t.averageCents * TREND_MIN_PERCENT) continue;
    if (!top || diff > top.currentCents - top.averageCents) top = t;
  }
  if (!top) return null;
  const percent = Math.round(((top.currentCents - top.averageCents) * 100) / top.averageCents);
  return {
    id: "trend",
    tone: "warning",
    text: `${top.name}: ${formatBRL(top.currentCents)} no mês, ${percent}% acima da média dos últimos 3 meses (${formatBRL(top.averageCents)}).`,
  };
}

function merchantsInsight(input: InsightsInput): Insight | null {
  const m = input.merchants;
  if (!input.isCurrentMonth || !m || !m.items.length) return null;
  const list = m.items.map((i) => `${i.name} (${formatBRL(i.cents)})`).join(", ");
  return { id: "merchants", tone: "info", text: `Maiores gastos da fatura do ${m.cardName}: ${list}.` };
}

function weekInsight(input: InsightsInput): Insight | null {
  if (!input.isCurrentMonth || !input.week || input.pacing) return null;
  const { currentCents, previousCents } = input.week;
  if (previousCents <= 0) return null;
  const diff = currentCents - previousCents;
  const percent = Math.round((Math.abs(diff) * 100) / previousCents);
  if (percent < WEEK_THRESHOLD_PERCENT) return null;
  return {
    id: "week",
    tone: diff > 0 ? "info" : "positive",
    text: `Gastos da semana: ${formatBRL(currentCents)}, ${percent}% ${diff > 0 ? "a mais" : "a menos"} que no mesmo ponto da semana passada.`,
  };
}

export function buildInsights(input: InsightsInput): Insight[] {
  return [
    pacingInsight(input),
    monthInsight(input),
    categoryInsight(input),
    billsInsight(input),
    invoiceInsight(input),
    trendInsight(input),
    weekInsight(input),
    merchantsInsight(input),
  ]
    .filter((insight): insight is Insight => insight !== null)
    .map((insight, order) => ({ insight, order }))
    .sort((a, b) => SEVERITY[a.insight.tone] - SEVERITY[b.insight.tone] || a.order - b.order)
    .slice(0, MAX_INSIGHTS)
    .map(({ insight }) => insight);
}
