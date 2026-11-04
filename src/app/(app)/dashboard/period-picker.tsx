"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MonthPicker } from "@/components/month-picker";

// Seletor da Visão geral: o mesmo de Transações, com "Todos os meses" (padrão, sem `?mes`).
export function PeriodPicker({ month, today }: { month: string | null; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <MonthPicker
        month={month}
        today={today}
        allowAll
        onChange={(value) => startTransition(() => router.push(value ? `/dashboard?mes=${value}` : "/dashboard"))}
      />
      {pending ? (
        <span className="text-[13px] text-muted-foreground" role="status">
          Carregando…
        </span>
      ) : null}
    </div>
  );
}
