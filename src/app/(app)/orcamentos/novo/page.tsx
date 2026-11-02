import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import type { BudgetScope } from "@/lib/finance/budget";
import { createClient } from "@/lib/supabase/server";
import { BUDGET_SCOPES } from "@/lib/validation/budgets";
import { BudgetForm } from "../budget-form";
import { budgetFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Novo orçamento" };

export default function NovoOrcamentoPage({ searchParams }: PageProps<"/orcamentos/novo">) {
  return (
    <>
      <PageHeader title="Novo orçamento" description="Defina um limite para acompanhar os gastos." />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <NewBudget searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewBudget({ searchParams }: Pick<PageProps<"/orcamentos/novo">, "searchParams">) {
  const { tipo, categoria } = await searchParams;
  const actor = await requireActor();
  const options = await budgetFormOptions(await createClient(), actor.householdId);
  const requested = BUDGET_SCOPES.find((s) => s === tipo);
  const scope: BudgetScope = requested === "card" && options.cards.length === 0 ? "total" : (requested ?? "total");
  const categoryId = typeof categoria === "string" && options.categories.some((c) => c.id === categoria) ? categoria : null;
  return (
    <Panel className="max-w-2xl">
      <BudgetForm
        budget={{ scope: categoryId ? "category" : scope, categoryId, accountId: null, limitCents: null }}
        {...options}
      />
    </Panel>
  );
}
