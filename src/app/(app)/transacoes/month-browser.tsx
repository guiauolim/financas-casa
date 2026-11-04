"use client";

import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, ChevronDown, CreditCard, Plus, Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { selectClassName } from "@/components/form";
import { Money } from "@/components/money";
import { MonthPicker } from "@/components/month-picker";
import { SPENDING_RULE_NOTE } from "@/components/spending-rule-note";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addMonthsToRef } from "@/lib/finance/billing";
import { formatDayMonth } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import {
  type DeleteScope,
  groupMonth,
  hasFollowingInstallments,
  type MonthFilters,
  monthTotals,
  selectionSummary,
  splitOutside,
  sumInvoice,
} from "@/lib/finance/month-view";
import { HOUSE } from "@/lib/finance/spent-by";
import type { MonthInvoice, TransactionsMonth } from "@/lib/services/month-transactions";
import type { Transaction } from "@/lib/services/transactions";
import { cn } from "@/lib/utils";
import { TX_TYPE_LABELS } from "@/lib/validation/categories";
import { transactionFiltersSchema } from "@/lib/validation/transactions";
import { deleteInvoiceAction, deleteTransactionsAction, type DeleteResult } from "./actions";
import { checkboxClassName, type RowSelection, TransactionRows } from "./transaction-rows";

type Options = {
  accounts: { id: string; name: string; archived: boolean }[];
  categories: { id: string; name: string; type: "expense" | "income" | "transfer"; archived: boolean }[];
  members: { userId: string; displayName: string }[];
};

async function fetchMonth(month: string): Promise<TransactionsMonth> {
  const response = await fetch(`/transacoes/dados?mes=${month}`, { cache: "no-store" });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Não foi possível carregar o mês.");
  }
  return response.json();
}

