import { BudgetBar } from "@/components/budget-bar";
import { Money } from "@/components/money";
import { type BudgetProgress, budgetStatus } from "@/lib/finance/budget";
import { formatDayMonth } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import type { CardPacing, PacingWeek } from "@/lib/finance/pacing";
import { cn } from "@/lib/utils";

// Limite da fatura com o ritmo semanal (lib/finance/pacing). O status nunca é só a cor.

export const pacingProgress = (p: CardPacing): BudgetProgress => budgetStatus(p.usedCents, p.limitCents);

const mono = (cents: number) => <span className="font-mono tabular-nums">{formatBRL(cents)}</span>;
const range = (w: { from: string; to: string }) =>
  w.from === w.to ? formatDayMonth(w.from) : `${formatDayMonth(w.from)} a ${formatDayMonth(w.to)}`;

// Frase principal: quanto ainda dá para gastar nesta semana.
export function PacingHeadline({ pacing, className }: { pacing: CardPacing; className?: string }) {
  const week = pacing.current;
  if (pacing.phase === "past") {
    return (
      <p className={cn("text-sm", pacing.status === "over" ? "font-medium text-danger" : "text-muted-foreground", className)}>
        {pacing.status === "over" ? (
          <>Fatura fechou {mono(pacing.overCents)} acima do limite.</>
        ) : (
          <>Fatura fechou dentro do limite, com {mono(pacing.remainingCents)} de folga.</>
        )}
      </p>
    );
  }
  if (!week) {
    const first = pacing.weeks[0];
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Começa em {formatDayMonth(pacing.cycle.from)}
        {first ? <> · primeira semana com {mono(first.allowanceCents)}</> : null}.
      </p>
    );
  }
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <p className="text-[13px] text-muted-foreground">Esta semana ({range(week)})</p>
      {week.weekStatus === "over" ? (
        <p className="text-lg font-semibold text-danger">
          Passou {mono(week.overCents)} do liberado
          <span className="block text-[13px] font-normal text-muted-foreground">
            Liberado {mono(week.allowanceCents)}, gasto {mono(week.spentCents)}.
            {pacing.nextWeeksCents !== null ? <> As próximas semanas ficam com cerca de {mono(pacing.nextWeeksCents)} cada.</> : null}
          </span>
        </p>
      ) : (
        <p className={cn("text-lg font-semibold", week.weekStatus === "attention" && "text-warning-foreground")}>
          Ainda dá {mono(week.remainingCents)}
          <span className="block text-[13px] font-normal text-muted-foreground">
            de {mono(week.allowanceCents)} liberados · já foram {mono(week.spentCents)}
          </span>
        </p>
      )}
    </div>
  );
}

// Resumo da fatura: usado (parcelas antigas + compras) contra o limite.
export function PacingSummary({ pacing, label }: { pacing: CardPacing; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <Money cents={pacing.usedCents} className="text-2xl font-semibold tracking-tight" />
        <span className="text-sm text-muted-foreground">
          de <Money cents={pacing.limitCents} />
        </span>
        <span className="ml-auto font-mono text-sm text-muted-foreground tabular-nums">
          {pacingProgress(pacing).percent}%
        </span>
      </p>
      <BudgetBar progress={pacingProgress(pacing)} projectionCents={pacing.phase === "current" ? pacing.projectedCents : null} label={label} />
      <p className="text-[13px] text-muted-foreground">
        Compras {range(pacing.cycle)}: {mono(pacing.spentCents)}
        {pacing.committedCents > 0 ? <> · já comprometido (parcelas e contas fixas): {mono(pacing.committedCents)}</> : null}
        {pacing.phase === "current" && pacing.projectedCents !== null ? (
          <>
            {" "}
            · no ritmo atual, fecha em{" "}
            <span className={cn(pacing.projectedCents > pacing.limitCents && "font-medium text-danger")}>
              {mono(pacing.projectedCents)}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function weekNote(week: PacingWeek) {
  if (week.status === "upcoming") return <>estimado {mono(week.allowanceCents)}</>;
  if (week.status === "current") {
    return week.balanceCents >= 0 ? <>ainda dá {mono(week.balanceCents)}</> : <span className="text-danger">passou {mono(-week.balanceCents)}</span>;
  }
  if (week.balanceCents > 0) return <span className="text-primary">sobrou {mono(week.balanceCents)} · foi para as próximas</span>;
  if (week.balanceCents < 0) return <span className="text-danger">passou {mono(-week.balanceCents)} · saiu das próximas</span>;
  return <>no limite</>;
}

// Semana a semana: liberado × gasto.
export function PacingWeeks({ pacing }: { pacing: CardPacing }) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Semanas da fatura">
      {pacing.weeks.map((week) => {
        const scale = Math.max(1, week.allowanceCents, week.spentCents);
        const over = week.spentCents > week.allowanceCents;
        return (
          <li
            key={week.from}
            className={cn("flex flex-col gap-1", week.status === "current" && "rounded-lg bg-primary-soft/60 p-2 -mx-2")}
            aria-current={week.status === "current" ? "true" : undefined}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
              <span className={cn(week.status === "current" ? "font-medium" : "text-muted-foreground")}>
                {range(week)}
                {week.status === "current" ? " · esta semana" : ""}
              </span>
              <span className="text-muted-foreground">
                {week.status === "upcoming" ? null : (
                  <>
                    {mono(week.spentCents)} de {mono(week.allowanceCents)} ·{" "}
                  </>
                )}
                {weekNote(week)}
              </span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-track" aria-hidden>
              <div
                className={cn("h-full rounded-full", over ? "bg-danger" : week.status === "upcoming" ? "bg-transparent" : "bg-primary")}
                style={{ width: `${Math.min(100, (week.spentCents * 100) / scale)}%` }}
              />
              {over ? (
                <span
                  className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground/40"
                  style={{ left: `${(week.allowanceCents * 100) / scale}%` }}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
