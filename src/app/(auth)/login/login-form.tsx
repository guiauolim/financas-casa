"use client";

import { MailCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);
  const linkError = useSearchParams().get("erro") === "link";

  if (state.status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
          <MailCheck className="size-6" strokeWidth={2} aria-hidden />
        </span>
        <p className="text-[17px] font-semibold">Verifique seu e-mail</p>
        <p className="text-sm text-muted-foreground">
          Enviamos um link de acesso para <strong className="text-foreground">{state.email}</strong>. Ele expira em 1
          hora.
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : linkError ? "Link inválido ou expirado. Peça um novo." : null;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "email-error" : undefined}
        />
        {error ? (
          <p id="email-error" className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link de acesso"}
      </Button>
    </form>
  );
}
