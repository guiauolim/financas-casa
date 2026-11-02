import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton, Panel } from "@/components/panel";
import { SourceBadge } from "@/components/source-badge";
import { requireActor } from "@/lib/auth/session";
import { formatDate, todayInSaoPaulo } from "@/lib/finance/dates";
import { listMembers } from "@/lib/services/households";
import { getInvestment, listSnapshots } from "@/lib/services/investments";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { InvestmentForm } from "../investment-form";
import { ValueForm } from "../value-form";

export const metadata: Metadata = { title: "Investimento" };

export default function InvestimentoPage({ params }: PageProps<"/investimentos/[id]">) {
  return (
    <>
      <PageHeader title="Investimento" />
      <Suspense fallback={<FormSkeleton fields={6} />}>
        <InvestmentDetail params={params} />
      </Suspense>
    </>
  );
}

async function InvestmentDetail({ params }: Pick<PageProps<"/investimentos/[id]">, "params">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await requireActor();
  const db = await createClient();
  const today = todayInSaoPaulo();
  const [investment, members, snapshots] = await Promise.all([
    getInvestment(db, { householdId: actor.householdId, investmentId: id.data }),
    listMembers(db, { householdId: actor.householdId }),
    listSnapshots(db, { householdId: actor.householdId, investmentId: id.data }),
  ]);
  if (!investment) notFound();
  const history = [...snapshots].reverse();
  const archived = investment.archivedOn !== null;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-semibold">{investment.name}</h2>
            <p className="text-[13px] text-muted-foreground">
              {investment.valueAsOf ? `Valor em ${formatDate(investment.valueAsOf)}` : "Sem data de valor"}
              {archived ? ` · arquivado em ${formatDate(investment.archivedOn!)}` : null}
            </p>
          </div>
          <SourceBadge source={investment.source} />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Valor bruto</dt>
          <dd className="text-right">
            <Money cents={investment.currentValueCents} className="font-semibold" />
          </dd>
          {investment.netValueCents !== null ? (
            <>
              <dt className="text-muted-foreground">Valor líquido (informado pela B3)</dt>
              <dd className="text-right">
                <Money cents={investment.netValueCents} className="text-muted-foreground" />
              </dd>
            </>
          ) : null}
        </dl>
        {investment.netValueCents !== null ? (
          <p className="text-[12px] text-muted-foreground">
            O líquido desconta IR e taxas de um resgate hoje. É só informativo: o patrimônio usa o valor bruto.
          </p>
        ) : null}
      </Panel>

      {investment.source === "manual" && !archived ? (
        <Panel title="Atualizar valor" description="Grava o valor na data escolhida. Valores antigos só completam o histórico.">
          <div id="valor">
            <ValueForm investmentId={investment.id} today={today} />
          </div>
        </Panel>
      ) : null}

      <Panel title="Dados do ativo">
        <InvestmentForm
          investment={{
            id: investment.id,
            source: investment.source,
            name: investment.name,
            assetClass: investment.assetClass,
            institution: investment.institution,
            ownerUserId: investment.ownerUserId,
            ticker: investment.ticker,
            quantity: investment.quantity,
            avgPriceCents: investment.avgPriceCents,
            aliases: investment.aliases,
          }}
          members={members}
          today={today}
        />
      </Panel>

      <Panel title="Histórico" description="Um valor por data (snapshots).">
        {history.length ? (
          <ul className="flex flex-col divide-y divide-divider">
            {history.map((s, i) => {
              const previous = history[i + 1];
              const change = previous ? s.valueCents - previous.valueCents : null;
              return (
                <li key={s.takenOn} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <span className="font-mono tabular-nums">{formatDate(s.takenOn)}</span>
                  <span className="flex items-baseline gap-3">
                    {change !== null && change !== 0 ? (
                      <span className={cn("font-mono text-[12px] tabular-nums", change > 0 ? "text-primary" : "text-danger")}>
                        {change > 0 ? "+" : "−"}
                        <Money cents={Math.abs(change)} className="text-inherit" />
                      </span>
                    ) : null}
                    <Money cents={s.valueCents} />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>
        )}
      </Panel>
    </div>
  );
}
