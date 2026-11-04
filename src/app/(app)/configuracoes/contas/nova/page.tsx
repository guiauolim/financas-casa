import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { listMembers } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "../account-form";

export const metadata: Metadata = { title: "Nova conta" };

export default function NovaContaPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewAccount />
    </Suspense>
  );
}

async function NewAccount() {
  const actor = await requireActor();
  const members = await listMembers(await createClient(), { householdId: actor.householdId });
  return (
    <Panel title="Nova conta ou cartão" className="max-w-2xl">
      <AccountForm members={members} today={todayInSaoPaulo()} />
    </Panel>
  );
}
