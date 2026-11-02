import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { listMembers } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Importar posição da B3" };

export default function ImportarB3Page() {
  return (
    <>
      <PageHeader
        title="Importar posição da B3"
        description="Área do Investidor → Extratos → Posição → baixar em Excel. Um arquivo por pessoa (CPF)."
      />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <ImportB3 />
      </Suspense>
    </>
  );
}

async function ImportB3() {
  const actor = await requireActor();
  const db = await createClient();
  const members = await listMembers(db, { householdId: actor.householdId });
  return (
    <ImportForm
      members={members.map((m) => ({ userId: m.userId, displayName: m.displayName }))}
      defaultOwnerId={actor.userId}
      today={todayInSaoPaulo()}
    />
  );
}
