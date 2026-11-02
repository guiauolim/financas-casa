"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AmountField, FormError, Segmented, SelectField } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import type { BudgetScope } from "@/lib/finance/budget";
import { formatAmountInput } from "@/lib/finance/money";
import { BUDGET_SCOPE_LABELS, BUDGET_SCOPES } from "@/lib/validation/budgets";
import type { FormState } from "@/lib/validation/form";
import { saveBudgetAction } from "./actions";

export type BudgetFormValues = {
  id?: string;
  scope: BudgetScope;
  categoryId: string | null;
  accountId: string | null;
  limitCents: number | null;
};

type Option = { id: string; name: string };

const HINTS: Record<BudgetScope, string> = {
  total: "Soma de todas as despesas do mês, em qualquer conta ou cartão.",
  category: "Despesas da categoria no mês, em qualquer conta ou cartão.",
  card: "Compras no cartão de segunda a domingo. Pagamento de fatura não conta.",
};

export function BudgetForm({
  budget,
  categories,
  cards,
}: {
  budget: BudgetFormValues;
  categories: Option[];
  cards: Option[];
}) {
  const [state, action, pending] = useActionState(saveBudgetAction, {} as FormState);
  const [scope, setScope] = useState<BudgetScope>(budget.scope);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {budget.id ? <input type="hidden" name="id" value={budget.id} /> : null}
      <Segmented
        name="scope"
        legend="Tipo de orçamento"
        value={scope}
        onChange={setScope}
        options={BUDGET_SCOPES.map((s) => ({
          value: s,
          label: BUDGET_SCOPE_LABELS[s],
          disabled: s === "card" && cards.length === 0,
        }))}
        error={errors.scope}
      />
      <p className="-mt-2 text-[13px] text-muted-foreground">{HINTS[scope]}</p>

      {scope === "category" ? (
        <SelectField
          name="categoryId"
          label="Categoria"
          defaultValue={budget.categoryId ?? ""}
          error={errors.categoryId}
          required
        >
          <option value="" disabled>
            Escolha uma categoria
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      {scope === "card" ? (
        <SelectField name="accountId" label="Cartão" defaultValue={budget.accountId ?? ""} error={errors.accountId} required>
          <option value="" disabled>
            Escolha um cartão
          </option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      <AmountField
        name="limitCents"
        label={scope === "card" ? "Limite por semana (R$)" : "Limite por mês (R$)"}
        defaultValue={budget.limitCents ? formatAmountInput(budget.limitCents) : undefined}
        error={errors.limitCents}
        required
      />
      <FormError message={state.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Link href="/orcamentos" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
