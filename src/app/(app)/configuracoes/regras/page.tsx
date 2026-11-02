import { ArrowRight, Pencil, Trash2, Wand2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/action-button";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton, Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import { listMerchantRules } from "@/lib/services/merchant-rules";
import { createClient } from "@/lib/supabase/server";
import { deleteMerchantRuleAction } from "../actions";

export const metadata: Metadata = { title: "Regras de categoria" };

export default function RegrasPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <RuleList />
    </Suspense>
  );
}

async function RuleList() {
  const actor = await requireActor();
  const rules = await listMerchantRules(await createClient(), { householdId: actor.householdId });

  if (rules.length === 0) {
    return (
      <EmptyState
        icon={Wand2}
        title="Nenhuma regra aprendida ainda"
        description='Ao importar uma fatura, corrija a categoria de um lançamento com "Lembrar para próximas" marcado: a regra aparece aqui e vale nas próximas importações.'
        action={
          <Link href="/transacoes/importar" className={buttonVariants()}>
            Importar fatura <ArrowRight aria-hidden />
          </Link>
        }
      />
    );
  }

  return (
    <Panel
      title="Regras de categoria"
      description="Quando a descrição do lançamento contém o trecho, a categoria é escolhida automaticamente. As regras têm prioridade sobre as palavras-chave padrão; a mais longa vence."
    >
      <ul className="flex flex-col divide-y divide-divider">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <CategoryIcon icon={rule.category?.icon} className="size-9" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate font-mono text-sm">“{rule.pattern}”</p>
              <p className="truncate text-[13px] text-muted-foreground">
                → {rule.category?.name ?? "Categoria removida"}
                {rule.category?.archived ? " (arquivada: a regra não vale)" : ""}
              </p>
            </div>
            <Link
              href={`/configuracoes/regras/${rule.id}`}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              aria-label={`Editar regra ${rule.pattern}`}
            >
              <Pencil aria-hidden />
            </Link>
            <ConfirmAction
              action={deleteMerchantRuleAction}
              trigger={<Trash2 aria-hidden />}
              variant="ghost"
              size="icon"
              aria-label={`Apagar regra ${rule.pattern}`}
              title="Apagar esta regra?"
              description={`Lançamentos com “${rule.pattern}” voltam a usar as palavras-chave padrão. Os já importados não mudam.`}
              options={[{ label: "Apagar", fields: { id: rule.id }, destructive: true }]}
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
