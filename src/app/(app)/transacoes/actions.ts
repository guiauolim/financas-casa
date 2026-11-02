"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-button";
import { invalidState, serviceErrorState } from "@/lib/actions";
import { requireActor } from "@/lib/auth/session";
import { createTransaction, deleteTransaction, restoreTransaction, updateTransaction } from "@/lib/services/transactions";
import { createClient } from "@/lib/supabase/server";
import { type FormState, formValues } from "@/lib/validation/form";
import { scopeSchema, TRANSACTION_FORM_FIELDS, transactionSchema } from "@/lib/validation/transactions";

const targetSchema = z.object({ id: z.uuid(), scope: scopeSchema });

export async function saveTransactionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const id = formData.get("id");
  const parsed = transactionSchema.safeParse(formValues(formData, TRANSACTION_FORM_FIELDS));
  if (!parsed.success) return invalidState(parsed.error);

  try {
    const db = await createClient();
    if (typeof id === "string" && id) {
      await updateTransaction(db, actor, z.uuid().parse(id), parsed.data, scopeSchema.parse(formData.get("scope")));
    } else {
      await createTransaction(db, actor, parsed.data, { source: "web" });
    }
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar o lançamento. Tente novamente.");
  }
  redirect(`/transacoes?mes=${parsed.data.occurredOn.slice(0, 7)}`);
}

export async function deleteTransactionAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = targetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  const month = z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .safeParse(formData.get("month")).data;
  try {
    await deleteTransaction(await createClient(), actor, parsed.data.id, parsed.data.scope);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível excluir o lançamento.");
  }
  if (formData.get("stay") === "1") {
    refresh();
    return { success: "Lançamento movido para a lixeira." };
  }
  redirect(month ? `/transacoes?mes=${month}` : "/transacoes");
}

export async function restoreTransactionAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = targetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  let restored = 0;
  try {
    restored = await restoreTransaction(await createClient(), actor, parsed.data.id, parsed.data.scope);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível restaurar o lançamento.");
  }
  refresh();
  return { success: restored === 1 ? "Lançamento restaurado." : `${restored} lançamentos restaurados.` };
}
