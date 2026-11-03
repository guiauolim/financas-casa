import type { PostgrestError } from "@supabase/supabase-js";

// Erro de regra de negócio com mensagem pronta para o usuário (PT-BR). Server
// Actions e as tools do bot mostram `message`; outros erros viram mensagem genérica.
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export const isUniqueViolation = (error: PostgrestError | null) => error?.code === "23505";

// Lança um Error de verdade (stack e mensagem legíveis no overlay/log), mantendo `code`,
// `details` e `hint` do PostgREST para quem trata pelo código (ex.: serviceErrorState).
export function throwIf(error: PostgrestError | null): void {
  if (!error) return;
  throw Object.assign(new Error(`Supabase ${error.code}: ${error.message}`), {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}
