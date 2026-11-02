import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { listMembers } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";
import { InvestmentForm } from "../investment-form";

export const metadata: Metadata = { title: "Novo ativo" };

export default function NovoInvestimentoPage() {
  return (
    <>
      <PageHeader
        title="Novo ativo"
        description="Para o que está fora da B3: cripto, fundos, previdência, renda fixa de banco etc."
      />
      <Suspense fallback={<FormSkeleton fields={6} />}>
        <NewInvestment />
      </Suspense>
    </>
  );
}

async function NewInvestment() {
  const actor = await requireActor();
  const db = await createClient();
  const members = await listMembers(db, { householdId: actor.householdId });
  return (
    <Panel className="max-w-2xl">
      <InvestmentForm members={members} today={todayInSaoPaulo()} />
    </Panel>
  );
}
