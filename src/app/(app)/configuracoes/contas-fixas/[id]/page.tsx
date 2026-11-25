import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { getRecurringBill } from "@/lib/services/recurring-bills";
import { createClient } from "@/lib/supabase/server";
import { BillForm } from "../bill-form";
import { recurringBillFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Editar conta fixa" };

export default function EditarContaFixaPage({ params }: PageProps<"/configuracoes/contas-fixas/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton fields={6} />}>
      <EditBill params={params} />
    </Suspense>
  );
}

async function EditBill({ params }: Pick<PageProps<"/configuracoes/contas-fixas/[id]">, "params">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await requireActor();
  const db = await createClient();
  const bill = await getRecurringBill(db, { householdId: actor.householdId, billId: id.data });
  if (!bill) notFound();
  const options = await recurringBillFormOptions(db, actor.householdId, bill);
  return (
    <Panel title={`Editar ${bill.name}`} className="max-w-2xl">
      <BillForm bill={bill} {...options} />
    </Panel>
  );
}
