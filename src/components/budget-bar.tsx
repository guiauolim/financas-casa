import type { BudgetProgress, BudgetStatus, MonthProjection } from "@/lib/finance/budget";
import { formatBRL } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

const BAR: Record<BudgetStatus, string> = { ok: "bg-primary", attention: "bg-warning", over: "bg-danger" };
const TEXT: Record<BudgetStatus, string> = {
  ok: "text-muted-foreground",
  attention: "text-warning-foreground",
  over: "text-danger",
};

const pct = (value: number, scale: number) => `${Math.min(100, (value * 100) / scale)}%`;

const mono = (cents: number) => <span className="font-mono tabular-nums">{formatBRL(cents)}</span>;

// Texto que acompanha a barra (o status nunca é só a cor).
export function BudgetText({
  progress,
  className,
}: {
  progress: Pick<BudgetProgress, "status" | "remainingCents" | "overCents">;
  className?: string;
}) {
  const { status } = progress;
  return (
    <p className={cn("text-[13px]", TEXT[status], status !== "ok" && "font-medium", className)}>
      {status === "over" ? (
        <>Estourou · {mono(progress.overCents)} acima do limite</>
      ) : status === "attention" ? (
        <>Atenção · restam {mono(progress.remainingCents)}</>
      ) : (
        <>Restam {mono(progress.remainingCents)}</>
      )}
    </p>
  );
}

// Barra de orçamento: verde < 80%, âmbar 80–100%, vermelha > 100%.
// Com `projectionCents`, mostra um marcador da projeção do mês. Quando gasto ou projeção
// passam do limite, a escala cresce e uma linha marca onde está o limite.
export function BudgetBar({
  progress,
  projectionCents,
  label,
  showText = true,
  className,
}: {
  progress: BudgetProgress;
  projectionCents?: number | null;
  label: string;
  showText?: boolean;
  className?: string;
}) {
  const { spentCents, limitCents, percent, status } = progress;
  const scale = Math.max(limitCents, spentCents, projectionCents ?? 0);
  const projectionOver = projectionCents != null && projectionCents > limitCents;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limitCents}
        aria-valuenow={Math.min(spentCents, limitCents)}
        aria-valuetext={`${formatBRL(spentCents)} de ${formatBRL(limitCents)} (${percent}%)`}
        className="relative h-2.5 w-full rounded-full bg-track"
      >
        <div className={cn("h-full rounded-full", BAR[status])} style={{ width: pct(spentCents, scale) }} />
        {scale > limitCents ? (
          <span
            className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-foreground/40"
            style={{ left: pct(limitCents, scale) }}
            aria-hidden
          />
        ) : null}
        {projectionCents != null && projectionCents > 0 ? (
          <span
            className={cn(
              "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card",
              projectionOver ? "bg-danger" : "bg-foreground",
            )}
            style={{ left: pct(projectionCents, scale) }}
            aria-hidden
          />
        ) : null}
      </div>
      {showText ? <BudgetText progress={progress} /> : null}
    </div>
  );
}

// Legenda do marcador de projeção.
export function ProjectionNote({ projection, limitCents }: { projection: MonthProjection; limitCents?: number }) {
  if (projection.kind === "too-early") {
    return <p className="text-[13px] text-muted-foreground">A projeção do mês aparece a partir do dia 2.</p>;
  }
  if (projection.kind !== "current") return null;
  const over = limitCents !== undefined && projection.projectedCents > limitCents;
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <span
        className={cn("size-2.5 shrink-0 rounded-full", over ? "bg-danger" : "bg-foreground")}
        aria-hidden
      />
      <span>
        No ritmo atual, o mês fecha em {mono(projection.projectedCents)}
        {over ? <span className="font-medium text-danger"> · acima do limite</span> : null}
      </span>
    </p>
  );
}
