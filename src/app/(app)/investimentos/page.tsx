import { Archive, ArchiveRestore, FileSpreadsheet, Pencil, Plus, TrendingUp, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton, ConfirmAction } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { MemberAvatar } from "@/components/member-avatar";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SourceBadge } from "@/components/source-badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireActor } from "@/lib/auth/session";
import { daysBetween, formatDate, todayInSaoPaulo } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import { ASSET_CLASS_LABELS } from "@/lib/finance/portfolio";
import { listMembers, type Member } from "@/lib/services/households";
import { getPortfolio, type PortfolioItem } from "@/lib/services/investments";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { setInvestmentArchivedAction } from "./actions";
import { InvestedChart } from "./invested-chart";

export const metadata: Metadata = { title: "Investimentos" };

const headerActions = (
  <>
    <Link href="/investimentos/importar" className={buttonVariants({ variant: "outline" })}>
      <FileSpreadsheet aria-hidden />
      Importar B3
    </Link>
    <Link href="/investimentos/novo" className={buttonVariants()}>
      <Plus aria-hidden />
      Novo ativo
    </Link>
  </>
);

export default function InvestimentosPage({ searchParams }: PageProps<"/investimentos">) {
  return (
    <>
      <PageHeader title="Investimentos" description="Posições e patrimônio investido da casa." actions={headerActions} />
      <Suspense fallback={<PortfolioSkeleton />}>
        <PortfolioView searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-[14px]" />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-80 min-w-[280px] flex-[3] rounded-[14px]" />
        <Skeleton className="h-80 min-w-[280px] flex-[2] rounded-[14px]" />
      </div>
      <Skeleton className="h-72 w-full rounded-[14px]" />
    </div>
  );
}

const quantityFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const percentFormat = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

function SignedMoney({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cn(
        "font-mono whitespace-nowrap tabular-nums",
        cents > 0 && "text-primary",
        cents < 0 && "text-danger",
        className,
      )}
    >
      {cents > 0 ? "+" : cents < 0 ? "−" : ""}
      {formatBRL(Math.abs(cents))}
    </span>
  );
}

