import { budgetStatus, type BudgetStatus } from "./budget";
import { addDays, daysBetween, weekRange } from "./dates";
import type { DateRange, LedgerEntry } from "./ledger";

// Ritmo semanal do limite mensal do cartão ("limite da fatura").
//
// - O período é o ciclo da fatura (melhor dia de compra até a véspera do próximo).
// - Comprometido = o que já está na fatura com data ANTES do ciclo (parcelas de compras antigas)
//   + `extraCommittedCents` (ex.: contas fixas do cartão ainda não lançadas). Sai do limite antes
//   de dividir pelas semanas.
// - Semanas de segunda a domingo, cortadas nas bordas do ciclo.
// - Liberado da semana = (limite − comprometido − gasto antes da semana) × dias da semana no ciclo
//   ÷ dias que faltam no ciclo (a partir do início da semana). Quem gasta menos numa semana libera
//   mais para as próximas, e o contrário — nada fica gravado: tudo sai dos lançamentos.
// - Só despesas contam (como nos outros orçamentos); estornos e pagamentos ficam de fora.

export type PacingEntry = Pick<LedgerEntry, "type" | "amountCents" | "occurredOn">;

export type PacingWeek = DateRange & {
  allowanceCents: number; // liberado para a semana
  spentCents: number;
  balanceCents: number; // liberado − gasto (> 0 sobrou; < 0 passou)
  status: "done" | "current" | "upcoming";
};

export type CardPacing = {
  phase: "past" | "current" | "future";
  cycle: DateRange;
  limitCents: number;
  committedCents: number; // parcelas antigas + extras
  spentCents: number; // gasto com data dentro do ciclo (até hoje no ciclo atual; inteiro nos outros)
  usedCents: number; // comprometido + gasto
  remainingCents: number; // quanto ainda dá no ciclo (0 se estourou)
  overCents: number;
  status: BudgetStatus;
  projectedCents: number | null; // fechamento no ritmo atual (só no ciclo atual, a partir do 2º dia)
  weeks: PacingWeek[];
  current: (PacingWeek & { remainingCents: number; overCents: number; weekStatus: BudgetStatus }) | null;
  // Liberado médio por semana daqui para frente, se nada mais for gasto nesta semana (para o
  // aviso "para fechar no limite, as próximas semanas têm R$ X cada"). null sem semanas seguintes.
  nextWeeksCents: number | null;
};

// Semanas (segunda a domingo) cortadas no ciclo.
export function cycleWeeks(cycle: DateRange): DateRange[] {
  const weeks: DateRange[] = [];
  let from = cycle.from;
  while (from <= cycle.to) {
    const sunday = weekRange(from).to;
    const to = sunday < cycle.to ? sunday : cycle.to;
    weeks.push({ from, to });
    from = addDays(to, 1);
  }
  return weeks;
}

const dayCount = ({ from, to }: DateRange) => daysBetween(from, to) + 1;

// Quanto liberar para `days` dias dos `daysLeft` que faltam, com `availableCents` sobrando.
const share = (availableCents: number, days: number, daysLeft: number) =>
  availableCents > 0 && daysLeft > 0 ? Math.floor((availableCents * days) / daysLeft) : 0;

// Status da semana: com liberado 0, qualquer gasto já é "estourou".
function weekStatus(spentCents: number, allowanceCents: number): BudgetStatus {
  if (allowanceCents <= 0) return spentCents > 0 ? "over" : "ok";
  return budgetStatus(spentCents, allowanceCents).status;
}

export function cardPacing({
  limitCents,
  cycle,
  today,
  invoiceEntries,
  extraCommittedCents = 0,
}: {
  limitCents: number;
  cycle: DateRange;
  today: string;
  invoiceEntries: readonly PacingEntry[]; // lançamentos do cartão que caem NESTA fatura
  extraCommittedCents?: number;
}): CardPacing {
  if (!(limitCents > 0)) throw new RangeError("O limite precisa ser maior que zero.");
  const phase = today < cycle.from ? "future" : today > cycle.to ? "past" : "current";

  // Gasto por dia dentro do ciclo; o resto da fatura é comprometido.
  let committed = Math.max(0, extraCommittedCents);
  const byDay = new Map<string, number>();
  for (const e of invoiceEntries) {
    if (e.type !== "expense") continue;
    if (e.occurredOn < cycle.from || e.occurredOn > cycle.to) committed += e.amountCents;
    else byDay.set(e.occurredOn, (byDay.get(e.occurredOn) ?? 0) + e.amountCents);
  }
  const spentIn = ({ from, to }: DateRange) => {
    let sum = 0;
    for (const [day, cents] of byDay) if (day >= from && day <= to) sum += cents;
    return sum;
  };

  const spent = spentIn(cycle);
  const used = committed + spent;
  const progress = budgetStatus(used, limitCents);
  const available = limitCents - committed;

  const tomorrow = addDays(today, 1);
  const upcomingFrom = tomorrow > cycle.from ? tomorrow : cycle.from;
  const weeks: PacingWeek[] = cycleWeeks(cycle).map((week) => {
    const status = week.to < today ? "done" : week.from > today ? "upcoming" : "current";
    const before = spentIn({ from: cycle.from, to: addDays(week.from, -1) });
    const daysLeft = dayCount({ from: week.from, to: cycle.to });
    // Semanas que ainda não começaram: estimativa com o gasto até hoje (o que sobrar agora).
    const base = status === "upcoming" ? available - spentIn({ from: cycle.from, to: today }) : available - before;
    const left = status === "upcoming" ? dayCount({ from: upcomingFrom, to: cycle.to }) : daysLeft;
    const allowanceCents = share(base, dayCount(week), left);
    const spentCents = status === "upcoming" ? 0 : spentIn(week);
    return { ...week, allowanceCents, spentCents, balanceCents: allowanceCents - spentCents, status };
  });

  const currentWeek = phase === "current" ? (weeks.find((w) => w.status === "current") ?? null) : null;
  const current = currentWeek
    ? {
        ...currentWeek,
        remainingCents: Math.max(0, currentWeek.balanceCents),
        overCents: Math.max(0, -currentWeek.balanceCents),
        weekStatus: weekStatus(currentWeek.spentCents, currentWeek.allowanceCents),
      }
    : null;

  let nextWeeksCents: number | null = null;
  if (currentWeek && currentWeek.to < cycle.to) {
    const afterWeek = { from: addDays(currentWeek.to, 1), to: cycle.to };
    nextWeeksCents = share(available - spentIn({ from: cycle.from, to: today }), 7, dayCount(afterWeek));
    // Semana final curta: no máximo o que sobra.
    nextWeeksCents = Math.min(nextWeeksCents, Math.max(0, available - spentIn({ from: cycle.from, to: today })));
  }

  let projectedCents: number | null = null;
  if (phase === "past") projectedCents = used;
  else if (phase === "current" && today > cycle.from) {
    const elapsed = dayCount({ from: cycle.from, to: today });
    const toDate = spentIn({ from: cycle.from, to: today });
    projectedCents = Math.max(used, committed + Math.round((toDate * dayCount(cycle)) / elapsed));
  }

  return {
    phase,
    cycle,
    limitCents,
    committedCents: committed,
    spentCents: spent,
    usedCents: used,
    remainingCents: progress.remainingCents,
    overCents: progress.overCents,
    status: progress.status,
    projectedCents,
    weeks,
    current,
    nextWeeksCents,
  };
}
