import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { budgetScope } from "@/lib/finance/budget";
import { getBudget } from "@/lib/services/budgets";
import { createClient } from "@/lib/supabase/server";
import { BudgetForm } from "../budget-form";
import { budgetFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Editar orçamento" };

export default function EditarOrcamentoPage({ params }: PageProps<"/orcamentos/[id]">) {
  return (
    <>
      <PageHeader title="Editar orçamento" />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <EditBudget params={params} />
      </Suspense>
    </>
  );
}

async function EditBudget({ params }: Pick<PageProps<"/orcamentos/[id]">, "params">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await requireActor();
  const db = await createClient();
  const budget = await getBudget(db, { householdId: actor.householdId, budgetId: id.data });
  if (!budget) notFound();
  const options = await budgetFormOptions(db, actor.householdId, budget);
  return (
    <Panel className="max-w-2xl">
      <BudgetForm
        budget={{
          id: budget.id,
          scope: budgetScope(budget),
          categoryId: budget.categoryId,
          accountId: budget.accountId,
          limitCents: budget.limitCents,
        }}
        {...options}
      />
    </Panel>
  );
}
