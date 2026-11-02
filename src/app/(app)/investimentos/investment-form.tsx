"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AmountField, Field, FormError, SelectField } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatAmountInput } from "@/lib/finance/money";
import { ASSET_CLASS_LABELS, ASSET_CLASSES, type AssetClass } from "@/lib/finance/portfolio";
import type { FormState } from "@/lib/validation/form";
import { saveInvestmentAction } from "./actions";

export type InvestmentFormValues = {
  id?: string;
  source: "manual" | "b3";
  name: string;
  assetClass: AssetClass;
  institution: string | null;
  ownerUserId: string | null;
  ticker: string | null;
  quantity: number | null;
  avgPriceCents: number | null;
  aliases: string[];
};

const quantityInput = (value: number | null) =>
  value === null ? undefined : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8, useGrouping: false }).format(value);

export function InvestmentForm({
  investment,
  members,
  today,
}: {
  investment?: InvestmentFormValues;
  members: { userId: string; displayName: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState(saveInvestmentAction, {} as FormState);
  const errors = state.fieldErrors ?? {};
  const isB3 = investment?.source === "b3";
  const isNew = !investment?.id;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {investment?.id ? <input type="hidden" name="id" value={investment.id} /> : null}
      {investment ? <input type="hidden" name="source" value={investment.source} /> : null}
      {isB3 ? (
        <p className="rounded-lg bg-[#E3ECF8] px-3 py-2 text-[13px] text-[#2A548F]">
          Ativo importado da B3: dono, código, quantidade e valor vêm da importação. Aqui você edita só o nome, a
          classe e os apelidos.
        </p>
      ) : null}
      <Field
        name="name"
        label="Nome"
        placeholder="Ex.: CDB Banco X 110% CDI"
        defaultValue={investment?.name}
        required
        maxLength={80}
        error={errors.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="assetClass"
          label="Classe"
          defaultValue={investment?.assetClass ?? "fixed_income"}
          error={errors.assetClass}
        >
          {ASSET_CLASSES.map((c) => (
            <option key={c} value={c}>
              {ASSET_CLASS_LABELS[c]}
            </option>
          ))}
        </SelectField>
        {isB3 ? null : (
          <SelectField
            name="ownerUserId"
            label="Dono"
            defaultValue={investment ? (investment.ownerUserId ?? "joint") : "joint"}
            error={errors.ownerUserId}
          >
            <option value="joint">Conjunto</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      {isB3 ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="institution"
              label="Instituição (opcional)"
              placeholder="Ex.: Nubank, Binance"
              defaultValue={investment?.institution ?? undefined}
              maxLength={80}
              error={errors.institution}
            />
            <Field
              name="ticker"
              label="Ticker ou código (opcional)"
              placeholder="Ex.: BTC"
              defaultValue={investment?.ticker ?? undefined}
              maxLength={20}
              autoCapitalize="characters"
              error={errors.ticker}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="quantity"
              label="Quantidade (opcional)"
              inputMode="decimal"
              placeholder="0,5"
              defaultValue={quantityInput(investment?.quantity ?? null)}
              style={{ fontFamily: "var(--font-mono)" }}
              error={errors.quantity}
            />
            <AmountField
              name="avgPriceCents"
              label="Preço médio (opcional)"
              defaultValue={investment?.avgPriceCents ? formatAmountInput(investment.avgPriceCents) : undefined}
              error={errors.avgPriceCents}
            />
          </div>
        </>
      )}

      {isNew ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <AmountField name="valueCents" label="Valor atual" required error={errors.valueCents} />
          <Field
            name="valueDate"
            label="Valor em"
            type="date"
            defaultValue={today}
            max={today}
            required
            error={errors.valueDate}
          />
        </div>
      ) : null}

      <Field
        name="aliases"
        label="Apelidos (opcional)"
        placeholder="reserva, cdb do nubank"
        hint="Separados por vírgula. O bot do WhatsApp usa para reconhecer o ativo."
        defaultValue={investment?.aliases.join(", ")}
        error={errors.aliases}
      />

      <FormError message={state.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Link href="/investimentos" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
