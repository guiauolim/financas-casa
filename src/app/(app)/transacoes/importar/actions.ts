"use server";

import { invalidState, serviceErrorState } from "@/lib/actions";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { applyCardImport, type CardImportPreview, previewCardImport } from "@/lib/services/card-import";
import { createClient } from "@/lib/supabase/server";
import { cardImportApplySchema, cardImportPreviewSchema } from "@/lib/validation/card-import";
import type { FormState } from "@/lib/validation/form";

// Importação de faturas do cartão. Os arquivos são lidos em memória e descartados ao fim
// da requisição (sem storage, sem log do conteúdo).

export type CardPreviewState = FormState & { preview?: CardImportPreview };
export type CardApplyState = FormState & { months?: string[] };

const fields = (formData: FormData) => ({
  accountId: formData.get("accountId"),
  files: formData.getAll("files"),
  holders: formData.get("holders") ?? undefined,
  paymentAccountId: formData.get("paymentAccountId") || undefined,
});

const toFiles = async (files: File[]) =>
  Promise.all(files.map(async (file) => ({ bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name })));

export async function previewCardImportAction(formData: FormData): Promise<CardPreviewState> {
  const actor = await requireActor();
  const parsed = cardImportPreviewSchema.safeParse(fields(formData));
  if (!parsed.success) return invalidState(parsed.error);
  try {
    const { files, ...request } = parsed.data;
    const db = await createClient(); // faz `await connection()` antes do Date.now()
    const preview = await previewCardImport(db, actor, { ...request, today: todayInSaoPaulo(), files: await toFiles(files) });
    return { preview };
  } catch (error) {
    return serviceErrorState(error, "Não foi possível ler as faturas. Tente novamente.");
  }
}

export async function applyCardImportAction(formData: FormData): Promise<CardApplyState> {
  const actor = await requireActor();
  const parsed = cardImportApplySchema.safeParse({
    ...fields(formData),
    fingerprints: formData.getAll("fingerprints"),
    includeFuture: formData.get("includeFuture") === "1",
    decisions: formData.get("decisions") ?? undefined,
  });
  if (!parsed.success) return invalidState(parsed.error);
  try {
    const { files, decisions, ...request } = parsed.data;
    const db = await createClient();
    const result = await applyCardImport(db, actor, {
      ...request,
      today: todayInSaoPaulo(),
      files: await toFiles(files),
      decisions: decisions ?? { overrides: [], rules: [] },
    });
    const parts = [`${result.created} lançamento(s) importado(s)`];
    if (result.duplicates) parts.push(`${result.duplicates} já existiam`);
    return { success: `${parts.join(" · ")}.`, months: result.months };
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar a importação. Tente novamente.");
  }
}
