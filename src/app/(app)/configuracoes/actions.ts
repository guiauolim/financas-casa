"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-button";
import { invalidState, serviceErrorState } from "@/lib/actions";
import { requireActor } from "@/lib/auth/session";
import { createAccount, setAccountArchived, updateAccount } from "@/lib/services/accounts";
import { createCategory, setCategoryArchived, updateCategory } from "@/lib/services/categories";
import { cancelInvite, updateMember } from "@/lib/services/households";
import { deleteMerchantRule, updateMerchantRule } from "@/lib/services/merchant-rules";
import {
  createRecurringBill,
  deleteRecurringBill,
  setRecurringBillActive,
  updateRecurringBill,
} from "@/lib/services/recurring-bills";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_FORM_FIELDS, accountSchema } from "@/lib/validation/accounts";
import { CATEGORY_FORM_FIELDS, categorySchema } from "@/lib/validation/categories";
import { type FormState, formValues } from "@/lib/validation/form";
import { MERCHANT_RULE_FIELDS, merchantRuleSchema } from "@/lib/validation/merchant-rules";
import { memberSchema } from "@/lib/validation/members";
import { RECURRING_BILL_FIELDS, recurringBillSchema } from "@/lib/validation/recurring-bills";

const idSchema = z.object({ id: z.uuid() });
const archiveSchema = idSchema.extend({ archived: z.enum(["true", "false"]).transform((v) => v === "true") });

// ───────────── Contas e cartões ─────────────

export async function saveAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const id = formData.get("id");
  const parsed = accountSchema.safeParse(formValues(formData, ACCOUNT_FORM_FIELDS));
  if (!parsed.success) return invalidState(parsed.error);

  try {
    const db = await createClient();
    if (typeof id === "string" && id) await updateAccount(db, actor, z.uuid().parse(id), parsed.data);
    else await createAccount(db, actor, parsed.data);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar a conta. Tente novamente.");
  }
  redirect("/configuracoes/contas");
}

export async function archiveAccountAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  try {
    await setAccountArchived(await createClient(), actor, parsed.data.id, parsed.data.archived);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível atualizar a conta.");
  }
  refresh();
  return { success: parsed.data.archived ? "Conta arquivada." : "Conta reativada." };
}

// ───────────── Categorias ─────────────

export async function saveCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const id = formData.get("id");
  const parsed = categorySchema.safeParse(formValues(formData, CATEGORY_FORM_FIELDS));
  if (!parsed.success) return invalidState(parsed.error);

  try {
    const db = await createClient();
    if (typeof id === "string" && id) await updateCategory(db, actor, z.uuid().parse(id), parsed.data);
    else await createCategory(db, actor, parsed.data);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar a categoria. Tente novamente.");
  }
  redirect("/configuracoes/categorias");
}

export async function archiveCategoryAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  try {
    await setCategoryArchived(await createClient(), actor, parsed.data.id, parsed.data.archived);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível atualizar a categoria.");
  }
  refresh();
  return { success: parsed.data.archived ? "Categoria arquivada." : "Categoria reativada." };
}

// ───────────── Regras de categoria ─────────────

export async function saveMerchantRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Pedido inválido." };
  const parsed = merchantRuleSchema.safeParse(formValues(formData, MERCHANT_RULE_FIELDS));
  if (!parsed.success) return invalidState(parsed.error);
  try {
    await updateMerchantRule(await createClient(), actor, id.data, parsed.data);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar a regra. Tente novamente.");
  }
  redirect("/configuracoes/regras");
}

export async function deleteMerchantRuleAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  try {
    await deleteMerchantRule(await createClient(), actor, parsed.data.id);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível apagar a regra.");
  }
  refresh();
  return { success: "Regra apagada." };
}

// ───────────── Contas fixas ─────────────

export async function saveRecurringBillAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const id = formData.get("id");
  const parsed = recurringBillSchema.safeParse(formValues(formData, RECURRING_BILL_FIELDS));
  if (!parsed.success) return invalidState(parsed.error);
  try {
    const db = await createClient();
    if (typeof id === "string" && id) await updateRecurringBill(db, actor, z.uuid().parse(id), parsed.data);
    else await createRecurringBill(db, actor, parsed.data);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar a conta fixa. Tente novamente.");
  }
  redirect("/configuracoes/contas-fixas");
}

const activeSchema = idSchema.extend({ active: z.enum(["true", "false"]).transform((v) => v === "true") });

export async function setRecurringBillActiveAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = activeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  try {
    await setRecurringBillActive(await createClient(), actor, parsed.data.id, parsed.data.active);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível atualizar a conta fixa.");
  }
  refresh();
  return { success: parsed.data.active ? "Conta fixa reativada." : "Conta fixa pausada." };
}

export async function deleteRecurringBillAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  try {
    await deleteRecurringBill(await createClient(), actor, parsed.data.id);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível excluir a conta fixa.");
  }
  refresh();
  return { success: "Conta fixa excluída." };
}

// ───────────── Membros e convites ─────────────

export async function updateMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Sempre os próprios dados: o id vem da sessão, nunca do formulário.
  const actor = await requireActor();
  const parsed = memberSchema.safeParse(formValues(formData, ["displayName", "phone"]));
  if (!parsed.success) return invalidState(parsed.error);

  try {
    await updateMember(await createClient(), {
      householdId: actor.householdId,
      userId: actor.userId,
      input: parsed.data,
    });
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar. Tente novamente.");
  }
  refresh();
  return { success: "Dados salvos." };
}

export async function cancelInviteAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  try {
    await cancelInvite(await createClient(), { householdId: actor.householdId, inviteId: parsed.data.id });
  } catch (error) {
    return serviceErrorState(error, "Não foi possível cancelar o convite.");
  }
  refresh();
  return { success: "Convite cancelado." };
}
