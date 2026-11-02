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

export function throwIf(error: PostgrestError | null): void {
  if (error) throw error;
}
