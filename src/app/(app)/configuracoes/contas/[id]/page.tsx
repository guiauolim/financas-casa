import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { getAccount, listAccounts } from "@/lib/services/accounts";
import { listMembers } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "../account-form";
import { paymentAccountOptions } from "../payment-account-options";

export const metadata: Metadata = { title: "Editar conta" };

export default function EditarContaPage({ params }: PageProps<"/configuracoes/contas/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditAccount params={params} />
    </Suspense>
  );
}

async function EditAccount({ params }: Pick<PageProps<"/configuracoes/contas/[id]">, "params">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await requireActor();
  const db = await createClient();
  const [account, members, accounts] = await Promise.all([
    getAccount(db, { householdId: actor.householdId, accountId: id.data }),
    listMembers(db, { householdId: actor.householdId }),
    listAccounts(db, { householdId: actor.householdId }),
  ]);
  if (!account) notFound();
  return (
    <Panel title={`Editar ${account.name}`} className="max-w-2xl">
      <AccountForm
        account={account}
        members={members}
        paymentAccounts={paymentAccountOptions(accounts)}
        today={todayInSaoPaulo()}
      />
    </Panel>
  );
}
