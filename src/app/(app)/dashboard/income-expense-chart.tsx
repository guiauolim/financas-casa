"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMonthAbbrev } from "@/lib/finance/dates";
import { formatBRL, formatBRLCompact } from "@/lib/finance/money";
import type { MonthTotals } from "@/lib/finance/summary";

// Cores do tema: entradas = primary; saídas = chart-3 (azul). Validadas para daltonismo
// (ΔE 14,6 deutan) e contraste ≥ 3:1 sobre o card branco. Sem gradiente.
const INCOME = "var(--primary)";
const EXPENSE = "var(--chart-3)";

type Datum = MonthTotals & { label: string };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] shadow-sm">
      <p className="mb-1 font-medium first-letter:uppercase">{datum.label}</p>
      <p className="flex items-center gap-2">
        <span className="size-2.5 rounded-sm" style={{ background: INCOME }} aria-hidden />
        Entradas <span className="ml-auto pl-3 font-mono tabular-nums">{formatBRL(datum.incomeCents)}</span>
      </p>
      <p className="flex items-center gap-2">
        <span className="size-2.5 rounded-sm" style={{ background: EXPENSE }} aria-hidden />
        Saídas <span className="ml-auto pl-3 font-mono tabular-nums">{formatBRL(datum.expenseCents)}</span>
      </p>
    </div>
  );
}

export function IncomeExpenseChart({ series }: { series: MonthTotals[] }) {
  const data: Datum[] = series.map((m) => ({ ...m, label: formatMonthAbbrev(m.month) }));
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex gap-4 text-[13px] text-muted-foreground" aria-hidden>
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: INCOME }} />
          Entradas
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: EXPENSE }} />
          Saídas
        </li>
      </ul>
      <div className="h-64 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="24%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--divider)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis
              domain={[0, "auto"]}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(v: number) => formatBRLCompact(v)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontFamily: "var(--font-mono)" }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--track)", opacity: 0.6 }} />
            <Bar dataKey="incomeCents" name="Entradas" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expenseCents" name="Saídas" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Tabela equivalente para leitores de tela. */}
      <table className="sr-only">
        <caption>Entradas e saídas por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Entradas</th>
            <th scope="col">Saídas</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.label}</th>
              <td>{formatBRL(d.incomeCents)}</td>
              <td>{formatBRL(d.expenseCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
