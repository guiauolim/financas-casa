"use client";

import { CircleAlert, CircleCheck, FileUp, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CategoryCombobox } from "@/components/category-combobox";
import { Field, FormError, SelectField, selectClassName } from "@/components/form";
import { SpenderAvatar } from "@/components/member-avatar";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { invoiceLabel } from "@/lib/finance/billing";
import { formatDate, formatDayMonth } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import { defaultSpentBy, HOUSE, spentByFromParam, spentByToParam } from "@/lib/finance/spent-by";
import type { PlannedLine } from "@/lib/importers/card-statement/plan";
import { MAX_UPLOAD_BYTES } from "@/lib/importers/limits";
import type { CardImportPreview } from "@/lib/services/card-import";
import type { FormState } from "@/lib/validation/form";
import { capitalize, cn } from "@/lib/utils";
import { applyCardImportAction, previewCardImportAction } from "./actions";

type Card = { id: string; name: string; closingDay: number | null; dueDay: number | null };
type Category = { id: string; name: string; type: "expense" | "income"; householdDefault: boolean };
type Member = { userId: string; displayName: string; index: number };

// Decisão do usuário sobre uma linha (o resto vem do plano do servidor).
type LineEdit = {
  include: boolean;
  categoryId: string | null;
  spentBy: string; // "casa" ou user_id
  categoryTouched: boolean;
  spentByTouched: boolean;
  remember: boolean; // "lembrar para próximas"
};

type Filter = "all" | "others" | "new" | "skipped";

const STATUS_LABELS = { new: "novo", duplicate: "duplicado", ignored: "ignorado" } as const;