async function PortfolioView({ searchParams }: Pick<PageProps<"/investimentos">, "searchParams">) {
  const { arquivados } = await searchParams;
  const showArchived = arquivados === "1";
  const actor = await requireActor();
  const db = await createClient(); // faz `await connection()` antes do Date.now()
  const today = todayInSaoPaulo();
  const [portfolio, members] = await Promise.all([
    getPortfolio(db, { householdId: actor.householdId, today, includeArchived: showArchived }),
    listMembers(db, { householdId: actor.householdId }),
  ]);
  const memberName = (userId: string) => members.find((m) => m.userId === userId)?.displayName ?? "Membro";
  const activeCount = portfolio.items.filter((i) => i.archivedOn === null).length;

  if (portfolio.items.length === 0 && !showArchived) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Nenhum investimento cadastrado"
        description="Importe o Excel de posição da B3 (Área do Investidor → Extratos → Posição) ou cadastre à mão o que está fora da B3, como cripto, fundos e previdência."
        action={<div className="flex flex-wrap justify-center gap-2">{headerActions}</div>}
      />
    );
  }

  const stale = portfolio.b3Imports.filter((i) => i.stale);

  return (
    <div className="flex flex-col gap-4">
      {stale.length ? (
        <p className="flex items-start gap-2 rounded-xl border border-[#F1D9BD] bg-[#FBF3E9] px-4 py-3 text-[13px] text-warning-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {stale
              .map((i) => `A posição da B3 de ${memberName(i.ownerUserId)} é de ${formatDate(i.referenceDate)} (há ${daysBetween(i.referenceDate, today)} dias).`)
              .join(" ")}{" "}
            Exporte de novo em Extratos → Posição e{" "}
            <Link href="/investimentos/importar" className="font-medium underline underline-offset-4">
              importe
            </Link>
            .
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        <section className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-[13px] text-muted-foreground">Total investido</h2>
          <Money cents={portfolio.totalCents} className="text-2xl font-semibold tracking-tight" />
          <p className="text-[13px] text-muted-foreground">
            {activeCount} {activeCount === 1 ? "ativo" : "ativos"}
          </p>
        </section>
        <section className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-[13px] text-muted-foreground">Variação desde a atualização anterior</h2>
          <SignedMoney cents={portfolio.changeCents} className="text-2xl font-semibold tracking-tight" />
          <p className="text-[13px] text-muted-foreground">Soma de cada ativo: último valor menos o anterior.</p>
        </section>
        <section className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-[13px] text-muted-foreground">Última importação da B3</h2>
          {portfolio.b3Imports.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {portfolio.b3Imports.map((i) => (
                <li key={i.ownerUserId} className="flex items-center justify-between gap-2">
                  <span>{memberName(i.ownerUserId)}</span>
                  <span className={cn("font-mono tabular-nums", i.stale && "text-warning-foreground")}>
                    {formatDate(i.referenceDate)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma ainda.</p>
          )}
          <Link
            href="/investimentos/importar"
            className="inline-flex min-h-11 items-center self-start rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Importar posição
          </Link>
        </section>
      </div>

      <div className="flex flex-wrap gap-4">
        <Panel title="Evolução em 12 meses" description="Patrimônio investido no fim de cada mês." className="min-w-[280px] flex-[3]">
          <InvestedChart series={portfolio.series} />
        </Panel>
        <Panel title="Distribuição por classe" className="min-w-[280px] flex-[2]">
          {portfolio.allocation.length ? (
            <ul className="flex flex-col gap-3">
              {portfolio.allocation.map((a) => (
                <li key={a.assetClass} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{ASSET_CLASS_LABELS[a.assetClass]}</span>
                    <span className="flex items-baseline gap-2">
                      <Money cents={a.valueCents} className="text-[13px] text-muted-foreground" />
                      <span className="w-12 text-right font-mono tabular-nums">{percentFormat.format(a.share)}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-track" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(a.share * 100, 1)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sem ativos com valor.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="Ativos"
        description="Valor bruto. Ativos da B3 são atualizados pela importação; os manuais, por você."
        actions={
          <Link
            href={showArchived ? "/investimentos" : "/investimentos?arquivados=1"}
            className={buttonVariants({ variant: "outline" })}
          >
            {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
          </Link>
        }
      >
        {portfolio.items.length ? (
          <InvestmentTable items={portfolio.items} members={members} />
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum ativo.</p>
        )}
      </Panel>
    </div>
  );
}

function InvestmentTable({ items, members }: { items: PortfolioItem[]; members: Member[] }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Ativo</th>
            <th scope="col" className="px-3 py-2 font-medium">Dono</th>
            <th scope="col" className="px-3 py-2 font-medium">Instituição</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Quantidade</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Valor atual</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Variação</th>
            <th scope="col" className="px-3 py-2 font-medium">Fonte</th>
            <th scope="col" className="py-2 pl-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {items.map((item) => {
            const ownerIndex = members.findIndex((m) => m.userId === item.ownerUserId);
            const owner = members[ownerIndex];
            const archived = item.archivedOn !== null;
            return (
              <tr key={item.id} className={cn(archived && "text-muted-foreground")}>
                <td className="py-3 pr-3">
                  <Link href={`/investimentos/${item.id}`} className="font-medium underline-offset-4 hover:underline">
                    {item.name}
                  </Link>
                  <p className="text-[12px] text-muted-foreground">
                    {[item.ticker, ASSET_CLASS_LABELS[item.assetClass]].filter(Boolean).join(" · ")}
                    {archived ? ` · arquivado em ${formatDate(item.archivedOn!)}` : null}
                  </p>
                </td>
                <td className="px-3 py-3">
                  {owner ? (
                    <MemberAvatar name={owner.displayName} index={ownerIndex} size="sm" />
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Conjunto</span>
                  )}
                </td>
                <td className="max-w-[180px] truncate px-3 py-3 text-[13px]" title={item.institution ?? undefined}>
                  {item.institution ?? "—"}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {item.quantity === null ? "—" : quantityFormat.format(item.quantity)}
                </td>
                <td className="px-3 py-3 text-right">
                  <Money cents={item.currentValueCents} />
                </td>
                <td className="px-3 py-3 text-right">
                  {item.variation ? (
                    <>
                      <SignedMoney cents={item.variation.changeCents} />
                      <p className="text-[12px] text-muted-foreground">desde {formatDate(item.variation.previousDate)}</p>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <SourceBadge source={item.source} />
                    {item.valueAsOf ? (
                      <span className="text-[12px] text-muted-foreground">{formatDate(item.valueAsOf)}</span>
                    ) : null}
                  </div>
                </td>
                <td className="py-3 pl-3">
                  <div className="flex justify-end gap-1">
                    <Link
                      href={`/investimentos/${item.id}`}
                      className={buttonVariants({ variant: "ghost", size: "icon" })}
                      aria-label={item.source === "manual" && !archived ? `Atualizar ou editar ${item.name}` : `Editar ${item.name}`}
                    >
                      <Pencil aria-hidden />
                    </Link>
                    {archived ? (
                      <ActionButton
                        action={setInvestmentArchivedAction}
                        fields={{ id: item.id, archived: "0" }}
                        variant="ghost"
                        size="icon"
                        aria-label={`Reativar ${item.name}`}
                      >
                        <ArchiveRestore aria-hidden />
                      </ActionButton>
                    ) : (
                      <ConfirmAction
                        action={setInvestmentArchivedAction}
                        variant="ghost"
                        size="icon"
                        aria-label={`Arquivar ${item.name}`}
                        trigger={<Archive aria-hidden />}
                        title={`Arquivar ${item.name}?`}
                        description="Use quando o ativo foi vendido ou resgatado. Ele sai dos totais a partir de hoje, mas o histórico continua no gráfico."
                        options={[{ label: "Arquivar", fields: { id: item.id, archived: "1" }, destructive: true }]}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
