"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-button";
import { invalidState, serviceErrorState } from "@/lib/actions";
import { requireActor } from "@/lib/auth/session";
import { createBudget, deleteBudget, updateBudget } from "@/lib/services/budgets";
import { createClient } from "@/lib/supabase/server";
import { BUDGET_FORM_FIELDS, budgetIdSchema, budgetSchema } from "@/lib/validation/budgets";
import { type FormState, formValues } from "@/lib/validation/form";

export async function saveBudgetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const id = formData.get("id");
  const parsed = budgetSchema.safeParse(formValues(formData, BUDGET_FORM_FIELDS));
  if (!parsed.success) return invalidState(parsed.error);

  try {
    const db = await createClient();
    if (typeof id === "string" && id) await updateBudget(db, actor, z.uuid().parse(id), parsed.data);
    else await createBudget(db, actor, parsed.data);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar o orçamento. Tente novamente.");
  }
  redirect("/orcamentos");
}

export async function deleteBudgetAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = budgetIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  try {
    await deleteBudget(await createClient(), actor, parsed.data.id);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível excluir o orçamento.");
  }
  refresh();
  return { success: "Orçamento excluído." };
}
