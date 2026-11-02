"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CATEGORY_ICONS } from "@/components/category-icon";
import { Field, FormError, Segmented } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  CATEGORY_ICON_LABELS,
  CATEGORY_ICON_NAMES,
  type CategoryIconName,
  isCategoryIconName,
} from "@/lib/categories/icon-names";
import { TX_TYPE_LABELS, TX_TYPES, type TxType } from "@/lib/validation/categories";
import type { FormState } from "@/lib/validation/form";
import { cn } from "@/lib/utils";
import { saveCategoryAction } from "../actions";

export type CategoryFormValues = {
  id?: string;
  name: string;
  type: TxType;
  icon: string | null;
  aliases: string[];
  householdDefault?: boolean;
};

export function CategoryForm({ category }: { category?: CategoryFormValues }) {
  const [state, action, pending] = useActionState(saveCategoryAction, {} as FormState);
  const [type, setType] = useState<TxType>(category?.type ?? "expense");
  const [icon, setIcon] = useState<CategoryIconName>(
    isCategoryIconName(category?.icon) ? category.icon : "circle-ellipsis",
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {category?.id ? <input type="hidden" name="id" value={category.id} /> : null}
      <Field
        name="name"
        label="Nome"
        placeholder="Ex.: Mercado"
        defaultValue={category?.name}
        maxLength={40}
        required
        error={errors.name}
      />
      <Segmented
        name="type"
        legend="Tipo"
        value={type}
        onChange={setType}
        options={TX_TYPES.map((t) => ({ value: t, label: TX_TYPE_LABELS[t] }))}
        error={errors.type}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Ícone</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2">
          {CATEGORY_ICON_NAMES.map((name) => {
            const Icon = CATEGORY_ICONS[name];
            return (
              <label
                key={name}
                title={CATEGORY_ICON_LABELS[name]}
                className={cn(
                  "flex size-11 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted",
                  "has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-soft-foreground",
                  "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                )}
              >
                <input
                  type="radio"
                  name="icon"
                  value={name}
                  checked={icon === name}
                  onChange={() => setIcon(name)}
                  className="sr-only"
                  aria-label={`Ícone ${CATEGORY_ICON_LABELS[name]}`}
                />
                <Icon className="size-5" strokeWidth={2} aria-hidden />
              </label>
            );
          })}
        </div>
        {errors.icon ? (
          <p className="text-[13px] text-danger" role="alert">
            {errors.icon}
          </p>
        ) : null}
      </fieldset>
      <Field
        name="aliases"
        label="Apelidos (opcional)"
        placeholder="mercado, supermercado, feira"
        hint="Separados por vírgula. O bot do WhatsApp usa para escolher a categoria."
        defaultValue={category?.aliases.join(", ")}
        error={errors.aliases}
      />
      {type === "expense" ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <input
            type="checkbox"
            name="householdDefault"
            defaultChecked={category?.householdDefault ?? false}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Gasto da casa por padrão</span>
            <span className="text-[13px] text-muted-foreground">
              Lançamentos nesta categoria ficam como &quot;Casa&quot; (ex.: Mercado, Moradia). Dá para trocar em cada
              lançamento.
            </span>
          </span>
        </label>
      ) : null}
      <FormError message={state.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Link href="/configuracoes/categorias" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
