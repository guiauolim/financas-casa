"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AmountField, Field, FormError, SelectField } from "@/components/form";
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
  creditLimitCents: number | null;
  openingBalanceCents: number;
  openingBalanceDate: string | null;
};

export function AccountForm({
  account,
  members,
}: {
  account?: AccountFormValues;
  members: { userId: string; displayName: string }[];
}) {
  const [state, action, pending] = useActionState(saveAccountAction, {} as FormState);
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "checking");
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
            label="Dia do fechamento"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            defaultValue={account?.closingDay ?? undefined}
            required
            error={errors.closingDay}
          />
          <Field
            name="dueDay"
            label="Dia do vencimento"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            defaultValue={account?.dueDay ?? undefined}
            required
            error={errors.dueDay}
          />
          <AmountField
            name="creditLimitCents"
            label="Limite (opcional)"
            defaultValue={account?.creditLimitCents ? formatAmountInput(account.creditLimitCents) : undefined}
            error={errors.creditLimitCents}
          />
          <p className="text-[13px] text-muted-foreground sm:col-span-3">
            Compras feitas no dia do fechamento ou depois entram na fatura seguinte. Em meses mais curtos, o
            fechamento cai no último dia do mês.
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
