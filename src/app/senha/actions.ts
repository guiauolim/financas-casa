"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/paths";
import { setPasswordErrorMessage, setPasswordSchema } from "@/lib/auth/password";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation/form";

// Cria ou troca a senha de quem está logado. Depois encerra as outras sessões abertas (outros
// navegadores/aparelhos) e segue para `next` (no /senha) ou fica na página (Configurações).
export async function setPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getCurrentUser())) redirect("/login");
  const parsed = setPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password, data: { has_password: true } });
  if (error) {
    console.warn(`[senha] updateUser falhou: ${error.status ?? "?"} ${error.code ?? "sem código"}`);
    return { error: setPasswordErrorMessage(error) };
  }
  await supabase.auth.signOut({ scope: "others" });

  const next = formData.get("next");
  if (typeof next === "string" && next) redirect(safeNextPath(next));
  return { success: "Senha salva. Da próxima vez, entre com e-mail e senha." };
}
