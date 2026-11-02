"use client";

import { ArrowRight, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, FormError, SelectField } from "@/components/form";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/finance/money";
import { ASSET_CLASS_LABELS } from "@/lib/finance/portfolio";
import type { B3Preview } from "@/lib/services/investments";
import type { FormState } from "@/lib/validation/form";
import { MAX_B3_FILE_BYTES } from "@/lib/validation/investments";
import { applyB3Action, previewB3Action } from "../actions";

type Member = { userId: string; displayName: string };

const quantityFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const qty = (value: string | null) => (value === null ? "—" : quantityFormat.format(Number(value)));

// Dois passos: (1) envia o arquivo e mostra a prévia; (2) confirma e salva. O arquivo fica
// só no navegador entre os passos (o React limpa o form após a action, por isso o `File`
// fica no estado) e é reenviado na confirmação; o servidor não guarda nada.
export function ImportForm({ members, defaultOwnerId, today }: { members: Member[]; defaultOwnerId: string; today: string }) {
  const router = useRouter();
  const [ownerUserId, setOwnerUserId] = useState(defaultOwnerId);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<B3Preview | null>(null);
  const [referenceDate, setReferenceDate] = useState("");
  const [archiveIds, setArchiveIds] = useState<Set<string>>(new Set());
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};

  const reset = () => {
    setPreview(null);
    setState({});
  };

  const onPreview = () => {
    if (!file) return setState({ fieldErrors: { file: "Escolha o arquivo exportado da B3." } });
    if (file.size > MAX_B3_FILE_BYTES) return setState({ fieldErrors: { file: "O arquivo passa de 4 MB." } });
    const formData = new FormData();
    formData.set("ownerUserId", ownerUserId);
    formData.set("file", file);
    startTransition(async () => {
      const result = await previewB3Action(formData);
      setState(result);
      if (result.preview) {
        setPreview(result.preview);
        setReferenceDate(result.preview.referenceDate ?? "");
        setArchiveIds(new Set(result.preview.missing.map((m) => m.id)));
      }
    });
  };

  const onConfirm = () => {
    if (!file || !preview) return;
    if (!referenceDate) return setState({ fieldErrors: { referenceDate: "Informe a data da posição." } });
    const formData = new FormData();
    formData.set("ownerUserId", ownerUserId);
    formData.set("file", file);
    formData.set("referenceDate", referenceDate);
    formData.set("fingerprint", preview.fingerprint);
    for (const id of archiveIds) formData.append("archiveIds", id);
    startTransition(async () => {
      const result = await applyB3Action(formData);
      setState(result);
      if (result.success) {
        toast.success(result.success);
        router.push("/investimentos");
      }
    });
  };

  const ownerName = members.find((m) => m.userId === ownerUserId)?.displayName ?? "";

  if (!preview) {
    return (
      <Panel className="max-w-2xl">
        <div className="flex flex-col gap-4">
          <SelectField
            name="ownerUserId"
            label="De quem é esta posição?"
            value={ownerUserId}
            onChange={(e) => setOwnerUserId(e.target.value)}
            hint="O arquivo da B3 é de um CPF. Ativos que sumirem só são comparados com os desta pessoa."
            error={errors.ownerUserId}
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </SelectField>
          <Field
            name="file"
            label="Arquivo da B3 (.xlsx ou .xls, até 4 MB)"
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            hint="O arquivo é lido só para esta importação e não fica guardado."
            error={errors.file}
            className="[&_input]:h-auto [&_input]:py-2"
          />
          <FormError message={state.error} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onPreview} disabled={pending}>
              <FileSpreadsheet aria-hidden />
              {pending ? "Lendo…" : "Ver prévia"}
            </Button>
            <Link href="/investimentos" className={buttonVariants({ variant: "outline" })}>
              Cancelar
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  const nothingToDo = preview.created.length === 0 && preview.updated.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={`Prévia da posição de ${ownerName}`}
        description={`Abas lidas: ${preview.sheets.join(", ")}.${preview.ignoredSheets.length ? ` Ignoradas: ${preview.ignoredSheets.join(", ")}.` : ""}`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="referenceDate"
            label="Data da posição"
            type="date"
            value={referenceDate}
            max={today}
            onChange={(e) => setReferenceDate(e.target.value)}
            hint={
              preview.referenceDate
                ? "Detectada no arquivo. Ajuste se precisar."
                : "Não foi possível detectar no arquivo: informe a data da posição."
            }
            required
            error={errors.referenceDate}
          />
        </div>
        <p className="text-[13px] text-muted-foreground">
          {preview.created.length} novo(s) · {preview.updated.length} atualizado(s) · {preview.missing.length} sumiram do
          arquivo. Valores brutos.
        </p>
      </Panel>

      {preview.created.length ? (
        <Panel title="Novos">
          <PreviewTable
            rows={preview.created.map((a) => ({
              key: a.externalId,
              name: a.name,
              sub: `${a.code} · ${ASSET_CLASS_LABELS[a.assetClass]} · ${a.institution ?? "—"}`,
              quantity: qty(a.quantity),
              value: <Money cents={a.valueCents} />,
            }))}
          />
        </Panel>
      ) : null}

      {preview.updated.length ? (
        <Panel title="Atualizados" description="Valor no sistema → valor do arquivo.">
          <PreviewTable
            rows={preview.updated.map((a) => {
              const change = a.valueCents - a.oldValueCents;
              return {
                key: a.externalId,
                name: a.currentName,
                sub: `${a.code} · ${a.institution ?? "—"}${a.reactivated ? " · será reativado" : ""}`,
                quantity: a.oldQuantity === a.quantity ? qty(a.quantity) : `${qty(a.oldQuantity)} → ${qty(a.quantity)}`,
                value: (
                  <span className="flex flex-col items-end">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Money cents={a.oldValueCents} className="text-muted-foreground" />
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-label="para" />
                      <Money cents={a.valueCents} />
                    </span>
                    {change !== 0 ? (
                      <span className={change > 0 ? "font-mono text-[12px] text-primary" : "font-mono text-[12px] text-danger"}>
                        {change > 0 ? "+" : "−"}
                        {formatBRL(Math.abs(change))}
                      </span>
                    ) : null}
                  </span>
                ),
              };
            })}
          />
        </Panel>
      ) : null}

      {preview.missing.length ? (
        <Panel
          title="Sumiram do arquivo"
          description="Estão no sistema como B3 desta pessoa, mas não vieram no arquivo (vendidos ou resgatados?). Os marcados serão arquivados na data da posição."
        >
          <ul className="flex flex-col divide-y divide-divider">
            {preview.missing.map((m) => (
              <li key={m.id} className="py-1 first:pt-0 last:pb-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={archiveIds.has(m.id)}
                    onChange={(e) => {
                      const next = new Set(archiveIds);
                      if (e.target.checked) next.add(m.id);
                      else next.delete(m.id);
                      setArchiveIds(next);
                    }}
                  />
                  <span className="flex-1">Arquivar {m.name}</span>
                  <Money cents={m.currentValueCents} className="text-muted-foreground" />
                </label>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <FormError message={state.error ?? errors.file} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onConfirm} disabled={pending || nothingToDo}>
          {pending ? "Salvando…" : "Confirmar importação"}
        </Button>
        <Button type="button" variant="outline" onClick={reset} disabled={pending}>
          Voltar
        </Button>
      </div>
      {nothingToDo ? <p className="text-[13px] text-muted-foreground">O arquivo não tem ativos para importar.</p> : null}
    </div>
  );
}

function PreviewTable({
  rows,
}: {
  rows: { key: string; name: string; sub: string; quantity: string; value: React.ReactNode }[];
}) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Ativo</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Quantidade</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2.5 pr-3">
                <p className="font-medium">{r.name}</p>
                <p className="text-[12px] text-muted-foreground">{r.sub}</p>
              </td>
              <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">{r.quantity}</td>
              <td className="py-2.5 pl-3 text-right">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
