import { CreditCard, Pencil, PiggyBank, Plus, Tags, Trash2, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/action-button";
import { BudgetBar, ProjectionNote } from "@/components/budget-bar";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { MonthNav, monthFromParam } from "@/components/month-nav";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekBars } from "@/components/week-bars";
import { requireActor } from "@/lib/auth/session";
import { projectedCents } from "@/lib/finance/budget";
import { formatDayMonth, todayInSaoPaulo, weekRange } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { type BudgetWithStatus, getBudgetStatus } from "@/lib/services/budgets";
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
        description="Limites mensais da casa e por categoria, e semanais por cartão."
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
  const { total, cards, categories, projection } = report;
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

      <div className="flex flex-wrap gap-4">
        <Panel
          title="Limite mensal da casa"
          description="Todas as despesas do mês."
          className="min-w-[min(100%,320px)] flex-[3]"
          actions={total ? <BudgetActions budget={total} name="mensal da casa" /> : undefined}
        >
          {total ? (
            <>
              <SpentOfLimit {...total} />
              <BudgetBar progress={total} projectionCents={projectedCents(projection)} label="Limite mensal da casa" />
              <ProjectionNote projection={projection} limitCents={total.limitCents} />
            </>
          ) : (
            <InlineEmpty
              icon={Wallet}
              text="Defina quanto a casa pode gastar no mês. A barra mostra o gasto e onde o mês deve fechar no ritmo atual."
              action={newBudgetLink("total", "Criar limite mensal")}
            />
          )}
        </Panel>

        <Panel
          title="Limite semanal por cartão"
          description={`Semana atual, de segunda a domingo (${formatDayMonth(week.from)} a ${formatDayMonth(week.to)}).`}
          className="min-w-[min(100%,280px)] flex-[2]"
        >
          {cards.length ? (
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
          ) : hasCards ? (
            <InlineEmpty
              icon={CreditCard}
              text="Um limite por semana ajuda a segurar o cartão do dia a dia. Pagamento de fatura não conta."
              action={newBudgetLink("card", "Criar limite semanal")}
            />
          ) : (
            <InlineEmpty
              icon={CreditCard}
              text="Cadastre um cartão de crédito em Configurações para definir um limite semanal."
              action={
                <Link href="/configuracoes/contas/nova" className={buttonVariants({ variant: "outline" })}>
                  Cadastrar cartão
                </Link>
              }
            />
          )}
        </Panel>
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
