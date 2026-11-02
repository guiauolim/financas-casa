import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { addMonthsYM, formatMonthLong, parseYearMonth, todayInSaoPaulo, toYearMonth, type YearMonth } from "@/lib/finance/dates";

// Mês da URL (`?mes=YYYY-MM`); inválido ou ausente = mês de hoje em São Paulo.
export function monthFromParam(value: unknown, today = todayInSaoPaulo()): YearMonth {
  return (typeof value === "string" && parseYearMonth(value)) || parseYearMonth(today.slice(0, 7))!;
}

// Seletor ‹ mês ›. `href` monta o link de cada mês (para manter outros filtros).
export function MonthNav({
  month,
  href,
}: {
  month: YearMonth;
  href: (month: string) => string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={href(toYearMonth(addMonthsYM(month, -1)))}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
        aria-label="Mês anterior"
      >
        <ChevronLeft aria-hidden />
      </Link>
      <h2 className="min-w-40 text-center text-[17px] font-semibold first-letter:uppercase" aria-live="polite">
        {formatMonthLong(month)}
      </h2>
      <Link
        href={href(toYearMonth(addMonthsYM(month, 1)))}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
        aria-label="Próximo mês"
      >
        <ChevronRight aria-hidden />
      </Link>
    </div>
  );
}
