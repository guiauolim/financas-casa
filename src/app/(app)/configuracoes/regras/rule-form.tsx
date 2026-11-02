"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, SelectField } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { TX_TYPE_LABELS } from "@/lib/validation/categories";
import type { FormState } from "@/lib/validation/form";
import { saveMerchantRuleAction } from "../actions";

type RuleCategory = { id: string; name: string; type: "expense" | "income" | "transfer" };

export function RuleForm({
  rule,
  categories,
}: {
  rule: { id: string; pattern: string; categoryId: string };
  categories: RuleCategory[];
}) {
  const [state, action, pending] = useActionState(saveMerchantRuleAction, {} as FormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={rule.id} />
      <Field
        name="pattern"
        label="Trecho da descrição"
        defaultValue={rule.pattern}
        maxLength={80}
        required
        hint='Sem acento nem maiúsculas. Encurte para valer para mais lançamentos (ex.: "drogaria modelo" → "drogaria").'
        error={errors.pattern}
      />
      <SelectField name="categoryId" label="Categoria" defaultValue={rule.categoryId} required error={errors.categoryId}>
        {(["expense", "income"] as const).map((type) => (
          <optgroup key={type} label={TX_TYPE_LABELS[type]}>
            {categories
              .filter((c) => c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        ))}
      </SelectField>
      <FormError message={state.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Link href="/configuracoes/regras" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
