import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BillForm } from "../bill-form";
import { recurringBillFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Nova conta fixa" };

export default function NovaContaFixaPage() {
  return (
    <Suspense fallback={<FormSkeleton fields={6} />}>
      <NewBill />
    </Suspense>
  );
}

async function NewBill() {
  const actor = await requireActor();
  const options = await recurringBillFormOptions(await createClient(), actor.householdId);
  return (
    <Panel title="Nova conta fixa" className="max-w-2xl">
      <BillForm {...options} />
    </Panel>
  );
}