// Fluxo em 3 passos, todo no navegador: (1) cartão + arquivos; (2) finais → pessoa;
// (3) prévia editável e confirmação. Os arquivos ficam só em estado e são reenviados a
// cada chamada (o servidor não guarda nada; o sha256 confere na confirmação).
export function CardImportForm({
  cards,
  paymentAccounts,
  categories,
  members,
}: {
  cards: Card[];
  paymentAccounts: { id: string; name: string }[];
  categories: Category[];
  members: Member[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "holders" | "review">("upload");
  const [accountId, setAccountId] = useState(cards[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<CardImportPreview | null>(null);
  const [holders, setHolders] = useState<Record<string, string>>({});
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [includeFuture, setIncludeFuture] = useState(false);
  const [edits, setEdits] = useState<Record<string, LineEdit>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [bulkSpentBy, setBulkSpentBy] = useState("");
  const [paidDueDates, setPaidDueDates] = useState<Set<string>>(new Set());
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};

  const card = cards.find((c) => c.id === accountId);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const othersId = categories.find((c) => c.type === "expense" && c.name === "Outros")?.id ?? null;
  const memberName = (spentBy: string | null) =>
    spentBy ? (members.find((m) => m.userId === spentBy)?.displayName ?? "—") : "Casa";
  const memberIndex = (spentBy: string | null) => members.findIndex((m) => m.userId === spentBy);

  const baseForm = (holderMap?: Record<string, string>, payment = paymentAccountId) => {
    const formData = new FormData();
    formData.set("accountId", accountId);
    for (const file of files) formData.append("files", file);
    if (holderMap) {
      formData.set("holders", JSON.stringify(Object.entries(holderMap).map(([last4, userId]) => ({ last4, userId }))));
    }
    if (payment) formData.set("paymentAccountId", payment);
    return formData;
  };

  // Estado inicial de cada linha a partir do plano; preserva o que o usuário já mexeu.
  const loadPreview = (next: CardImportPreview) => {
    setPreview(next);
    setEdits((current) => {
      const result: Record<string, LineEdit> = {};
      for (const line of next.lines) {
        const previous = current[line.hash];
        const include = line.status === "new";
        result[line.hash] = previous
          ? // O pagamento muda de status conforme a opção escolhida: segue o plano.
            { ...previous, include: line.kind === "payment" ? include : include && previous.include }
          : {
              include,
              categoryId: line.categoryId,
              spentBy: spentByToParam(line.spentBy),
              categoryTouched: false,
              spentByTouched: false,
              remember: true,
            };
      }
      return result;
    });
  };

  const runPreview = (holderMap: Record<string, string> | undefined, onDone: (p: CardImportPreview) => void, payment?: string) => {
    startTransition(async () => {
      const result = await previewCardImportAction(baseForm(holderMap, payment));
      setState(result);
      if (result.preview) onDone(result.preview);
    });
  };

  // ── Passo 1 ──
  const onUpload = () => {
    if (!accountId) return setState({ fieldErrors: { accountId: "Escolha o cartão." } });
    if (files.length === 0) return setState({ fieldErrors: { files: "Escolha os arquivos da fatura." } });
    if (files.reduce((s, f) => s + f.size, 0) > MAX_UPLOAD_BYTES) {
      return setState({ fieldErrors: { files: "Os arquivos somam mais de 4 MB. Envie em partes." } });
    }
    setEdits({});
    runPreview(undefined, (next) => {
      setHolders(Object.fromEntries(next.holders.map((h) => [h.last4, spentByToParam(h.userId)])));
      setPreview(next);
      setStep("holders");
    });
  };

  // ── Passo 2 ──
  const onHoldersDone = () => {
    setEdits({}); // de quem padrão depende do dono de cada final
    runPreview(holders, (next) => {
      loadPreview(next);
      setPaidDueDates(new Set(next.statements.filter((s) => s.paidDetected).map((s) => s.dueDate)));
      setStep("review");
    });
  };

  // ── Passo 3: edições ──
  const lines = preview?.lines ?? [];
  const visibleLines = lines.filter((line) => {
    if (line.future && !includeFuture) return false;
    const edit = edits[line.hash];
    if (!edit) return false;
    if (filter === "others") return line.type === "expense" && (!edit.categoryId || edit.categoryId === othersId);
    if (filter === "new") return line.status === "new";
    if (filter === "skipped") return line.status !== "new" || !edit.include;
    return true;
  });

  const holderOf = (line: PlannedLine) => (line.cardLast4 ? spentByFromParam(holders[line.cardLast4] ?? HOUSE) : null);

  const setCategory = (hashes: string[], categoryId: string) =>
    setEdits((current) => {
      const next = { ...current };
      for (const hash of hashes) {
        const line = lines.find((l) => l.hash === hash);
        const edit = next[hash];
        const category = categoryById.get(categoryId);
        if (!line || !edit || !category || category.type !== line.type) continue;
        next[hash] = {
          ...edit,
          categoryId,
          categoryTouched: true,
          spentBy: edit.spentByTouched
            ? edit.spentBy
            : spentByToParam(defaultSpentBy({ categoryHouseholdDefault: category.householdDefault, personUserId: holderOf(line) })),
        };
      }
      return next;
    });

  const patch = (hashes: Iterable<string>, change: Partial<LineEdit>) =>
    setEdits((current) => {
      const next = { ...current };
      for (const hash of hashes) {
        const line = lines.find((l) => l.hash === hash);
        if (!next[hash] || !line) continue;
        if (change.include && line.status !== "new") continue;
        if (change.spentBy !== undefined && line.type === "transfer") continue;
        next[hash] = { ...next[hash]!, ...change };
      }
      return next;
    });

  const included = lines.filter((l) => edits[l.hash]?.include && (!l.future || includeFuture));
  const othersCount = included.filter((l) => l.type === "expense" && (!edits[l.hash]!.categoryId || edits[l.hash]!.categoryId === othersId)).length;
  const futureCount = lines.filter((l) => l.future && l.status === "new").length;
  const personMap = new Map<string, number>();
  for (const line of included) {
    if (line.type === "transfer") continue;
    const key = edits[line.hash]!.spentBy;
    personMap.set(key, (personMap.get(key) ?? 0) + (line.type === "expense" ? line.amountCents : -line.amountCents));
  }
  const personTotals = [...personMap].sort((a, b) => b[1] - a[1]);

  const onPaymentChange = (value: string) => {
    setPaymentAccountId(value);
    runPreview(holders, loadPreview, value);
  };

  const onConfirm = () => {
    if (!preview) return;
    const overrides: { hash: string; include?: boolean; categoryId?: string; spentBy?: string }[] = [];
    const rules = new Map<string, string>();
    for (const line of lines) {
      const edit = edits[line.hash];
      if (!edit) continue;
      const override: (typeof overrides)[number] = { hash: line.hash };
      const defaultInclude = line.status === "new";
      if (edit.include !== defaultInclude) override.include = edit.include;
      if (edit.categoryTouched && edit.categoryId && edit.categoryId !== line.categoryId) override.categoryId = edit.categoryId;
      if (line.type !== "transfer" && edit.spentBy !== spentByToParam(line.spentBy)) override.spentBy = edit.spentBy;
      if (Object.keys(override).length > 1) overrides.push(override);
      if (edit.include && edit.categoryTouched && edit.remember && edit.categoryId && line.pattern.length >= 2) {
        rules.set(line.pattern, edit.categoryId);
      }
    }
    const formData = baseForm(holders);
    for (const fp of preview.fingerprints) formData.append("fingerprints", fp);
    formData.set("includeFuture", includeFuture ? "1" : "0");
    formData.set(
      "decisions",
      JSON.stringify({
        overrides,
        rules: [...rules].map(([pattern, categoryId]) => ({ pattern, categoryId })),
        paidDueDates: [...paidDueDates],
      }),
    );
    startTransition(async () => {
      const result = await applyCardImportAction(formData);
      setState(result);
      if (result.success) {
        toast.success(result.success);
        const month = result.months?.at(-1);
        router.push(month ? `/transacoes?mes=${month}` : "/transacoes");
      }
    });
  };

  // ───────────────────────── Render ─────────────────────────

  if (step === "upload") {
    return (
      <Panel className="max-w-2xl">
        <div className="flex flex-col gap-4">
          <SelectField
            name="accountId"
            label="Cartão"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            hint={
              card?.closingDay && card.dueDay
                ? `Melhor dia de compra ${card.closingDay}, vence dia ${card.dueDay}. Titular e adicionais entram no mesmo cartão.`
                : "Titular e adicionais entram no mesmo cartão."
            }
            error={errors.accountId}
          >
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Field
            name="files"
            label="Arquivos da fatura (.xls ou .xlsx, até 4 MB no total)"
            type="file"
            multiple
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            hint="Pode enviar vários meses de uma vez. Os arquivos são lidos só para esta importação e não ficam guardados."
            error={errors.files}
            className="[&_input]:h-auto [&_input]:py-2"
          />
          <FormError message={state.error} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onUpload} disabled={pending}>
              <FileUp aria-hidden />
              {pending ? "Lendo…" : "Continuar"}
            </Button>
            <Link href="/transacoes/nova" className={buttonVariants({ variant: "outline" })}>
              Cancelar
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  if (!preview) return null;

  if (step === "holders") {
    return (
      <Panel
        className="max-w-3xl"
        title="De quem é cada final do cartão?"
        description="Titular, adicionais e cartões virtuais ficam no mesmo cartão; aqui você só diz de quem são os gastos de cada final. Fica salvo para as próximas importações."
      >
        <ul className="flex flex-col divide-y divide-divider">
          {preview.finals.map((final) => (
            <li key={final.last4} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-[180px] flex-1 flex-col gap-0.5">
                <p className="font-mono text-sm font-medium">final {final.last4}</p>
                <p className="text-[13px] text-muted-foreground">
                  {final.holderKind === "titular" ? "Titular" : final.holderKind === "adicional" ? "Adicional" : "Portador"}
                  {final.holderName ? ` · ${final.holderName}` : ""} · {final.lines} lançamento(s)
                </p>
              </div>
              <label className="sr-only" htmlFor={`holder-${final.last4}`}>
                Dono do final {final.last4}
              </label>
              <select
                id={`holder-${final.last4}`}
                className={cn(selectClassName, "w-full sm:w-56")}
                value={holders[final.last4] ?? HOUSE}
                onChange={(e) => setHolders({ ...holders, [final.last4]: e.target.value })}
              >
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
                <option value={HOUSE}>Casa (sem dono)</option>
              </select>
            </li>
          ))}
        </ul>
        <p className="flex gap-2 rounded-lg bg-primary-soft px-3 py-2 text-[13px] text-primary-soft-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Gastos em categorias da casa (Mercado, Moradia...) ficam como &quot;Casa&quot;; os outros, com o dono do final.
          Dá para ajustar na prévia.
        </p>
        <FormError message={state.error ?? errors.holders} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onHoldersDone} disabled={pending}>
            {pending ? "Montando prévia…" : "Ver prévia"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setStep("upload")} disabled={pending}>
            Voltar
          </Button>
        </div>
      </Panel>
    );
  }

  const selectedVisible = visibleLines.filter((l) => selected.has(l.hash)).map((l) => l.hash);
  const allVisibleSelected = visibleLines.length > 0 && selectedVisible.length === visibleLines.length;
  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  return (
    <div className="flex flex-col gap-4">
      {/* Faturas */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        {preview.statements.map((s) => (
          <section key={s.index} className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-5">
            <h2 className="text-[17px] font-semibold">
              {capitalize(
                invoiceLabel(
                  { ref: s.invoiceRef, dueMonth: s.dueDate.slice(0, 7) },
                  preview.card.invoiceNaming,
                ),
              )}
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {preview.card.name} · vence <span className="font-mono">{formatDate(s.dueDate)}</span>
              {s.closingDate ? (
                <>
                  {" "}
                  · fecha <span className="font-mono">{formatDayMonth(s.closingDate)}</span>
                </>
              ) : null}
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Total no arquivo</dt>
              <dd className="text-right">{s.fileTotalCents === null ? "—" : <Money cents={s.fileTotalCents} />}</dd>
              <dt className="text-muted-foreground">Soma das linhas</dt>
              <dd className="text-right">
                <Money cents={s.linesTotalCents} />
              </dd>
            </dl>
            {s.differenceCents === null ? null : s.differenceCents === 0 ? (
              <p className="flex items-center gap-1.5 text-[13px] text-primary">
                <CircleCheck className="size-4" aria-hidden /> Confere com o total da fatura.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-danger">
                <CircleAlert className="size-4" aria-hidden /> Diferença de {formatBRL(Math.abs(s.differenceCents))}{" "}
                {s.differenceCents > 0 ? "a menos nas linhas" : "a mais nas linhas"}.
              </p>
            )}
            <p className="text-[13px] text-muted-foreground">
              {s.counts.new} novo(s) · {s.counts.duplicate} duplicado(s) · {s.counts.ignored} ignorado(s)
            </p>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-primary"
                checked={paidDueDates.has(s.dueDate)}
                onChange={(e) => {
                  const next = new Set(paidDueDates);
                  if (e.target.checked) next.add(s.dueDate);
                  else next.delete(s.dueDate);
                  setPaidDueDates(next);
                }}
              />
              <span>
                <span className="font-medium">Já foi paga</span>
                <span className="block text-muted-foreground">
                  Não entra em &quot;faturas em aberto&quot; nem abate o patrimônio (o pagamento não precisa ser lançado).
                </span>
              </span>
            </label>
            {s.otherInvoiceCount > 0 ? (
              <p className="flex gap-1.5 rounded-lg bg-[#FBEBD9] px-3 py-2 text-[13px] text-warning-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {s.otherInvoiceCount} lançamento(s) cairiam em outra fatura pelo melhor dia de compra cadastrado (dia{" "}
                {preview.card.closingDay}). Eles ficam na fatura do arquivo; confira o melhor dia de compra do cartão.
              </p>
            ) : null}
          </section>
        ))}
      </div>

      {/* Por pessoa e opções */}
      <div className="flex flex-wrap gap-4">
        <Panel title="Por pessoa" description="O que vai entrar agora (gastos − estornos)." className="min-w-[min(100%,280px)] flex-[2]">
          {personTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada marcado para importar.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {personTotals.map(([key, cents]) => {
                const spentBy = spentByFromParam(key);
                return (
                  <li key={key} className="flex items-center gap-3">
                    <SpenderAvatar spentBy={spentBy} name={memberName(spentBy)} index={memberIndex(spentBy)} />
                    <span className="flex-1 text-sm font-medium">{memberName(spentBy)}</span>
                    <Money cents={cents} className="text-sm font-medium" />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Opções" className="min-w-[min(100%,340px)] flex-[3]">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-primary"
              checked={includeFuture}
              onChange={(e) => setIncludeFuture(e.target.checked)}
              disabled={futureCount === 0}
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Criar parcelas futuras ({futureCount})</span>
              <span className="text-[13px] text-muted-foreground">
                Lança agora as parcelas que ainda vão vir depois da última fatura enviada. Quando a fatura delas for
                importada, aparecem como duplicadas.
              </span>
            </span>
          </label>
          <SelectField
            name="paymentAccountId"
            label="Pagamento da fatura anterior"
            value={paymentAccountId}
            onChange={(e) => onPaymentChange(e.target.value)}
            hint="Por padrão o pagamento é ignorado (lance-o como transferência só se ele ainda não estiver no sistema)."
            error={errors.paymentAccountId}
            disabled={pending}
          >
            <option value="">Ignorar</option>
            {paymentAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                Criar transferência de {a.name}
              </option>
            ))}
          </SelectField>
        </Panel>
      </div>

      {/* Lançamentos */}
      <Panel
        title="Lançamentos"
        description={`${included.length} para importar de ${lines.filter((l) => !l.future || includeFuture).length}.`}
        actions={
          othersCount > 0 ? (
            <button
              type="button"
              onClick={() => setFilter("others")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#FBEBD9] px-3 text-[13px] font-medium text-warning-foreground"
            >
              <TriangleAlert className="size-4" aria-hidden /> {othersCount} em &quot;Outros&quot; para revisar
            </button>
          ) : (
            <span className="inline-flex min-h-11 items-center gap-1.5 text-[13px] text-primary">
              <CircleCheck className="size-4" aria-hidden /> Nada em &quot;Outros&quot;
            </span>
          )
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="filtro" className="text-sm font-medium">
              Mostrar
            </label>
            <select id="filtro" className={cn(selectClassName, "w-56")} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="all">Todos</option>
              <option value="others">Só &quot;Outros&quot;</option>
              <option value="new">Só novos</option>
              <option value="skipped">Duplicados, ignorados e desmarcados</option>
            </select>
          </div>
        </div>

        {selectedVisible.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted p-3" role="region" aria-label="Edição em lote">
            <p className="w-full text-sm font-medium">{selectedVisible.length} selecionado(s)</p>
            <div className="flex items-end gap-2">
              <CategoryCombobox
                categories={expenseCategories}
                value={bulkCategory}
                onChange={setBulkCategory}
                label="Categoria para os selecionados"
                className="w-56"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!bulkCategory}
                onClick={() => bulkCategory && setCategory(selectedVisible, bulkCategory)}
              >
                Aplicar categoria
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <label className="sr-only" htmlFor="bulk-spent-by">
                De quem para os selecionados
              </label>
              <select
                id="bulk-spent-by"
                className={cn(selectClassName, "w-44")}
                value={bulkSpentBy}
                onChange={(e) => setBulkSpentBy(e.target.value)}
              >
                <option value="">De quem…</option>
                <option value={HOUSE}>Casa</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={!bulkSpentBy}
                onClick={() => patch(selectedVisible, { spentBy: bulkSpentBy, spentByTouched: true })}
              >
                Aplicar
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={() => patch(selectedVisible, { include: false })}>
              Não importar
            </Button>
            <Button type="button" variant="outline" onClick={() => patch(selectedVisible, { include: true })}>
              Importar
            </Button>
          </div>
        ) : null}

        {visibleLines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {filter === "others" ? 'Nenhum lançamento em "Outros".' : "Nenhum lançamento neste filtro."}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="text-[12px] text-muted-foreground">
                <tr className="border-b border-divider">
                  <th scope="col" className="w-10 py-2 pr-2 font-medium">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      aria-label="Selecionar todos os visíveis"
                      checked={allVisibleSelected}
                      onChange={(e) => {
                        const next = new Set(selected);
                        for (const l of visibleLines) {
                          if (e.target.checked) next.add(l.hash);
                          else next.delete(l.hash);
                        }
                        setSelected(next);
                      }}
                    />
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">Importar</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Data</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Descrição</th>
                  <th scope="col" className="py-2 pr-3 font-medium">De quem</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Parcela</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Valor</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Categoria</th>
                  <th scope="col" className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {visibleLines.map((line) => {
                  const edit = edits[line.hash]!;
                  const isOther = line.type === "expense" && (!edit.categoryId || edit.categoryId === othersId);
                  const canInclude = line.status === "new";
                  return (
                    <tr key={line.hash} className={cn(!edit.include && "text-muted-foreground")}>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          className="size-5 accent-primary"
                          aria-label={`Selecionar ${line.description}`}
                          checked={selected.has(line.hash)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(line.hash);
                            else next.delete(line.hash);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label className="inline-flex min-h-11 items-center">
                          <input
                            type="checkbox"
                            className="size-5 accent-primary"
                            checked={edit.include}
                            disabled={!canInclude}
                            onChange={(e) => patch([line.hash], { include: e.target.checked })}
                          />
                          <span className="sr-only">Importar {line.description}</span>
                        </label>
                      </td>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">{formatDayMonth(line.occurredOn)}</td>
                      <td className="max-w-[280px] py-2 pr-3">
                        <p className="truncate font-medium text-foreground" title={line.description}>
                          {line.description}
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          {line.type === "transfer"
                            ? "Pagamento da fatura"
                            : line.type === "income"
                              ? "Estorno/crédito"
                              : line.kind === "fee"
                                ? "Encargo"
                                : "Compra"}
                          {line.cardLast4 ? ` · final ${line.cardLast4}` : ""}
                          {line.installment && line.purchaseDate !== line.occurredOn ? ` · compra ${formatDate(line.purchaseDate)}` : ""}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        {line.type === "transfer" ? (
                          <span aria-hidden>—</span>
                        ) : (
                          <select
                            aria-label={`De quem é ${line.description}`}
                            className={cn(selectClassName, "w-36")}
                            value={edit.spentBy}
                            onChange={(e) => patch([line.hash], { spentBy: e.target.value, spentByTouched: true })}
                          >
                            <option value={HOUSE}>Casa</option>
                            {members.map((m) => (
                              <option key={m.userId} value={m.userId}>
                                {m.displayName}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">
                        {line.installment ? `${line.installment.number}/${line.installment.total}` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        <Money cents={line.amountCents} kind={line.type} />
                      </td>
                      <td className="py-2 pr-3">
                        {line.type === "transfer" ? (
                          <span className="text-muted-foreground">Transferência</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <CategoryCombobox
                              categories={line.type === "income" ? incomeCategories : expenseCategories}
                              value={edit.categoryId}
                              onChange={(id) => setCategory([line.hash], id)}
                              label={`Categoria de ${line.description}`}
                              highlight={isOther && edit.include}
                              className="w-52"
                            />
                            {edit.categoryTouched ? (
                              <label className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-primary"
                                  checked={edit.remember}
                                  onChange={(e) => patch([line.hash], { remember: e.target.checked })}
                                />
                                Lembrar para próximas (“{line.pattern}”)
                              </label>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="py-2">
                        <StatusBadge line={line} include={edit.include} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <FormError message={state.error ?? errors.files ?? errors.decisions} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onConfirm} disabled={pending || included.length === 0}>
          {pending ? "Salvando…" : `Importar ${included.length} lançamento(s)`}
        </Button>
        <Button type="button" variant="outline" onClick={() => setStep("holders")} disabled={pending}>
          Voltar
        </Button>
      </div>
      {included.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nada novo para importar: tudo já está no sistema ou foi desmarcado.</p>
      ) : null}
    </div>
  );
}

function StatusBadge({ line, include }: { line: PlannedLine; include: boolean }) {
  const label =
    line.status === "duplicate"
      ? line.duplicateOf === "batch"
        ? "duplicado no envio"
        : "já importado"
      : line.status === "ignored"
        ? STATUS_LABELS.ignored
        : include
          ? line.future
            ? "novo · futura"
            : STATUS_LABELS.new
          : "não importar";
  const tone =
    line.status === "new" && include
      ? "bg-primary-soft text-primary-soft-foreground"
      : line.status === "duplicate"
        ? "bg-[#E3ECF8] text-[#2A548F]"
        : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap", tone)}>{label}</span>;
}
