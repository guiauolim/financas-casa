import { CalendarClock, CreditCard, Pencil, PiggyBank, Plus, Tags, Trash2, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/action-button";
import { BudgetBar, ProjectionNote } from "@/components/budget-bar";
import { CategoryIcon } from "@/components/category-icon";
import { PacingHeadline, PacingSummary, PacingWeeks } from "@/components/invoice-pacing";
import { Money } from "@/components/money";
import { MonthNav, monthFromParam } from "@/components/month-nav";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekBars } from "@/components/week-bars";
import { requireActor } from "@/lib/auth/session";
import { projectedCents } from "@/lib/finance/budget";
import { formatDate, formatDayMonth, toYearMonth, todayInSaoPaulo, weekRange } from "@/lib/finance/dates";
import type { MonthPlan } from "@/lib/finance/month-plan";
import type { BillStatus, RecurringMonth } from "@/lib/finance/recurring";
import type { RecurringBillRow } from "@/lib/services/recurring-bills";
import { listAccounts } from "@/lib/services/accounts";
import { type BudgetWithStatus, getBudgetStatus, type InvoiceBudget } from "@/lib/services/budgets";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { deleteBudgetAction } from "./actions";

export const metadata: Metadata = { title: "Orçamentos" };

const newBudgetLink = (tipo?: string, label = "Novo orçamento") => (
  <Link href={tipo ? `/orcamentos/novo?tipo=${tipo}` : "/orcamentos/novo"} className={buttonVariants()}>
    <Plus aria-hidden />
    {label}
  </Link>
);

