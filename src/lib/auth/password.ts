import { z } from "zod";
import { safeNextPath } from "./paths";

// Login com senha. O primeiro acesso (convite) e o "esqueci a senha" continuam pelo link do
// e-mail; depois do link, quem ainda não tem senha é levado a criar uma.

export const PASSWORD_MIN = 8;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, { error: `Use pelo menos ${PASSWORD_MIN} caracteres.` })
  .max(72, { error: "Use no máximo 72 caracteres." })
  .refine((v) => /[A-Za-zÀ-ÿ]/.test(v) && /\d/.test(v), { error: "Misture letras e números." });

export const setPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: "As senhas não são iguais.", path: ["confirm"] });

export const passwordLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Informe um e-mail válido." })),
  password: z.string().min(1, { error: "Informe a senha." }).max(72),
});

// Marca (só de interface) de que a pessoa já criou senha: fica no user_metadata do Supabase Auth.
// Não é controle de acesso — quem decide se a senha confere é o Supabase.
export const hasPassword = (userMetadata: unknown) =>
  Boolean(userMetadata && typeof userMetadata === "object" && (userMetadata as { has_password?: unknown }).has_password === true);

// Depois de entrar pelo link do e-mail: sem senha → criar senha (e depois seguir para `next`).
export function pathAfterEmailLink(userMetadata: unknown, next: string | null | undefined): string {
  const target = safeNextPath(next);
  return hasPassword(userMetadata) ? target : `/senha?next=${encodeURIComponent(target)}`;
}

// Mensagens do login com senha: sempre genéricas (não dizem se o e-mail existe).
export function passwordLoginErrorMessage(error: { status?: number; code?: string }): string {
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  }
  if (error.code === "email_not_confirmed") return "Confirme o e-mail pelo link que enviamos antes de usar a senha.";
  return "E-mail ou senha incorretos.";
}

export function setPasswordErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "same_password") return "Essa já é a sua senha atual.";
  if (error.code === "weak_password") return "Senha fraca. Use uma mais longa, com letras e números.";
  if (error.code === "reauthentication_needed") return "Por segurança, entre de novo pelo link do e-mail e defina a senha logo em seguida.";
  return "Não foi possível salvar a senha. Tente novamente.";
}
