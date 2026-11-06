import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { listMembers } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "../account-form";
import { paymentAccountOptions } from "../payment-account-options";

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
  const db = await createClient();
  const [members, accounts] = await Promise.all([
    listMembers(db, { householdId: actor.householdId }),
    listAccounts(db, { householdId: actor.householdId }),
  ]);
  return (
    <Panel title="Nova conta ou cartão" className="max-w-2xl">
      <AccountForm members={members} paymentAccounts={paymentAccountOptions(accounts)} today={todayInSaoPaulo()} />
    </Panel>
  );
}
