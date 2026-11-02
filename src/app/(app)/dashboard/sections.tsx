import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Info,
  Lightbulb,
  type LucideIcon,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { BudgetBar, BudgetText, ProjectionNote } from "@/components/budget-bar";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { MonthNav } from "@/components/month-nav";
import { Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { projectedCents } from "@/lib/finance/budget";
import { formatBRL } from "@/lib/finance/money";
import { daysBetween, formatDayMonth, formatMonthLong, toYearMonth } from "@/lib/finance/dates";
import type { InsightTone } from "@/lib/finance/insights";
import { cn } from "@/lib/utils";
import { TransactionRows } from "../transacoes/transaction-rows";
import { IncomeExpenseChart } from "./income-expense-chart";
import { loadOverview, loadRecent, mesParam } from "./data";

type Props = { searchParams: PageProps<"/dashboard">["searchParams"] };

const mesOf = async ({ searchParams }: Props) => mesParam((await searchParams).mes);

const textLink =
  "inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

// ───────────────────────── Seletor de mês ─────────────────────────

export async function MonthSelector(props: Props) {
  const mes = await mesOf(props);
  const { month } = await loadOverview(mes);
  return (
    <Panel>
      <MonthNav month={month} href={(m) => `/dashboard?mes=${m}`} />
    </Panel>
  );
}

export function MonthSelectorSkeleton() {
  return <Skeleton className="h-[88px] w-full rounded-[14px]" />;
}

// ───────────────────────── KPIs ─────────────────────────

function Kpi({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2 rounded-[14px] border border-border bg-card p-5", className)}>
      <h2 className="text-[13px] text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

const kpiValue = "text-2xl font-semibold tracking-tight";

export async function Kpis(props: Props) {
  const mes = await mesOf(props);
  const overview = await loadOverview(mes);
  const { summary, budgets, netWorth, isCurrentMonth, month } = overview;
  const total = budgets.total;
  const card = budgets.cards[0] ?? null; // o de maior uso

  if (!overview.hasTransactions) {
    return (
      <EmptyState
        icon={Receipt}
        title="Comece pelos lançamentos"
        description="Cadastre contas e cartões e lance as despesas e receitas do mês. A visão geral, os orçamentos e os insights aparecem aqui."
        action={
          <Link href="/transacoes/nova" className={buttonVariants()}>
            <Plus aria-hidden />
            Novo lançamento
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
      <Kpi label="Saldo do mês">
        <Money cents={summary.balanceCents} className={kpiValue} />
        <p className="flex flex-wrap gap-x-3 text-[13px] text-muted-foreground">
          <span>
            Entradas <Money cents={summary.incomeCents} kind="income" />
          </span>
          <span>
            Saídas <Money cents={summary.expenseCents} kind="expense" />
          </span>
        </p>
      </Kpi>

      <Kpi label="Gasto x orçamento do mês">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Money cents={total?.spentCents ?? summary.expenseCents} className={kpiValue} />
          {total ? (
            <span className="text-sm text-muted-foreground">
              de <Money cents={total.limitCents} />
            </span>
          ) : null}
        </p>
        {total ? (
          <>
            <BudgetBar
              progress={total}
              projectionCents={projectedCents(budgets.projection)}
              label="Gasto do mês contra o orçamento"
            />
            {isCurrentMonth ? <ProjectionNote projection={budgets.projection} limitCents={total.limitCents} /> : null}
          </>
        ) : (
          <Link href="/orcamentos/novo?tipo=total" className={textLink}>
            Definir orçamento mensal <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </Kpi>

      <Kpi label={card ? `Limite semanal · ${card.account?.name ?? "cartão"}` : "Limite semanal do cartão"}>
        {card ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Money cents={card.spentCents} className={kpiValue} />
              <span className="text-sm text-muted-foreground">
                de <Money cents={card.limitCents} />
              </span>
            </p>
            <BudgetBar progress={card} label={`Limite semanal ${card.account?.name ?? ""}`} />
            <p className="text-[12px] text-muted-foreground">
              Semana atual: {formatDayMonth(card.range.from)} a {formatDayMonth(card.range.to)}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Nenhum cartão com limite semanal.</p>
            <Link href="/orcamentos/novo?tipo=card" className={textLink}>
              Criar limite semanal <ArrowRight className="size-4" aria-hidden />
            </Link>
          </>
        )}
      </Kpi>

      {/* Único elemento escuro da tela: contas + investimentos − faturas em aberto. */}
      <section className="flex flex-col gap-2 rounded-[14px] bg-foreground p-5 text-card">
        <h2 className="text-[13px] text-card/75">Patrimônio</h2>
        <Money cents={netWorth.totalCents} className={cn(kpiValue, netWorth.totalCents < 0 ? "text-[#F5B4AC]" : "text-card")} />
        <p className={cn("flex items-center gap-1 text-[13px]", netWorth.changeCents < 0 ? "text-[#F5B4AC]" : "text-[#9FE3C9]")}>
          {netWorth.changeCents < 0 ? (
            <TrendingDown className="size-4" aria-hidden />
          ) : (
            <TrendingUp className="size-4" aria-hidden />
          )}
          <span className="font-mono tabular-nums">
            {netWorth.changeCents < 0 ? "−" : "+"}
            {formatBRL(Math.abs(netWorth.changeCents))}
          </span>
          <span className="text-card/75">
            {isCurrentMonth ? "no mês" : `em ${formatMonthLong(month)}`}
          </span>
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-card/15 pt-2 text-[13px]">
          <dt className="text-card/75">Investimentos</dt>
          <dd className="text-right font-mono tabular-nums">{formatBRL(netWorth.investmentsCents)}</dd>
          <dt className="text-card/75">Contas</dt>
          <dd className="text-right font-mono tabular-nums">
            {netWorth.accountsCents < 0 ? "−" : ""}
            {formatBRL(Math.abs(netWorth.accountsCents))}
          </dd>
          <dt className="text-card/75">Faturas em aberto</dt>
          <dd className="text-right font-mono tabular-nums">
            {netWorth.invoicesCents > 0 ? "−" : ""}
            {formatBRL(Math.abs(netWorth.invoicesCents))}
          </dd>
        </dl>
        <Link
          href="/investimentos"
          className="inline-flex min-h-11 items-center gap-1 self-start rounded text-sm font-medium text-card underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-card/50 focus-visible:outline-none"
        >
          Ver investimentos <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}

export function KpisSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4" aria-busy="true" aria-label="Carregando">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-36 rounded-[14px]" />
      ))}
      <Skeleton className="h-36 rounded-[14px] bg-foreground/80" />
    </div>
  );
}

// ───────────────────────── Gastos por categoria ─────────────────────────

const MAX_CATEGORIES = 8;

export async function CategorySpending(props: Props) {
  const mes = await mesOf(props);
  const { categories } = await loadOverview(mes);
  const shown = categories.slice(0, MAX_CATEGORIES);
  return (
    <Panel
      title="Gastos por categoria"
      description="Despesas do mês pela data da compra."
      actions={
        <Link href="/orcamentos" className={textLink}>
          Orçamentos <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
      className="h-full"
    >
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma despesa neste mês.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {shown.map((c) => (
            <li key={c.categoryId ?? "none"} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <CategoryIcon icon={c.icon} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</p>
                <p className="text-right text-sm">
                  <Money cents={c.spentCents} className="font-medium" />
                  {c.budget ? (
                    <span className="text-muted-foreground">
                      {" "}
                      / <Money cents={c.budget.limitCents} />
                    </span>
                  ) : null}
                </p>
              </div>
              {c.budget ? (
                <div className="flex flex-col gap-1 pl-11">
                  <BudgetBar progress={c.budget} label={`Orçamento ${c.name}`} showText={false} />
                  <div className="flex justify-between gap-2">
                    <BudgetText progress={c.budget} className="text-[12px]" />
                    <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{c.budget.percent}%</span>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {categories.length > MAX_CATEGORIES ? (
        <p className="text-[13px] text-muted-foreground">
          E mais {categories.length - MAX_CATEGORIES} {categories.length - MAX_CATEGORIES === 1 ? "categoria" : "categorias"}.
        </p>
      ) : null}
    </Panel>
  );
}

// ───────────────────────── Insights ─────────────────────────

const TONES: Record<InsightTone, { icon: LucideIcon; className: string; label: string }> = {
  danger: { icon: TriangleAlert, className: "text-danger", label: "Alerta" },
  warning: { icon: CircleAlert, className: "text-warning-foreground", label: "Atenção" },
  info: { icon: Info, className: "text-muted-foreground", label: "Informação" },
  positive: { icon: CircleCheck, className: "text-primary", label: "Bom sinal" },
};

export async function Insights(props: Props) {
  const mes = await mesOf(props);
  const { insights } = await loadOverview(mes);
  return (
    <Panel title="Insights" description="Calculados a partir dos lançamentos e orçamentos." className="h-full">
      {insights.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lightbulb className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          Tudo em ordem por aqui. Defina orçamentos para receber alertas.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((insight) => {
            const tone = TONES[insight.tone];
            const Icon = tone.icon;
            return (
              <li key={insight.id} className="flex items-start gap-3 rounded-xl bg-muted/60 p-3 text-sm">
                <Icon className={cn("mt-0.5 size-4 shrink-0", tone.className)} strokeWidth={2} aria-hidden />
                <p>
                  <span className="sr-only">{tone.label}: </span>
                  {insight.text}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ───────────────────────── Entradas x saídas ─────────────────────────

export async function IncomeExpense(props: Props) {
  const mes = await mesOf(props);
  const { series } = await loadOverview(mes);
  const empty = series.every((m) => m.incomeCents === 0 && m.expenseCents === 0);
  return (
    <Panel title="Entradas x saídas" description="Últimos 6 meses. Transferências não entram." className="h-full">
      {empty ? (
        <p className="text-sm text-muted-foreground">Sem lançamentos nos últimos 6 meses.</p>
      ) : (
        <IncomeExpenseChart series={series} />
      )}
    </Panel>
  );
}

// ───────────────────────── Faturas abertas ─────────────────────────

function dueLabel(today: string, dueDate: string) {
  const days = daysBetween(today, dueDate);
  if (days < 0) return `venceu em ${formatDayMonth(dueDate)}`;
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  return `vence em ${formatDayMonth(dueDate)}`;
}

export async function OpenInvoices(props: Props) {
  const mes = await mesOf(props);
  const { invoices, today } = await loadOverview(mes);
  return (
    <Panel title="Faturas abertas" description="Situação de hoje, por cartão." className="h-full">
      {invoices.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">Nenhum cartão de crédito cadastrado.</p>
          <Link href="/configuracoes/contas/nova" className={textLink}>
            Cadastrar cartão <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {invoices.map(({ account, open, closedUnpaid }) => (
            <li key={account.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                  aria-hidden
                >
                  <CreditCard className="size-4" strokeWidth={2} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="text-[12px] text-muted-foreground">
                    Fecha <span className="font-mono">{formatDayMonth(open.closingDate)}</span> · vence{" "}
                    <span className="font-mono">{formatDayMonth(open.dueDate)}</span>
                  </p>
                </div>
                <Money cents={open.remainingCents} className="text-sm font-medium" />
              </div>
              {closedUnpaid.map((invoice) => {
                const late = invoice.dueDate < today;
                return (
                  <p
                    key={invoice.reference}
                    className={cn(
                      "ml-11 rounded-lg px-3 py-2 text-[13px] font-medium",
                      late ? "bg-danger/10 text-danger" : "bg-[#FBEBD9] text-warning-foreground",
                    )}
                  >
                    Fatura fechada: <Money cents={invoice.remainingCents} /> a pagar · {dueLabel(today, invoice.dueDate)}
                  </p>
                );
              })}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ───────────────────────── Últimos lançamentos ─────────────────────────

export async function RecentTransactions(props: Props) {
  const mes = await mesOf(props);
  const { month, transactions, memberIds } = await loadRecent(mes);
  const allHref = `/transacoes?mes=${toYearMonth(month)}`;
  return (
    <Panel
      title="Últimos lançamentos"
      description={`Os mais recentes de ${formatMonthLong(month)}.`}
      actions={
        <Link href={allHref} className={textLink}>
          Ver todos <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lançamento neste mês.</p>
      ) : (
        <TransactionRows transactions={transactions} memberIndex={(id) => memberIds.indexOf(id ?? "")} />
      )}
    </Panel>
  );
}

// ───────────────────────── Skeletons ─────────────────────────

export function PanelSkeleton({ className, rows = 4 }: { className?: string; rows?: number }) {
  return (
    <div
      className={cn("flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5 md:p-6", className)}
      aria-busy="true"
      aria-label="Carregando"
    >
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
