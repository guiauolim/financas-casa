"use client";

import { CreditCard, Landmark, PiggyBank } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { FormError, FormSuccess, selectClassName } from "@/components/form";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/finance/dates";
import {
  type DiscoveredSource,
  type LinkAccount,
  type LinkChoice,
  type PluggyRole,
  ROLE_LABELS,
  ROLES_BY_KIND,
  roleNeedsAccount,
} from "@/lib/finance/pluggy-links";
import type { FormState } from "@/lib/validation/form";
import { savePluggyLinksAction } from "./actions";

export type ItemGroup = {
  itemId: string;
  title: string;
  status: string;
  lastUpdatedAt: string | null;
  consentExpiresAt: string | null;
  ownerUserId: string | null;
  sources: { source: DiscoveredSource; saved: boolean; choice: LinkChoice }[];
};

const KIND_LABELS = { bank_account: "Conta corrente", card: "Cartão de crédito", investments: "Investimentos" } as const;
const KIND_ICONS = { bank_account: Landmark, card: CreditCard, investments: PiggyBank } as const;

const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : "—");

function detail(source: DiscoveredSource) {
  if (source.sourceKind === "card") {
    return source.activity ? `${source.activity} lançamentos desde 01/11` : "Sem lançamentos desde 01/11";
  }
  if (source.sourceKind === "investments") {
    const kinds = source.investmentKinds.map((k) => k.split("/")[1] ?? k).join(", ");
    return `${source.activity} ativo${source.activity === 1 ? "" : "s"}${kinds ? ` · ${kinds}` : ""}`;
  }
  return null;
}

export function PluggyLinksForm({
  groups,
  accounts,
  members,
}: {
  groups: ItemGroup[];
  accounts: LinkAccount[];
  members: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(savePluggyLinksAction, {} as FormState);
  const [roles, setRoles] = useState<Record<string, PluggyRole>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.sources.map((s) => [s.source.key, s.choice.role]))),
  );
  const cards = accounts.filter((a) => a.kind === "credit_card");
  const nonCards = accounts.filter((a) => a.kind !== "credit_card");
  const unsaved = groups.some((g) => g.sources.some((s) => !s.saved));

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {unsaved ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          Algumas origens ainda não foram salvas: as escolhas abaixo são sugestões. Confira e salve.
        </p>
      ) : null}

      {groups.map((group) => (
        <fieldset key={group.itemId} className="flex flex-col gap-3 rounded-[12px] border border-border p-4">
          <legend className="px-1 text-[15px] font-semibold">{group.title}</legend>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-[12px] text-muted-foreground">
              Atualizado pelo banco em {day(group.lastUpdatedAt)} · autorização até {day(group.consentExpiresAt)}
              {group.status !== "UPDATED" ? ` · status ${group.status}` : ""}
            </p>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-muted-foreground">De quem é este login</span>
              <select name={`owner:${group.itemId}`} defaultValue={group.ownerUserId ?? ""} className={selectClassName}>
                <option value="">Casa</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ul className="flex flex-col divide-y divide-divider">
            {group.sources.map(({ source, choice }) => {
              const Icon = KIND_ICONS[source.sourceKind];
              const role = roles[source.key] ?? choice.role;
              const options = role === "card" ? cards : nonCards;
              const info = detail(source);
              return (
                <li key={source.key} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
                  <div className="flex min-w-[160px] flex-1 flex-col gap-0.5">
                    <p className="font-medium">
                      {KIND_LABELS[source.sourceKind]} · <span className="font-normal">{source.label}</span>
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {source.balanceCents != null ? <Money cents={source.balanceCents} /> : null}
                      {source.balanceCents != null && info ? " · " : null}
                      {info}
                    </p>
                  </div>
                  <label className="flex flex-col gap-1 text-[13px]">
                    <span className="sr-only">O que é {source.label}</span>
                    <select
                      name={`role:${source.key}`}
                      value={role}
                      onChange={(e) => setRoles((r) => ({ ...r, [source.key]: e.target.value as PluggyRole }))}
                      className={selectClassName}
                    >
                      {ROLES_BY_KIND[source.sourceKind].map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {roleNeedsAccount(role) ? (
                    <label className="flex flex-col gap-1 text-[13px]">
                      <span className="sr-only">{role === "card" ? "Cartão do sistema" : "Conta do sistema"}</span>
                      <select
                        key={role}
                        name={`account:${source.key}`}
                        defaultValue={choice.accountId ?? ""}
                        className={selectClassName}
                        required
                      >
                        <option value="" disabled>
                          {role === "card" ? "Escolha o cartão" : "Escolha a conta"}
                        </option>
                        {options.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}

      <p className="text-[13px] text-muted-foreground">
        Cartão que ainda não existe no sistema (ex.: Nubank gold)?{" "}
        <Link href="/configuracoes/contas/nova" className="font-medium text-primary underline-offset-4 hover:underline">
          Cadastre o cartão
        </Link>{" "}
        e volte aqui para ligar.
      </p>
      <FormError message={state.error ?? Object.values(state.fieldErrors ?? {})[0]} />
      <FormSuccess message={state.success} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar ligações"}
        </Button>
        <Button type="button" variant="outline" disabled title="Chega na próxima etapa">
          Sincronizar agora (em breve)
        </Button>
      </div>
    </form>
  );
}
