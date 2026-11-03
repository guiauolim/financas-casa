import { ChevronLeft, ChevronRight, CreditCard, Plus, Receipt, Trash2 } from "lucide-react";
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
import { SpendingViewToggle, spendingViewNote } from "@/components/spending-view-toggle";
import { EmptyState } from "@/components/empty-state";
import { requireActor } from "@/lib/auth/session";
import { addMonthsToRef } from "@/lib/finance/billing";
import { formatDate, todayInSaoPaulo, toYearMonth } from "@/lib/finance/dates";
import { HOUSE } from "@/lib/finance/spent-by";
import { summarize } from "@/lib/finance/summary";
import { listAccounts } from "@/lib/services/accounts";
import { type CardInvoiceOptions, listCardInvoiceOptions } from "@/lib/services/card-invoices";
import { listCategories } from "@/lib/services/categories";
import { listMembers } from "@/lib/services/households";
import { listTransactions } from "@/lib/services/transactions";
import { createClient } from "@/lib/supabase/server";
import { TX_TYPE_LABELS } from "@/lib/validation/categories";
import { invoiceParam, type TransactionFilters, transactionFiltersSchema } from "@/lib/validation/transactions";
import { capitalize } from "@/lib/utils";
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

const invoiceHref = (accountId: string, ref: string) => `/transacoes?fatura=${invoiceParam(accountId, ref)}`;

