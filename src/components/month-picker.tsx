"use client";

import { Popover } from "@base-ui/react/popover";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { addMonthsToRef } from "@/lib/finance/billing";
import { formatMonthLong, parseYearMonth } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pad = (n: number) => String(n).padStart(2, "0");

// ‹ mês › com o nome clicável: abre uma grade de meses com troca de ano.
// `onChange` recebe "YYYY-MM"; a navegação (URL, dados) fica com quem usa.
export function MonthPicker({
  month,
  onChange,
  today,
}: {
  month: string;
  onChange: (month: string) => void;
  today: string; // "YYYY-MM-DD", para marcar o mês atual
}) {
  const [open, setOpen] = useState(false);
  const current = parseYearMonth(month)!;
  const [year, setYear] = useState(current.year);
  const todayMonth = today.slice(0, 7);
  const choose = (value: string) => {
    setOpen(false);
    if (value !== month) onChange(value);
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => onChange(addMonthsToRef(month, -1))}>
        <ChevronLeft aria-hidden />
      </Button>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setYear(current.year);
        }}
      >
        <Popover.Trigger
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "min-h-11 min-w-44 gap-1 text-[17px] font-semibold first-letter:uppercase",
          )}
          aria-label={`${formatMonthLong(current)}. Escolher outro mês`}
        >
          <span className="first-letter:uppercase" aria-live="polite">
            {formatMonthLong(current)}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={8} className="z-50">
            <Popover.Popup className="w-72 rounded-xl border border-border bg-card p-3 shadow-lg outline-none">
              <div className="mb-2 flex items-center justify-between">
                <Button variant="ghost" size="icon" aria-label="Ano anterior" onClick={() => setYear((y) => y - 1)}>
                  <ChevronLeft aria-hidden />
                </Button>
                <Popover.Title className="font-mono text-[15px] font-semibold">{year}</Popover.Title>
                <Button variant="ghost" size="icon" aria-label="Próximo ano" onClick={() => setYear((y) => y + 1)}>
                  <ChevronRight aria-hidden />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1" role="group" aria-label={`Meses de ${year}`}>
                {MONTHS.map((label, index) => {
                  const value = `${year}-${pad(index + 1)}`;
                  const selected = value === month;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => choose(value)}
                      className={cn(
                        "min-h-11 rounded-lg text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        selected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                        !selected && value === todayMonth && "text-primary ring-1 ring-primary/40",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {todayMonth !== month ? (
                <button
                  type="button"
                  onClick={() => choose(todayMonth)}
                  className="mt-2 min-h-11 w-full rounded-lg text-sm font-medium text-primary hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Ir para o mês atual
                </button>
              ) : null}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => onChange(addMonthsToRef(month, 1))}>
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}
