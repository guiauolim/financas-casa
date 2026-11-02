import { Plus, Receipt, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { selectClassName } from "@/components/form";
import { Money } from "@/components/money";
import { MonthNav, monthFromParam } from "@/components/month-nav";
import { PageHeader } from "@/components/page-header";
import { ListSkeleton, Panel } from "@/components/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { requireActor } from "@/lib/auth/session";
import { toYearMonth } from "@/lib/finance/dates";
import { summarize } from "@/lib/finance/summary";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import { listMembers } from "@/lib/services/households";
import { listTransactions } from "@/lib/services/transactions";
import { createClient } from "@/lib/supabase/server";
import { TX_TYPE_LABELS } from "@/lib/validation/categories";
import { type TransactionFilters, transactionFiltersSchema } from "@/lib/validation/transactions";
import { DeleteTransactionButton } from "./delete-transaction-button";
import { TransactionRows } from "./transaction-rows";

export const metadata: Metadata = { title: "Transações" };

export default function TransacoesPage({ searchParams }: PageProps<"/transacoes">) {
  return (
    <>
      <PageHeader
        title="Transações"
        description="Entradas, saídas e transferências."
        actions={
          <>
            <Link href="/transacoes/lixeira" className={buttonVariants({ variant: "outline" })}>
              <Trash2 aria-hidden />
              Lixeira
            </Link>
            <Link href="/transacoes/nova" className={buttonVariants()}>
              <Plus aria-hidden />
              Novo lançamento
            </Link>
          </>
        }
      />
      <Suspense fallback={<TransactionsSkeleton />}>
        <Transactions searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function TransactionsSkeleton() {
  return (
    <>
      <Skeleton className="h-24 w-full rounded-[14px]" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-[14px]" />
        ))}
      </div>
      <ListSkeleton rows={6} />
    </>
  );
}

function filterHref(filters: TransactionFilters, month: string) {
  const params = new URLSearchParams({ mes: month });
  if (filters.conta) params.set("conta", filters.conta);
  if (filters.categoria) params.set("categoria", filters.categoria);
  if (filters.pessoa) params.set("pessoa", filters.pessoa);
  return `/transacoes?${params}`;
}

async function Transactions({ searchParams }: Pick<PageProps<"/transacoes">, "searchParams">) {
  const filters = transactionFiltersSchema.parse(await searchParams);
  const actor = await requireActor();
  const db = await createClient();
  const month = monthFromParam(filters.mes);
  const monthKey = toYearMonth(month);

  const [transactions, accounts, categories, members] = await Promise.all([
    listTransactions(db, {
      householdId: actor.householdId,
      month,
      accountId: filters.conta,
      categoryId: filters.categoria,
      createdBy: filters.pessoa,
    }),
    listAccounts(db, { householdId: actor.householdId, includeArchived: true }),
    listCategories(db, { householdId: actor.householdId, includeArchived: true }),
    listMembers(db, { householdId: actor.householdId }),
  ]);
  const summary = summarize(transactions);
  const hasFilters = Boolean(filters.conta || filters.categoria || filters.pessoa);
  const memberIndex = (userId: string | null) => members.findIndex((m) => m.userId === userId);

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthNav month={month} href={(m) => filterHref(filters, m)} />
        </div>
        <form method="get" action="/transacoes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <input type="hidden" name="mes" value={monthKey} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-conta">Conta</Label>
            <select id="filtro-conta" name="conta" defaultValue={filters.conta ?? ""} className={selectClassName}>
              <option value="">Todas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.archived ? " (arquivada)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-categoria">Categoria</Label>
            <select id="filtro-categoria" name="categoria" defaultValue={filters.categoria ?? ""} className={selectClassName}>
              <option value="">Todas</option>
              {(["expense", "income"] as const).map((type) => (
                <optgroup key={type} label={TX_TYPE_LABELS[type]}>
                  {categories
                    .filter((c) => c.type === type)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.archived ? " (arquivada)" : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-pessoa">Quem lançou</Label>
            <select id="filtro-pessoa" name="pessoa" defaultValue={filters.pessoa ?? ""} className={selectClassName}>
              <option value="">Todos</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
            {hasFilters ? (
              <Link href={`/transacoes?mes=${monthKey}`} className={buttonVariants({ variant: "ghost" })}>
                Limpar
              </Link>
            ) : null}
          </div>
        </form>
      </Panel>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        <Kpi label="Entradas" value={<Money cents={summary.incomeCents} kind="income" />} />
        <Kpi label="Saídas" value={<Money cents={summary.expenseCents} kind="expense" />} />
        <Kpi
          label="Saldo do mês"
          value={<Money cents={summary.balanceCents} />}
          hint="Transferências e pagamentos de fatura não entram nos totais."
        />
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasFilters ? "Nada encontrado com esses filtros" : "Nenhum lançamento neste mês"}
          description={
            hasFilters
              ? "Tente outra conta, categoria ou pessoa, ou limpe os filtros."
              : "Os lançamentos feitos pelo site (e, em breve, pelo WhatsApp) aparecem aqui."
          }
          action={
            <Link href="/transacoes/nova" className={buttonVariants()}>
              <Plus aria-hidden />
              Novo lançamento
            </Link>
          }
        />
      ) : (
        <Panel
          title="Lançamentos"
          description={`${transactions.length} ${transactions.length === 1 ? "lançamento" : "lançamentos"}`}
        >
          <TransactionRows
            transactions={transactions}
            memberIndex={memberIndex}
            actions={(tx) => <DeleteTransactionButton tx={tx} compact />}
          />
        </Panel>
      )}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-border bg-card p-5">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
