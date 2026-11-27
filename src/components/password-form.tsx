"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess } from "@/components/form";
import { Button } from "@/components/ui/button";
import { setPasswordAction } from "@/app/senha/actions";
import { PASSWORD_MIN } from "@/lib/auth/password";
import type { FormState } from "@/lib/validation/form";

// Criar/trocar senha. Com `next`, segue para lá ao salvar; sem, mostra a confirmação.
export function PasswordForm({
  email,
  next,
  submitLabel = "Salvar senha",
}: {
  email: string | null;
  next?: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState(setPasswordAction, {} as FormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {/* Para o gerenciador de senhas do navegador associar a senha ao e-mail certo. */}
      <input type="email" name="username" autoComplete="username" value={email ?? ""} hidden readOnly />
      <Field
        id="new-password"
        name="password"
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        hint={`Pelo menos ${PASSWORD_MIN} caracteres, com letras e números.`}
        required
        error={errors.password}
      />
      <Field
        id="confirm-password"
        name="confirm"
        label="Repita a senha"
        type="password"
        autoComplete="new-password"
        required
        error={errors.confirm}
      />
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}
