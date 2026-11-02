import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { listCategories } from "@/lib/services/categories";
import { getMerchantRule } from "@/lib/services/merchant-rules";
import { createClient } from "@/lib/supabase/server";
import { RuleForm } from "../rule-form";

export const metadata: Metadata = { title: "Editar regra" };

export default function EditarRegraPage({ params }: PageProps<"/configuracoes/regras/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton fields={2} />}>
      <EditRule params={params} />
    </Suspense>
  );
}

async function EditRule({ params }: Pick<PageProps<"/configuracoes/regras/[id]">, "params">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await requireActor();
  const db = await createClient();
  const [rule, categories] = await Promise.all([
    getMerchantRule(db, { householdId: actor.householdId, ruleId: id.data }),
    listCategories(db, { householdId: actor.householdId }),
  ]);
  if (!rule) notFound();
  return (
    <Panel title="Editar regra" className="max-w-2xl">
      <RuleForm
        rule={{ id: rule.id, pattern: rule.pattern, categoryId: rule.categoryId }}
        categories={categories.filter((c) => c.type !== "transfer" || c.id === rule.categoryId)}
      />
    </Panel>
  );
}
