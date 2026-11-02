"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMonthAbbrev } from "@/lib/finance/dates";
import { formatBRL, formatBRLCompact } from "@/lib/finance/money";
import type { InvestedPoint } from "@/lib/finance/portfolio";

type Datum = InvestedPoint & { label: string };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] shadow-sm">
      <p className="mb-1 font-medium first-letter:uppercase">{datum.label}</p>
      <p className="font-mono tabular-nums">{formatBRL(datum.valueCents)}</p>
    </div>
  );
}

// Patrimônio investido no fim de cada mês (barras simples, eixo a partir de zero).
export function InvestedChart({ series }: { series: InvestedPoint[] }) {
  const data: Datum[] = series.map((p) => ({ ...p, label: formatMonthAbbrev(p.month) }));
  return (
    <div className="flex flex-col gap-3">
      <div className="h-64 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="24%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
            <Bar dataKey="valueCents" name="Investido" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Patrimônio investido por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Investido</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.label}</th>
              <td>{formatBRL(d.valueCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