// Atualiza a URL sem passar pelo roteador (o Next sincroniza useSearchParams): trocar de mês ou
// de filtro não renderiza a página no servidor.
function setUrlParams(changes: Record<string, string | null>, mode: "push" | "replace") {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  const url = query ? `?${query}` : window.location.pathname;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

const monthNameFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const monthName = (month: string) => monthNameFormat.format(new Date(`${month}-15T12:00:00Z`));

type Dialog =
  | { kind: "batch"; ids: string[]; following: boolean; summary: ReturnType<typeof selectionSummary> }
  | { kind: "invoice"; item: MonthInvoice; count: number; totalCents: number };

// Tela Transações: o mês manda em tudo. Guarda os meses já vistos em memória, busca antes o
// anterior e o próximo e mantém a tela atual enquanto um mês novo chega (sem skeleton).
export function MonthBrowser({ initial, options }: { initial: TransactionsMonth; options: Options }) {
  const searchParams = useSearchParams();
  const filters = transactionFiltersSchema.parse(Object.fromEntries(searchParams));
  const month = filters.mes ?? initial.month;
  const monthFilters: MonthFilters = {
    accountId: filters.conta,
    categoryId: filters.categoria,
    spentBy: filters.pessoa === HOUSE ? null : filters.pessoa,
  };
  const hasFilters = Boolean(filters.conta || filters.categoria || filters.pessoa);

  // Meses carregados. Quando o servidor manda dados novos (ex.: depois de excluir), o resto do
  // cache é descartado e recarregado.
  const [store, setStore] = useState<Record<string, TransactionsMonth>>(() => ({ [initial.month]: initial }));
  const [seenInitial, setSeenInitial] = useState(initial);
  const generation = useRef(0);
  const inflight = useRef(new Map<string, Promise<TransactionsMonth | null>>());
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setStore({ [initial.month]: initial });
  }
  const [lastShown, setLastShown] = useState(initial.month);
  if (store[month] && lastShown !== month) setLastShown(month);
  const data = store[month] ?? store[lastShown] ?? initial;
  const [loading, startLoading] = useTransition();
  const stale = data.month !== month;

  useEffect(() => {
    generation.current += 1;
    inflight.current.clear();
  }, [initial]);

  const load = useCallback((target: string) => {
    let promise = inflight.current.get(target);
    if (!promise) {
      const gen = generation.current;
      promise = fetchMonth(target)
        .then((result) => (gen === generation.current ? result : null))
        .finally(() => inflight.current.delete(target));
      inflight.current.set(target, promise);
    }
    return promise;
  }, []);

  // Mês da URL ainda não carregado (clique ou voltar/avançar do navegador): busca mantendo a tela.
  const missing = !store[month];
  useEffect(() => {
    if (!missing) return;
    startLoading(async () => {
      try {
        const result = await load(month);
        if (result) startLoading(() => setStore((s) => ({ ...s, [month]: result })));
      } catch {
        toast.error("Não foi possível carregar o mês. Tente de novo.");
      }
    });
  }, [missing, month, load]);

  // Prefetch do mês anterior e do próximo, logo depois de mostrar o atual.
  useEffect(() => {
    if (missing) return;
    const timer = setTimeout(() => {
      for (const neighbor of [addMonthsToRef(month, -1), addMonthsToRef(month, 1)]) {
        if (store[neighbor] || inflight.current.has(neighbor)) continue;
        load(neighbor)
          .then((result) => {
            if (result) setStore((s) => (s[neighbor] ? s : { ...s, [neighbor]: result }));
          })
          .catch(() => {});
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [missing, month, store, load]);

  // Seleção: só vale no mês aberto.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selectionMonth, setSelectionMonth] = useState(month);
  if (selectionMonth !== month) {
    setSelectionMonth(month);
    setSelected(new Set());
  }

  const cards = useMemo(() => data.invoices.map((i) => i.card), [data]);
  const groups = useMemo(
    () => groupMonth(data.transactions, cards, data.month, monthFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monthFilters vem da URL (valores simples)
    [data, cards, monthFilters.accountId, monthFilters.categoryId, monthFilters.spentBy],
  );
  const totals = monthTotals(groups);
  const outside = useMemo(() => splitOutside(groups.outside), [groups]);
  const visible = useMemo(() => [...groups.invoices.flatMap((s) => s.transactions), ...groups.outside], [groups]);
  const selectedVisible = visible.filter((tx) => selected.has(tx.id));

  const selection: RowSelection = {
    selected,
    onToggle: (tx, checked) =>
      setSelected((current) => {
        const next = new Set(current);
        if (checked) next.add(tx.id);
        else next.delete(tx.id);
        return next;
      }),
  };
  const setMany = (txs: readonly Transaction[], checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const tx of txs) {
        if (checked) next.add(tx.id);
        else next.delete(tx.id);
      }
      return next;
    });

  // Seções recolhidas (por id: cartão, "despesas", "receitas" ou "transferencias").
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Link da Visão geral: /transacoes?mes=…#fatura-<cartão> rola até a fatura.
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (target.startsWith("fatura-")) document.getElementById(target)?.scrollIntoView({ block: "start" });
  }, []);

  const memberIndex = (userId: string | null) => options.members.findIndex((m) => m.userId === userId);

  // Exclusão (definitiva). A action chama refresh(): o mês volta do servidor na mesma resposta.
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [deleting, startDeleting] = useTransition();
  const runDelete = (request: () => Promise<DeleteResult>) =>
    startDeleting(async () => {
      const result = await request();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      startDeleting(() => {
        setDialog(null);
        setSelected(new Set());
      });
      toast.success(result.deleted === 1 ? "1 lançamento excluído." : `${result.deleted} lançamentos excluídos.`);
    });

  // Lixeira da seção: os lançamentos visíveis dela (com os filtros), na confirmação de lote.
  const confirmBatch = (txs: readonly Transaction[]) =>
    setDialog({
      kind: "batch",
      ids: txs.map((tx) => tx.id),
      following: hasFollowingInstallments(txs),
      summary: selectionSummary(txs),
    });

  const pending = loading || stale;
  const empty = data.transactions.length === 0 && data.invoices.length === 0;

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthPicker month={month} today={data.today} onChange={(m) => setUrlParams({ mes: m }, "push")} />
          {pending ? (
            <span className="text-[13px] text-muted-foreground" role="status">
              Carregando…
            </span>
          ) : null}
        </div>
        <p className="text-[13px] text-muted-foreground">{SPENDING_RULE_NOTE}</p>
        <Filters options={options} filters={filters} hasFilters={hasFilters} />
      </section>

      <div className={cn("flex flex-col gap-4 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
          <Kpi label="Total do mês" value={<Money cents={totals.totalCents} />} hint="Saídas: cartão + fora do cartão." />
          <Kpi
            label="Receitas do mês"
            value={<Money cents={totals.incomeCents} kind="income" />}
            hint="Salário e outras entradas nas contas."
          />
          <Kpi label="Saldo do mês" value={<Money cents={totals.balanceCents} />} hint="Receitas − total do mês." />
        </div>

        {empty ? (
          <EmptyState
            icon={Receipt}
            title="Nenhum lançamento neste mês"
            description="Os lançamentos feitos pelo site, pelo WhatsApp ou importados das faturas aparecem aqui."
            action={
              <Link href="/transacoes/nova" className={buttonVariants()}>
                <Plus aria-hidden />
                Novo lançamento
              </Link>
            }
          />
        ) : (
          <>
            {groups.invoices.map((section) => {
              const item = data.invoices.find((i) => i.card.id === section.cardId)!;
              const all = data.transactions.filter((tx) => tx.account.id === section.cardId && tx.invoiceRef === section.ref);
              return (
                <InvoiceSection
                  key={section.cardId}
                  item={item}
                  month={data.month}
                  today={data.today}
                  transactions={section.transactions}
                  filtered={hasFilters}
                  collapsed={collapsed.has(section.cardId)}
                  onToggleCollapsed={() => toggleCollapsed(section.cardId)}
                  selection={selection}
                  onSelectAll={setMany}
                  memberIndex={memberIndex}
                  onDeleteInvoice={
                    all.length
                      ? () => setDialog({ kind: "invoice", item, count: all.length, totalCents: sumInvoice(all) })
                      : undefined
                  }
                />
              );
            })}
            <Section
              id="despesas"
              icon={ArrowDownRight}
              title="Despesas fora do cartão"
              subtitle="Pix, débito, dinheiro e boletos com data no mês."
              total={{ cents: totals.outsideCents, kind: "expense" }}
              deleteLabel="Excluir as despesas fora do cartão do mês"
              onDelete={outside.expenses.length ? () => confirmBatch(outside.expenses) : undefined}
              transactions={outside.expenses}
              empty={hasFilters ? "Nenhuma despesa fora do cartão com esses filtros." : "Nenhuma despesa fora do cartão neste mês."}
              collapsed={collapsed.has("despesas")}
              onToggleCollapsed={() => toggleCollapsed("despesas")}
              selection={selection}
              onSelectAll={setMany}
              memberIndex={memberIndex}
            />
            <Section
              id="receitas"
              icon={ArrowUpRight}
              title="Receitas"
              subtitle="Salário e outras entradas nas contas com data no mês."
              total={{ cents: totals.incomeCents, kind: "income" }}
              deleteLabel="Excluir as receitas do mês"
              onDelete={outside.incomes.length ? () => confirmBatch(outside.incomes) : undefined}
              transactions={outside.incomes}
              empty={hasFilters ? "Nenhuma receita com esses filtros." : "Nenhuma receita neste mês."}
              collapsed={collapsed.has("receitas")}
              onToggleCollapsed={() => toggleCollapsed("receitas")}
              selection={selection}
              onSelectAll={setMany}
              memberIndex={memberIndex}
            />
            {outside.transfers.length ? (
              <Section
                id="transferencias"
                icon={ArrowLeftRight}
                title="Transferências"
                subtitle="Entre contas e pagamentos de fatura. Não entram nos totais (o gasto do cartão já está na fatura)."
                deleteLabel="Excluir as transferências do mês"
                onDelete={() => confirmBatch(outside.transfers)}
                transactions={outside.transfers}
                empty=""
                collapsed={collapsed.has("transferencias")}
                onToggleCollapsed={() => toggleCollapsed("transferencias")}
                selection={selection}
                onSelectAll={setMany}
                memberIndex={memberIndex}
              />
            ) : null}
          </>
        )}
      </div>

      {selectedVisible.length ? (
        <div
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card p-3 shadow-lg md:px-5"
          role="region"
          aria-label="Lançamentos selecionados"
        >
          <p className="text-sm">
            <span className="font-mono">{selectedVisible.length}</span>{" "}
            {selectedVisible.length === 1 ? "selecionado" : "selecionados"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmBatch(selectedVisible)}
            >
              <Trash2 aria-hidden />
              Excluir selecionados ({selectedVisible.length})
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={dialog !== null} onOpenChange={(open) => (!open && !deleting ? setDialog(null) : undefined)}>
        <AlertDialogContent>
          {dialog?.kind === "batch" ? (
            <BatchConfirm
              dialog={dialog}
              pending={deleting}
              onConfirm={(scope: DeleteScope) => runDelete(() => deleteTransactionsAction({ ids: dialog.ids, scope }))}
            />
          ) : dialog?.kind === "invoice" ? (
            <InvoiceConfirm
              dialog={dialog}
              month={data.month}
              pending={deleting}
              onConfirm={() =>
                runDelete(() => deleteInvoiceAction({ accountId: dialog.item.card.id, ref: dialog.item.invoice.ref }))
              }
            />
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ───────────────────────── Filtros ─────────────────────────

function Filters({
  options,
  filters,
  hasFilters,
}: {
  options: Options;
  filters: { conta?: string; categoria?: string; pessoa?: string };
  hasFilters: boolean;
}) {
  const change = (key: "conta" | "categoria" | "pessoa") => (event: React.ChangeEvent<HTMLSelectElement>) =>
    setUrlParams({ [key]: event.target.value || null }, "replace");
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
      <div className="flex flex-col gap-2">
        <Label htmlFor="filtro-conta">Conta</Label>
        <select id="filtro-conta" value={filters.conta ?? ""} onChange={change("conta")} className={selectClassName}>
          <option value="">Todas</option>
          {options.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.archived ? " (arquivada)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="filtro-categoria">Categoria</Label>
        <select id="filtro-categoria" value={filters.categoria ?? ""} onChange={change("categoria")} className={selectClassName}>
          <option value="">Todas</option>
          {(["expense", "income"] as const).map((type) => (
            <optgroup key={type} label={TX_TYPE_LABELS[type]}>
              {options.categories
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
        <select id="filtro-pessoa" value={filters.pessoa ?? ""} onChange={change("pessoa")} className={selectClassName}>
          <option value="">Todos</option>
          <option value={HOUSE}>Casa</option>
          {options.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        {hasFilters ? (
          <Button variant="ghost" onClick={() => setUrlParams({ conta: null, categoria: null, pessoa: null }, "replace")}>
            Limpar filtros
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-border bg-card p-5">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ───────────────────────── Seções ─────────────────────────

type SectionProps = {
  transactions: Transaction[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selection: RowSelection;
  onSelectAll: (txs: readonly Transaction[], checked: boolean) => void;
  memberIndex: (userId: string | null) => number;
};

function SelectAll({ transactions, selection, onSelectAll, label }: Omit<SectionProps, "collapsed" | "onToggleCollapsed" | "memberIndex"> & { label: string }) {
  const count = transactions.filter((tx) => selection.selected.has(tx.id)).length;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && count < transactions.length;
  }, [count, transactions.length]);
  return (
    <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-[13px] text-muted-foreground">
      <span className="inline-flex size-11 items-center justify-center">
        <input
          ref={ref}
          type="checkbox"
          className={checkboxClassName}
          checked={count > 0 && count === transactions.length}
          onChange={(event) => onSelectAll(transactions, event.target.checked)}
          aria-label={`Selecionar todos de ${label}`}
        />
      </span>
      Selecionar todos (<span className="font-mono">{transactions.length}</span>)
    </label>
  );
}

function CollapseButton({ collapsed, onClick, controls, label }: { collapsed: boolean; onClick: () => void; controls: string; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-expanded={!collapsed}
      aria-controls={controls}
      aria-label={collapsed ? `Mostrar ${label}` : `Recolher ${label}`}
    >
      <ChevronDown className={cn("transition-transform", collapsed && "-rotate-90")} aria-hidden />
    </Button>
  );
}

function SectionBody({
  id,
  empty,
  label,
  ...props
}: SectionProps & { id: string; empty: string; label: string }) {
  if (props.collapsed) return null;
  return (
    <div id={id} className="flex flex-col gap-1">
      {props.transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          <SelectAll transactions={props.transactions} selection={props.selection} onSelectAll={props.onSelectAll} label={label} />
          <TransactionRows transactions={props.transactions} memberIndex={props.memberIndex} selection={props.selection} />
        </>
      )}
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  subtitle,
  empty,
  total,
  deleteLabel,
  onDelete,
  ...props
}: SectionProps & {
  id: string;
  icon: typeof CreditCard;
  title: string;
  subtitle: string;
  empty: string;
  total?: { cents: number; kind: "expense" | "income" };
  deleteLabel?: string;
  onDelete?: () => void;
}) {
  const bodyId = `secao-${id}`;
  return (
    <section id={id} className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5 md:p-6">
      <header className="flex items-start gap-2">
        <CollapseButton collapsed={props.collapsed} onClick={props.onToggleCollapsed} controls={bodyId} label={title} />
        <span className="mt-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <p className="text-[13px] text-muted-foreground">
            {subtitle}{" "}
            <span className="whitespace-nowrap">
              <span className="font-mono">{props.transactions.length}</span>{" "}
              {props.transactions.length === 1 ? "lançamento" : "lançamentos"}.
            </span>
          </p>
        </div>
        <HeaderEnd total={total} deleteLabel={deleteLabel} onDelete={onDelete} />
      </header>
      <SectionBody id={bodyId} empty={empty} label={title} {...props} />
    </section>
  );
}

// Canto direito do cabeçalho de toda seção: total (Geist Mono) e lixeira só com ícone.
function HeaderEnd({
  total,
  deleteLabel,
  onDelete,
}: {
  total?: { cents: number; kind: "expense" | "income" };
  deleteLabel?: string;
  onDelete?: () => void;
}) {
  if (!total && !onDelete) return null;
  return (
    <div className="ml-auto flex items-center gap-1">
      {total ? (
        <p className="text-[17px] font-semibold">
          <span className="sr-only">Total: </span>
          <Money cents={total.cents} kind={total.kind} />
        </p>
      ) : null}
      {onDelete ? (
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={deleteLabel} title={deleteLabel}>
          <Trash2 aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

const STATUS = { open: "aberta", closed: "fechada", future: "futura" } as const;

function InvoiceSection({
  item,
  month,
  today,
  filtered,
  onDeleteInvoice,
  ...props
}: SectionProps & {
  item: MonthInvoice;
  month: string;
  today: string;
  filtered: boolean;
  onDeleteInvoice?: () => void;
}) {
  const { card, invoice } = item;
  const bodyId = `secao-fatura-${card.id}`;
  const late = invoice.remainingCents > 0 && invoice.dueDate < today;
  const status = invoice.status === "closed" && invoice.remainingCents === 0 && invoice.chargesCents > 0 ? "paga" : STATUS[invoice.status];
  const title = `Fatura ${card.name} · ${monthName(month)}`;
  return (
    <section id={`fatura-${card.id}`} className="flex scroll-mt-4 flex-col gap-4 rounded-[14px] border border-border bg-card p-5 md:p-6">
      <header className="flex flex-wrap items-start gap-2">
        <CollapseButton collapsed={props.collapsed} onClick={props.onToggleCollapsed} controls={bodyId} label={title} />
        <span className="mt-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
          <CreditCard className="size-4" strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
          <h2 className="text-[17px] font-semibold">
            {title}{" "}
            <span className="text-[15px] font-normal text-muted-foreground">
              (<span className="font-mono">{formatDayMonth(invoice.periodStart)}</span> a{" "}
              <span className="font-mono">{formatDayMonth(invoice.periodEnd)}</span>) · vence{" "}
              <span className="font-mono">{formatDayMonth(invoice.dueDate)}</span>
            </span>
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {card.archived ? "Cartão arquivado · " : ""}
            Fatura {status}. Inclui parcelas de compras antigas que caíram nesta fatura.
          </p>
        </div>
        <HeaderEnd
          total={{ cents: invoice.chargesCents, kind: invoice.chargesCents >= 0 ? "expense" : "income" }}
          deleteLabel={`Excluir fatura ${card.name} de ${monthName(month)}`}
          onDelete={onDeleteInvoice}
        />
      </header>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-background p-3 text-sm md:max-w-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[12px] text-muted-foreground">Pago</dt>
          <dd className="font-medium"><Money cents={invoice.paidCents} /></dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[12px] text-muted-foreground">Falta</dt>
          <dd className={cn("font-medium", late && "text-danger")}>
            <Money cents={invoice.remainingCents} />
            {late ? <span className="block text-[12px] font-normal">venceu {formatDayMonth(invoice.dueDate)}</span> : null}
          </dd>
        </div>
      </dl>
      {filtered ? (
        <p className="text-[13px] text-muted-foreground">
          Com os filtros: <Money cents={sumInvoice(props.transactions)} /> em{" "}
          <span className="font-mono">{props.transactions.length}</span>{" "}
          {props.transactions.length === 1 ? "lançamento" : "lançamentos"}.
        </p>
      ) : null}

      <SectionBody
        id={bodyId}
        label={title}
        empty={filtered ? "Nada nesta fatura com esses filtros." : "Nenhum lançamento nesta fatura."}
        {...props}
      />
    </section>
  );
}

// ───────────────────────── Confirmações ─────────────────────────

function BatchConfirm({
  dialog,
  pending,
  onConfirm,
}: {
  dialog: Extract<Dialog, { kind: "batch" }>;
  pending: boolean;
  onConfirm: (scope: DeleteScope) => void;
}) {
  const { count, expenseCents, incomeCents, transferCents } = dialog.summary;
  const parts = [
    expenseCents ? `saídas ${formatBRL(expenseCents)}` : null,
    incomeCents ? `entradas ${formatBRL(incomeCents)}` : null,
    transferCents ? `transferências ${formatBRL(transferCents)}` : null,
  ].filter(Boolean);
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{count === 1 ? "Excluir 1 lançamento?" : `Excluir ${count} lançamentos?`}</AlertDialogTitle>
        <AlertDialogDescription>
          {parts.length ? `Total: ${parts.join(" · ")}. ` : ""}
          {dialog.following ? "Há parcelas entre os selecionados: escolha se as próximas parcelas também saem. " : ""}
          Não dá para desfazer.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
        {dialog.following ? (
          <>
            <Button variant="destructive" disabled={pending} onClick={() => onConfirm("one")}>
              Só as selecionadas
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => onConfirm("following")}>
              E as próximas parcelas
            </Button>
          </>
        ) : (
          <Button variant="destructive" disabled={pending} onClick={() => onConfirm("one")}>
            {pending ? "Excluindo…" : "Excluir"}
          </Button>
        )}
      </AlertDialogFooter>
    </>
  );
}

function InvoiceConfirm({
  dialog,
  month,
  pending,
  onConfirm,
}: {
  dialog: Extract<Dialog, { kind: "invoice" }>;
  month: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Excluir a fatura {dialog.item.card.name} · {monthName(month)}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          {dialog.count === 1 ? "1 lançamento" : `${dialog.count} lançamentos`}, total {formatBRL(dialog.totalCents)}
          , inclusive os que estiverem escondidos pelos filtros. Parcelas de outras faturas e os pagamentos ficam. Não dá
          para desfazer.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
        <Button variant="destructive" disabled={pending} onClick={onConfirm}>
          {pending ? "Excluindo…" : "Excluir fatura"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
