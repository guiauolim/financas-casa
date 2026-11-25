"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AmountField, Field, FormError, Segmented, SelectField } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatAmountInput } from "@/lib/finance/money";
import { HOUSE, spentByToParam } from "@/lib/finance/spent-by";
import type { FormState } from "@/lib/validation/form";
import { saveRecurringBillAction } from "../actions";

export type BillFormValues = {
  id: string;
  name: string;
  categoryId: string;
  accountId: string;
  amountCents: number;
  dueDay: number;
  spentBy: string | null;
};

export function BillForm({
  bill,
  categories,
  accounts,
  members,
}: {
  bill?: BillFormValues;
  categories: { id: string; name: string; householdDefault: boolean }[];
  accounts: { id: string; name: string }[];
  members: { userId: string; displayName: string }[];
}) {
  const [state, action, pending] = useActionState(saveRecurringBillAction, {} as FormState);
  const errors = state.fieldErrors ?? {};
  // Conta fixa costuma ser da casa (aluguel, luz); assinatura pode ser de alguém.
  const [spentBy, setSpentBy] = useState(bill ? spentByToParam(bill.spentBy) : HOUSE);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {bill ? <input type="hidden" name="id" value={bill.id} /> : null}
      <Field
        name="name"
        label="Nome"
        placeholder="Ex.: Aluguel, Luz, Internet"
        defaultValue={bill?.name}
        maxLength={60}
        required
        error={errors.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField
          name="amountCents"
          label="Valor previsto (R$)"
          defaultValue={bill ? formatAmountInput(bill.amountCents) : undefined}
          hint="Se varia (luz, água), use a média. Ao lançar dá para ajustar."
          error={errors.amountCents}
          required
        />
        <Field
          name="dueDay"
          label="Dia do vencimento"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          defaultValue={bill?.dueDay}
          hint="31 em mês curto = último dia."
          error={errors.dueDay}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="accountId" label="Sai de" defaultValue={bill?.accountId ?? ""} error={errors.accountId} required>
          <option value="" disabled>
            Escolha a conta ou o cartão
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="categoryId"
          label="Categoria"
          defaultValue={bill?.categoryId ?? ""}
          error={errors.categoryId}
          required
        >
          <option value="" disabled>
            Escolha a categoria
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>
      <Segmented
        name="spentBy"
        legend="De quem é a conta"
        value={spentBy}
        onChange={setSpentBy}
        options={[{ value: HOUSE, label: "Casa" }, ...members.map((m) => ({ value: m.userId, label: m.displayName }))]}
        error={errors.spentBy}
      />
      <FormError message={state.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Link href="/configuracoes/contas-fixas" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
