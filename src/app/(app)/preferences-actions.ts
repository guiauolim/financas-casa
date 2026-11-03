"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/lib/auth/session";
import { isSpendingView } from "@/lib/finance/spending-view";
import { setSpendingView } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";

// Visão do gasto (Por data da compra / Por fatura), lembrada no perfil de quem clicou.
export async function setSpendingViewAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const view = formData.get("view");
  if (!isSpendingView(view)) return;
  try {
    await setSpendingView(await createClient(), actor, view);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? "sem código";
    console.error(`[action] Não foi possível salvar a visão do gasto (${code})`);
    return;
  }
  refresh();
}
