import "server-only";
import type { z } from "zod";
import { ServiceError } from "@/lib/services/errors";
import { fieldErrors, type FormState } from "@/lib/validation/form";

// Converte erro de serviço em estado de formulário; outros erros viram mensagem genérica
// (e vão para o log só com o código, sem dados do usuário).
export function serviceErrorState(error: unknown, fallback: string): FormState {
  if (error instanceof ServiceError) {
    return error.field ? { fieldErrors: { [error.field]: error.message } } : { error: error.message };
  }
  const code = (error as { code?: string } | null)?.code ?? "sem código";
  console.error(`[action] ${fallback} (${code})`);
  return { error: fallback };
}

export function invalidState(error: z.ZodError): FormState {
  return { fieldErrors: fieldErrors(error.issues) };
}
