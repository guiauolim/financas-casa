"use client";

import { useActionState } from "react";
import { AmountField, Field, FormError, FormSuccess } from "@/components/form";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/validation/form";
import { updateInvestmentValueAction } from "./actions";

// Novo valor de um ativo manual numa data: grava um snapshot (histórico e evolução).
export function ValueForm({ investmentId, today }: { investmentId: string; today: string }) {
  const [state, action, pending] = useActionState(updateInvestmentValueAction, {} as FormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={investmentId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <AmountField name="valueCents" label="Novo valor" required error={errors.valueCents} />
        <Field name="date" label="Data" type="date" defaultValue={today} max={today} required error={errors.date} />
        <Field
          name="quantity"
          label="Quantidade (opcional)"
          inputMode="decimal"
          placeholder="Sem mudança"
          style={{ fontFamily: "var(--font-mono)" }}
          error={errors.quantity}
        />
      </div>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Atualizar valor"}
        </Button>
      </div>
    </form>
  );
}
