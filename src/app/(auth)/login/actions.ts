"use server";

import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/onboarding";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "E-mail inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });
  if (error) {
    const message =
      error.status === 429
        ? "Muitas tentativas. Espere um minuto e tente de novo."
        : "Não foi possível enviar o link. Tente novamente.";
    return { status: "error", message, email: parsed.data.email };
  }

  return { status: "sent", email: parsed.data.email };
}