async function Transactions({ searchParams }: Pick<PageProps<"/transacoes">, "searchParams">) {
  const filters = transactionFiltersSchema.parse(await searchParams);
  const actor = await requireActor();
  const db = await createClient();
  const today = todayInSaoPaulo();
  const month = monthFromParam(filters.mes, today);
  const monthKey = toYearMonth(month);
  const view = actor.profile.spendingView;
  // Filtro "Fatura": a fatura inteira de um cartão (os outros filtros e o mês não se aplicam).
  const invoiceFilter = filters.fatura ?? null;

  const [transactions, accounts, categories, members, invoiceOptions] = await Promise.all([
    listTransactions(db, {
      householdId: actor.householdId,
      month,
      ...(invoiceFilter
        ? { invoice: invoiceFilter }
        : {
            accountId: filters.conta,
            categoryId: filters.categoria,
            spentBy: filters.pessoa === HOUSE ? null : filters.pessoa,
            view,
          }),
    }),
    listAccounts(db, { householdId: actor.householdId, includeArchived: true }),
    listCategories(db, { householdId: actor.householdId, includeArchived: true }),
    listMembers(db, { householdId: actor.householdId }),
    listCardInvoiceOptions(db, { householdId: actor.householdId, today }),
  ]);
  const summary = summarize(transactions);
  const hasFilters = Boolean(filters.conta || filters.categoria || filters.pessoa || invoiceFilter);
  const memberIndex = (userId: string | null) => members.findIndex((m) => m.userId === userId);

  if (invoiceFilter) {
    return (
      <InvoiceView
        filter={invoiceFilter}
        options={invoiceOptions}
        transactions={transactions}
        memberIndex={memberIndex}
        today={today}
      />
    );
  }

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthNav month={month} href={(m) => filterHref(filters, m)} />
          <SpendingViewToggle view={view} />
        </div>
        <p className="text-[13px] text-muted-foreground">{spendingViewNote(view)}</p>
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
            <Label htmlFor="filtro-pessoa">Pessoa</Label>
            <select id="filtro-pessoa" name="pessoa" defaultValue={filters.pessoa ?? ""} className={selectClassName}>
              <option value="">Todos</option>
              <option value={HOUSE}>Casa</option>
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
        {invoiceOptions.some((o) => o.invoices.length) ? <InvoicePicker options={invoiceOptions} /> : null}
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

// ───────────────────────── Filtro "Fatura" ─────────────────────────

const STATUS_SUFFIX = { open: " · aberta", closed: "", future: " · futura" } as const;

function InvoicePicker({ options, selected }: { options: CardInvoiceOptions; selected?: string }) {
  return (
    <form method="get" action="/transacoes" className="flex flex-wrap items-end gap-2 border-t border-divider pt-4">
      <div className="flex min-w-[min(100%,280px)] flex-1 flex-col gap-2">
        <Label htmlFor="filtro-fatura">Fatura</Label>
        <select id="filtro-fatura" name="fatura" defaultValue={selected ?? ""} className={selectClassName} required>
          <option value="" disabled>
            Escolha o cartão e a fatura
          </option>
          {options
            .filter((o) => o.invoices.length)
            .map(({ card, invoices }) => (
              <optgroup key={card.id} label={card.name}>
                {invoices.map((invoice) => (
                  <option key={invoice.ref} value={invoiceParam(card.id, invoice.ref)}>
                    {capitalize(invoice.name)}
                    {STATUS_SUFFIX[invoice.status]}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </div>
      <Button type="submit" variant="outline">
        <CreditCard aria-hidden />
        Ver fatura
      </Button>
    </form>
  );
}

function InvoiceView({
  filter,
  options,
  transactions,
  memberIndex,
  today,
}: {
  filter: { accountId: string; ref: string };
  options: CardInvoiceOptions;
  transactions: Awaited<ReturnType<typeof listTransactions>>;
  memberIndex: (userId: string | null) => number;
  today: string;
}) {
  const card = options.find((o) => o.card.id === filter.accountId);
  const invoice = card?.invoices.find((i) => i.ref === filter.ref);
  const selected = invoiceParam(filter.accountId, filter.ref);
  if (!card) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Fatura não encontrada"
        description="Escolha um cartão com melhor dia de compra e vencimento cadastrados."
        action={
          <Link href="/transacoes" className={buttonVariants({ variant: "outline" })}>
            Voltar para transações
          </Link>
        }
      />
    );
  }
  const name = invoice ? capitalize(invoice.name) : `Fatura ${filter.ref}`;
  const navButton = buttonVariants({ variant: "ghost", size: "icon" });
  const charges = transactions.filter((tx) => tx.account.id === card.card.id);
  const payments = transactions.filter((tx) => tx.account.id !== card.card.id);

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Link href={invoiceHref(card.card.id, addMonthsToRef(filter.ref, -1))} className={navButton} aria-label="Fatura anterior">
              <ChevronLeft aria-hidden />
            </Link>
            <h2 className="min-w-40 text-center text-[17px] font-semibold" aria-live="polite">
              {name}
            </h2>
            <Link href={invoiceHref(card.card.id, addMonthsToRef(filter.ref, 1))} className={navButton} aria-label="Próxima fatura">
              <ChevronRight aria-hidden />
            </Link>
          </div>
          <Link
            href={invoice ? `/transacoes?mes=${invoice.nameMonth}` : "/transacoes"}
            className={buttonVariants({ variant: "ghost" })}
          >
            Limpar filtro
          </Link>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {card.card.name}
          {invoice ? (
            <>
              {" · "}compras de <span className="font-mono">{formatDate(invoice.periodStart)}</span> a{" "}
              <span className="font-mono">{formatDate(invoice.periodEnd)}</span> · vence{" "}
              <span className="font-mono">{formatDate(invoice.dueDate)}</span>
              {invoice.status === "open" ? " · aberta" : invoice.status === "future" ? " · futura" : ""}
            </>
          ) : null}
          . Inclui parcelas de compras antigas que caíram nesta fatura.
        </p>
        <InvoicePicker options={options} selected={selected} />
      </Panel>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        <Kpi
          label="Total da fatura"
          value={<Money cents={invoice?.chargesCents ?? 0} />}
          hint="Compras e encargos menos estornos, como no banco."
        />
        <Kpi label="Pago" value={<Money cents={invoice?.paidCents ?? 0} />} />
        <Kpi
          label="Falta pagar"
          value={<Money cents={invoice?.remainingCents ?? 0} />}
          hint={
            invoice && invoice.remainingCents > 0 && invoice.dueDate < today
              ? `Venceu em ${formatDate(invoice.dueDate)}.`
              : undefined
          }
        />
      </div>

      {charges.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhum lançamento nesta fatura"
          description="Compras no cartão entram na fatura pelo melhor dia de compra; importadas, pela fatura do arquivo."
        />
      ) : (
        <Panel title="Lançamentos da fatura" description={`${charges.length} ${charges.length === 1 ? "lançamento" : "lançamentos"}`}>
          <TransactionRows
            transactions={charges}
            memberIndex={memberIndex}
            actions={(tx) => <DeleteTransactionButton tx={tx} compact />}
          />
        </Panel>
      )}

      {payments.length ? (
        <Panel title="Pagamentos desta fatura" description="Transferências para o cartão. Não entram no total.">
          <TransactionRows transactions={payments} memberIndex={memberIndex} />
        </Panel>
      ) : null}
    </>
  );
}
