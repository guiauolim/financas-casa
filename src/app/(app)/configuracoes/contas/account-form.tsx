"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AmountField, Field, FormError, Segmented, SelectField } from "@/components/form";
import { INVOICE_NAMING_LABELS, INVOICE_NAMINGS, type InvoiceNaming, invoiceFor, invoiceLabel } from "@/lib/finance/billing";
import { formatDate } from "@/lib/finance/dates";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatAmountInput } from "@/lib/finance/money";
import { ACCOUNT_KIND_LABELS, ACCOUNT_KINDS, type AccountKind } from "@/lib/validation/accounts";
import type { FormState } from "@/lib/validation/form";
import { saveAccountAction } from "../actions";

export type AccountFormValues = {
  id?: string;
  name: string;
  kind: AccountKind;
  ownerUserId: string | null;
  aliases: string[];
  closingDay: number | null;
  dueDay: number | null;
  invoiceNaming: InvoiceNaming;
  creditLimitCents: number | null;
  openingBalanceCents: number;
  openingBalanceDate: string | null;
};

export function AccountForm({
  account,
  members,
  today,
}: {
  account?: AccountFormValues;
  members: { userId: string; displayName: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState(saveAccountAction, {} as FormState);
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "checking");
  const [closingDay, setClosingDay] = useState(account?.closingDay ? String(account.closingDay) : "");
  const [dueDay, setDueDay] = useState(account?.dueDay ? String(account.dueDay) : "");
  const [naming, setNaming] = useState<InvoiceNaming>(account?.invoiceNaming ?? "closing");
  const example = invoiceExample(today, closingDay, dueDay, naming);
  const isCard = kind === "credit_card";
  const errors = state.fieldErrors ?? {};
  // Não dá para trocar cartão <-> conta depois de criado.
  const kindLocked = (k: AccountKind) => Boolean(account) && (k === "credit_card") !== (account!.kind === "credit_card");

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {account?.id ? <input type="hidden" name="id" value={account.id} /> : null}
      <Field
        name="name"
        label="Nome"
        placeholder="Ex.: Nubank crédito"
        defaultValue={account?.name}
        required
        maxLength={60}
        error={errors.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="kind"
          label="Tipo"
          value={kind}
          onChange={(e) => setKind(e.target.value as AccountKind)}
          error={errors.kind}
        >
          {ACCOUNT_KINDS.map((k) => (
            <option key={k} value={k} disabled={kindLocked(k)}>
              {ACCOUNT_KIND_LABELS[k]}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="ownerUserId"
          label="Dono"
          defaultValue={account ? (account.ownerUserId ?? "joint") : "joint"}
          error={errors.ownerUserId}
        >
          <option value="joint">Conjunta</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </SelectField>
      </div>

      {isCard ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            name="closingDay"
            label="Melhor dia de compra"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value)}
            required
            hint="Compras a partir deste dia vão para a próxima fatura."
            error={errors.closingDay}
          />
          <Field
            name="dueDay"
            label="Dia do vencimento"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            required
            error={errors.dueDay}
          />
          <AmountField
            name="creditLimitCents"
            label="Limite (opcional)"
            defaultValue={account?.creditLimitCents ? formatAmountInput(account.creditLimitCents) : undefined}
            error={errors.creditLimitCents}
          />
          <div className="sm:col-span-3">
            <Segmented
              name="invoiceNaming"
              legend="Nomear fatura pelo mês do"
              value={naming}
              onChange={setNaming}
              options={INVOICE_NAMINGS.map((n) => ({ value: n, label: INVOICE_NAMING_LABELS[n].toLowerCase() }))}
              error={errors.invoiceNaming}
            />
          </div>
          <p className="text-[13px] text-muted-foreground sm:col-span-3" aria-live="polite">
            {example ??
              "A fatura fecha na véspera do melhor dia de compra. Em meses mais curtos, o dia cai no último dia do mês."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <AmountField
            name="openingBalanceCents"
            label="Saldo inicial"
            hint="Saldo da conta na data ao lado. Use − para saldo negativo."
            defaultValue={formatAmountInput(account?.openingBalanceCents ?? 0)}
            error={errors.openingBalanceCents}
          />
          <Field
            name="openingBalanceDate"
            label="Data do saldo inicial"
            type="date"
            defaultValue={account?.openingBalanceDate ?? undefined}
            error={errors.openingBalanceDate}
          />
        </div>
      )}

      <Field
        name="aliases"
        label="Apelidos (opcional)"
        placeholder="nubank, roxinho"
        hint="Separados por vírgula. O bot do WhatsApp usa para reconhecer a conta."
        defaultValue={account?.aliases.join(", ")}
        error={errors.aliases}
      />

      <FormError message={state.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Link href="/configuracoes/contas" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}

// Ex.: "Compras de 26/10/2026 a 25/11/2026 entram na fatura de novembro de 2026 (vence 05/12/2026)."
function invoiceExample(today: string, closingDay: string, dueDay: string, naming: InvoiceNaming): string | null {
  const closing = Number(closingDay);
  const due = Number(dueDay);
  if (!Number.isInteger(closing) || !Number.isInteger(due) || closing < 1 || closing > 31 || due < 1 || due > 31) return null;
  const invoice = invoiceFor(today, { closingDay: closing, dueDay: due });
  return `Hoje: compras de ${formatDate(invoice.periodStart)} a ${formatDate(invoice.periodEnd)} entram na ${invoiceLabel(
    invoice,
    naming,
  )} (fecha ${formatDate(invoice.closingDate)}, vence ${formatDate(invoice.dueDate)}).`;
}
