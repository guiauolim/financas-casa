import { formatDayMonth } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

const DAY_LETTERS = ["S", "T", "Q", "Q", "S", "S", "D"];
const DAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

// Gasto por dia da semana (segunda → domingo), barras simples com eixo em zero.
export function WeekBars({
  days,
  today,
  className,
}: {
  days: readonly { date: string; spentCents: number }[];
  today: string;
  className?: string;
}) {
  const max = Math.max(1, ...days.map((d) => d.spentCents));
  return (
    <ul className={cn("grid grid-cols-7 gap-1.5", className)} aria-label="Gasto por dia da semana">
      {days.map((day, i) => {
        const isToday = day.date === today;
        const future = day.date > today;
        return (
          <li key={day.date} className="flex flex-col items-center gap-1">
            <div className="flex h-20 w-full items-end rounded-md bg-track/60" aria-hidden>
              <div
                className={cn("w-full rounded-md", isToday ? "bg-primary" : "bg-primary/55")}
                style={{ height: day.spentCents > 0 ? `${Math.max(4, (day.spentCents * 100) / max)}%` : 0 }}
              />
            </div>
            <span
              className={cn("text-[12px]", isToday ? "font-semibold text-foreground" : "text-muted-foreground")}
              aria-hidden
            >
              {DAY_LETTERS[i]}
            </span>
            <span className="sr-only">
              {DAY_NAMES[i]}, {formatDayMonth(day.date)}: {future ? "ainda não chegou" : formatBRL(day.spentCents)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
