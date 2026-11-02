import { daysBetween, formatDayMonth } from "./dates";
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
};

export const MAX_INSIGHTS = 3;
const SEVERITY: Record<InsightTone, number> = { danger: 0, warning: 1, info: 2, positive: 3 };
const WEEK_THRESHOLD_PERCENT = 10;
const INVOICE_WINDOW_DAYS = 7;

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

function weekInsight(input: InsightsInput): Insight | null {
  if (!input.isCurrentMonth || !input.week) return null;
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
  return [monthInsight(input), categoryInsight(input), invoiceInsight(input), weekInsight(input)]
    .filter((insight): insight is Insight => insight !== null)
    .map((insight, order) => ({ insight, order }))
    .sort((a, b) => SEVERITY[a.insight.tone] - SEVERITY[b.insight.tone] || a.order - b.order)
    .slice(0, MAX_INSIGHTS)
    .map(({ insight }) => insight);
}