export default function OrcamentosPage({ searchParams }: PageProps<"/orcamentos">) {
  return (
    <>
      <PageHeader
        title="Orçamentos"
        description="Limite da fatura do cartão com o quanto ainda dá na semana e limites por categoria."
        actions={newBudgetLink()}
      />
      <Suspense fallback={<BudgetsSkeleton />}>
        <Budgets searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function BudgetsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-16 w-full rounded-[14px]" />
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-48 min-w-[280px] flex-[3] rounded-[14px]" />
        <Skeleton className="h-48 min-w-[280px] flex-[2] rounded-[14px]" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function BudgetActions({ budget, name }: { budget: BudgetWithStatus; name: string }) {
  return (
    <div className="flex gap-1">
      <Link
        href={`/orcamentos/${budget.id}`}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
        aria-label={`Editar orçamento ${name}`}
      >
        <Pencil aria-hidden />
      </Link>
      <ConfirmAction
        action={deleteBudgetAction}
        variant="ghost"
        size="icon"
        aria-label={`Excluir orçamento ${name}`}
        trigger={<Trash2 aria-hidden />}
        title="Excluir orçamento?"
        description={`O limite "${name}" deixa de ser acompanhado. Os lançamentos não mudam.`}
        options={[{ label: "Excluir", fields: { id: budget.id }, destructive: true }]}
      />
    </div>
  );
}

function SpentOfLimit({ spentCents, limitCents, percent }: { spentCents: number; limitCents: number; percent: number }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <Money cents={spentCents} className="text-2xl font-semibold tracking-tight" />
      <span className="text-sm text-muted-foreground">
        de <Money cents={limitCents} />
      </span>
      <span className="ml-auto font-mono text-sm text-muted-foreground tabular-nums">{percent}%</span>
    </p>
  );
}

function InlineEmpty({ icon: Icon, text, action }: { icon: typeof Wallet; text: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl bg-muted/60 p-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
        {text}
      </p>
      {action}
    </div>
  );
}

async function Budgets({ searchParams }: Pick<PageProps<"/orcamentos">, "searchParams">) {
  const actor = await requireActor();
  const db = await createClient();
  const today = todayInSaoPaulo();
  const month = monthFromParam((await searchParams).mes, today);
  const [report, accounts] = await Promise.all([
    getBudgetStatus(db, { householdId: actor.householdId, month, today }),
    listAccounts(db, { householdId: actor.householdId }),
  ]);
  const hasCards = accounts.some((a) => a.kind === "credit_card");
  const { total, cards, categories, projection, invoices, recurring, plan } = report;
  const week = weekRange(today);

  return (
    <>
      <Panel>
        <MonthNav month={month} href={(m) => `/orcamentos?mes=${m}`} />
        <p className="text-[13px] text-muted-foreground">
          Conta o que foi gasto no mês; no cartão, pela fatura (inclusive parcelas de compras antigas). O limite
          semanal segue a data da compra. Transferências, pagamentos de fatura e receitas não entram.
        </p>
      </Panel>

      {invoices.length ? (
        invoices.map((budget) => <InvoiceBudgetPanel key={budget.id} budget={budget} />)
      ) : (
        <Panel title="Limite da fatura" description="Quanto o cartão pode gastar no mês, dividido pelas semanas.">
          {hasCards ? (
            <InlineEmpty
              icon={CreditCard}
              text="Defina o limite da fatura: o site divide pelas semanas e mostra quanto ainda dá para gastar. O que sobrar numa semana passa para as próximas (e o que passar, sai delas)."
              action={newBudgetLink("invoice", "Criar limite da fatura")}
            />
          ) : (
            <InlineEmpty
              icon={CreditCard}
              text="Cadastre um cartão de crédito em Configurações para definir o limite da fatura."
              action={
                <Link href="/configuracoes/contas/nova" className={buttonVariants({ variant: "outline" })}>
                  Cadastrar cartão
                </Link>
              }
            />
          )}
        </Panel>
      )}

      {/* Limites antigos (mensal da casa e semanal fixo): não dá mais para criar, mas os que existem seguem
          aparecendo para acompanhar, editar ou excluir. */}
      {total || cards.length ? (
      <div className="flex flex-wrap gap-4">
        {total ? (
        <Panel
          title="Limite mensal da casa"
          description="Todas as despesas do mês."
          className="min-w-[min(100%,320px)] flex-[3]"
          actions={<BudgetActions budget={total} name="mensal da casa" />}
        >
          <SpentOfLimit {...total} />
          <BudgetBar progress={total} projectionCents={projectedCents(projection)} label="Limite mensal da casa" />
          <ProjectionNote projection={projection} limitCents={total.limitCents} />
        </Panel>
        ) : null}

        {cards.length ? (
        <Panel
          title="Limite semanal por cartão"
          description={`Semana atual, de segunda a domingo (${formatDayMonth(week.from)} a ${formatDayMonth(week.to)}).`}
          className="min-w-[min(100%,280px)] flex-[2]"
        >
          <ul className="flex flex-col divide-y divide-divider">
            {cards.map((card) => (
              <li key={card.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium">
                    <CreditCard className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden />
                    {card.account?.name ?? "Cartão"}
                  </p>
                  <BudgetActions budget={card} name={`semanal ${card.account?.name ?? ""}`.trim()} />
                </div>
                <SpentOfLimit {...card} />
                <BudgetBar progress={card} label={`Limite semanal ${card.account?.name ?? ""}`} />
                <WeekBars days={card.days} today={today} />
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-muted-foreground">
            O limite semanal fixo foi substituído pelo limite da fatura, que calcula a semana sozinho. Este pode ser excluído.
          </p>
        </Panel>
        ) : null}
      </div>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <Panel
          title="Contas fixas do mês"
          description="Aluguel, luz, assinaturas… Nada é lançado sozinho: use “Lançar” quando pagar."
          className="min-w-[min(100%,320px)] flex-[3]"
          actions={
            recurring ? (
              <Link href="/configuracoes/contas-fixas" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Editar
              </Link>
            ) : undefined
          }
        >
          {recurring ? (
            <RecurringList recurring={recurring} month={toYearMonth(month)} />
          ) : (
            <InlineEmpty
              icon={CalendarClock}
              text="Cadastre as contas que se repetem todo mês. Elas aparecem aqui como previstas e entram no plano do mês."
              action={
                <Link href="/configuracoes/contas-fixas/nova" className={buttonVariants()}>
                  <Plus aria-hidden />
                  Cadastrar conta fixa
                </Link>
              }
            />
          )}
        </Panel>
        <PlanPanel plan={plan} hasLimit={invoices.length > 0} />
      </div>

      <Panel
        title="Por categoria"
        description="Gasto do mês contra o limite de cada categoria."
        actions={categories.length ? newBudgetLink("category", "Adicionar categoria") : undefined}
      >
        {categories.length ? (
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
            {categories.map((budget) => (
              <CategoryBudgetCard key={budget.id} budget={budget} />
            ))}
          </ul>
        ) : (
          <InlineEmpty
            icon={Tags}
            text="Escolha as categorias que mais pesam (mercado, restaurantes, lazer…) e defina um limite mensal para cada uma."
            action={newBudgetLink("category", "Criar orçamento por categoria")}
          />
        )}
      </Panel>

      {!total && !cards.length && !categories.length ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <PiggyBank className="size-4" strokeWidth={2} aria-hidden />
          Dica: comece pelo limite mensal da casa e depois detalhe as categorias.
        </p>
      ) : null}
    </>
  );
}

function CategoryBudgetCard({ budget }: { budget: BudgetWithStatus }) {
  const name = budget.category?.name ?? "Categoria";
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border p-5",
        budget.status === "over" && "border-danger/40",
      )}
    >
      <div className="flex items-center gap-2">
        <CategoryIcon icon={budget.category?.icon} />
        <p className="min-w-0 flex-1 truncate font-medium">
          {name}
          {budget.category?.archived ? <span className="text-muted-foreground"> (arquivada)</span> : null}
        </p>
        <BudgetActions budget={budget} name={name} />
      </div>
      <SpentOfLimit {...budget} />
      <BudgetBar progress={budget} label={`Orçamento ${name}`} />
    </li>
  );
}

function InvoiceBudgetPanel({ budget }: { budget: InvoiceBudget }) {
  const name = budget.account?.name ?? "Cartão";
  return (
    <Panel
      title={`Limite da fatura · ${name}`}
      description={`${budget.invoiceLabel.replace(/^f/, "F")} · vence ${formatDate(budget.dueDate)}`}
      actions={<BudgetActions budget={budget} name={`da fatura ${name}`} />}
    >
      <div className="flex flex-wrap gap-6">
        <div className="flex min-w-[min(100%,280px)] flex-[3] flex-col gap-4">
          <PacingSummary pacing={budget.pacing} label={`Limite da fatura ${name}`} />
          <PacingHeadline pacing={budget.pacing} />
        </div>
        <div className="min-w-[min(100%,260px)] flex-[2]">
          <PacingWeeks pacing={budget.pacing} />
        </div>
      </div>
    </Panel>
  );
}

const BILL_STATUS: Record<BillStatus, { label: string; className: string }> = {
  late: { label: "Atrasada", className: "bg-danger/10 text-danger" },
  pending: { label: "Prevista", className: "bg-muted text-muted-foreground" },
  paid: { label: "Paga", className: "bg-primary-soft text-primary-soft-foreground" },
};

function RecurringList({ recurring, month }: { recurring: RecurringMonth<RecurringBillRow>; month: string }) {
  if (!recurring.items.length) {
    return <p className="text-sm text-muted-foreground">Todas as contas fixas estão pausadas.</p>;
  }
  return (
    <>
      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-[13px]">
        <div>
          <dt className="text-muted-foreground">Previsto</dt>
          <dd><Money cents={recurring.expectedCents} className="font-medium" /></dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Lançado</dt>
          <dd><Money cents={recurring.paidCents} className="font-medium" /></dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Falta</dt>
          <dd><Money cents={recurring.pendingCents} className="font-medium" /></dd>
        </div>
      </dl>
      <ul className="flex flex-col divide-y divide-divider">
        {recurring.items.map((item) => {
          const status = BILL_STATUS[item.status];
          return (
            <li key={item.bill.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
              <CategoryIcon icon={item.bill.category?.icon} className="size-9" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{item.bill.name}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium", status.className)}>
                    {status.label}
                  </span>
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {item.status === "paid" && item.paidOn
                    ? `Lançada em ${formatDayMonth(item.paidOn)}`
                    : `${item.status === "late" ? "Venceu" : "Vence"} ${formatDayMonth(item.dueDate)}`}{" "}
                  · {item.bill.account?.name ?? "Conta"}
                </p>
              </div>
              <Money cents={item.status === "paid" ? item.paidCents : item.bill.amountCents} className="text-sm" />
              {item.status === "paid" ? null : (
                <Link
                  href={`/transacoes/nova?conta-fixa=${item.bill.id}&mes=${month}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label={`Lançar ${item.bill.name}`}
                >
                  Lançar
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// Quanto deve sobrar para a reserva (caixinha): regra em lib/finance/month-plan.
function PlanPanel({ plan, hasLimit }: { plan: MonthPlan; hasLimit: boolean }) {
  const rows: [string, number, string?][] = [
    ["Receitas", plan.incomeCents],
    ["Contas fixas", -plan.fixedCents, "Fora do cartão; as não lançadas pelo previsto."],
    ["Cartões", -plan.cardsCents, hasLimit ? "Limite da fatura (ou o gasto, se passou)." : "O gasto da fatura do mês."],
    ["Outros gastos", -plan.otherCents, "Pix e débito já lançados, fora das contas fixas."],
  ];
  return (
    <Panel
      title="Plano do mês"
      description="Quanto deve sobrar para a reserva."
      className="min-w-[min(100%,260px)] flex-[2]"
    >
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map(([label, cents, hint]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt>
              {label}
              {hint ? <span className="block text-[12px] text-muted-foreground">{hint}</span> : null}
            </dt>
            <dd>
              <Money cents={Math.abs(cents)} kind={cents < 0 ? "expense" : cents > 0 ? "income" : undefined} />
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-2">
          <dt className="font-medium">{plan.leftoverCents >= 0 ? "Sobra prevista" : "Vai faltar"}</dt>
          <dd>
            <Money
              cents={Math.abs(plan.leftoverCents)}
              className={cn("text-lg font-semibold", plan.leftoverCents < 0 ? "text-danger" : "text-primary")}
            />
          </dd>
        </div>
      </dl>
      {plan.leftoverCents < 0 ? (
        <p className="text-[13px] text-danger">Neste ritmo, o mês usa a reserva.</p>
      ) : null}
    </Panel>
  );
}
