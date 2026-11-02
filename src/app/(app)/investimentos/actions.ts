"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-button";
import { invalidState, serviceErrorState } from "@/lib/actions";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import {
  applyB3Import,
  type B3Preview,
  createInvestment,
  previewB3Import,
  setInvestmentArchived,
  updateInvestment,
  updateInvestmentValue,
} from "@/lib/services/investments";
import { createClient } from "@/lib/supabase/server";
import { type FormState, formValues } from "@/lib/validation/form";
import {
  b3ApplySchema,
  b3InvestmentSchema,
  b3PreviewSchema,
  INVESTMENT_FORM_FIELDS,
  INVESTMENT_VALUE_FIELDS,
  investmentCreateSchema,
  investmentIdSchema,
  investmentSchema,
  investmentValueSchema,
} from "@/lib/validation/investments";

export async function saveInvestmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const id = formData.get("id");
  const values = formValues(formData, INVESTMENT_FORM_FIELDS);

  try {
    const db = await createClient();
    if (typeof id === "string" && id) {
      const investmentId = z.uuid().parse(id);
      // Ativo da B3 só edita nome, classe e apelidos (o serviço confere a origem de novo).
      const schema = formData.get("source") === "b3" ? b3InvestmentSchema : investmentSchema;
      const parsed = schema.safeParse(values);
      if (!parsed.success) return invalidState(parsed.error);
      await updateInvestment(db, actor, investmentId, parsed.data);
    } else {
      const parsed = investmentCreateSchema.safeParse(values);
      if (!parsed.success) return invalidState(parsed.error);
      if (parsed.data.valueDate > todayInSaoPaulo()) {
        return { fieldErrors: { valueDate: "A data não pode ser no futuro." } };
      }
      await createInvestment(db, actor, parsed.data);
    }
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar o investimento. Tente novamente.");
  }
  redirect("/investimentos");
}

export async function updateInvestmentValueAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const parsed = investmentValueSchema.safeParse(formValues(formData, INVESTMENT_VALUE_FIELDS));
  if (!parsed.success) return invalidState(parsed.error);
  try {
    const db = await createClient();
    const { id, ...input } = parsed.data;
    await updateInvestmentValue(db, actor, { ...input, investmentId: id }, todayInSaoPaulo());
  } catch (error) {
    return serviceErrorState(error, "Não foi possível atualizar o valor. Tente novamente.");
  }
  refresh();
  return { success: "Valor atualizado." };
}

export async function setInvestmentArchivedAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = investmentIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Pedido inválido." };
  const archived = formData.get("archived") === "1";
  try {
    const db = await createClient();
    await setInvestmentArchived(db, actor, parsed.data.id, archived, todayInSaoPaulo());
  } catch (error) {
    return serviceErrorState(error, "Não foi possível atualizar o investimento.");
  }
  refresh();
  return { success: archived ? "Investimento arquivado." : "Investimento reativado." };
}

// ───────────────────────── Importação da B3 ─────────────────────────
// O arquivo é lido em memória e descartado ao fim da requisição (sem storage, sem log).

export type B3PreviewState = FormState & { preview?: B3Preview };

export async function previewB3Action(formData: FormData): Promise<B3PreviewState> {
  const actor = await requireActor();
  const parsed = b3PreviewSchema.safeParse({ ownerUserId: formData.get("ownerUserId"), file: formData.get("file") });
  if (!parsed.success) return invalidState(parsed.error);
  try {
    const { file, ownerUserId } = parsed.data;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = await previewB3Import(await createClient(), actor, { ownerUserId, bytes, fileName: file.name });
    return { preview };
  } catch (error) {
    return serviceErrorState(error, "Não foi possível ler o arquivo. Tente novamente.");
  }
}

export async function applyB3Action(formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const parsed = b3ApplySchema.safeParse({
    ownerUserId: formData.get("ownerUserId"),
    file: formData.get("file"),
    referenceDate: formData.get("referenceDate"),
    fingerprint: formData.get("fingerprint"),
    archiveIds: formData.getAll("archiveIds"),
  });
  if (!parsed.success) return invalidState(parsed.error);
  let summary: string;
  try {
    const { file, ...request } = parsed.data;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await applyB3Import(
      await createClient(),
      actor,
      { ...request, bytes, fileName: file.name },
      todayInSaoPaulo(),
    );
    summary = `Importação concluída: ${result.created} novo(s), ${result.updated} atualizado(s), ${result.archived} arquivado(s).`;
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar a importação. Tente novamente.");
  }
  return { success: summary };
}
