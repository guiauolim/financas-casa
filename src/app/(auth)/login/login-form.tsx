"use client";

import { MailCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type LoginState, sendMagicLink, signInWithPassword } from "./actions";

const initialState: LoginState = { status: "idle" };

// Padrão: e-mail e senha. "Receber link por e-mail": primeiro acesso (convite) ou esqueci a senha.
export function LoginForm() {
  const [mode, setMode] = useState<"password" | "link">("password");
  const linkError = useSearchParams().get("erro") === "link";
  return mode === "password" ? (
    <PasswordLogin onUseLink={() => setMode("link")} linkError={linkError} />
  ) : (
    <MagicLinkLogin onUsePassword={() => setMode("password")} />
  );
}

function ErrorText({ id, message }: { id: string; message: string | null | undefined }) {
  return message ? (
    <p id={id} className="text-[13px] text-danger" role="alert">
      {message}
    </p>
  ) : null;
}

function SwitchButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 self-center text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
    </button>
  );
}

function PasswordLogin({ onUseLink, linkError }: { onUseLink: () => void; linkError: boolean }) {
  const [state, formAction, pending] = useActionState(signInWithPassword, initialState);
  const error = state.status === "error" ? state.message : linkError ? "Link inválido ou expirado. Peça um novo." : null;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={state.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
        <ErrorText id="login-error" message={error} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <SwitchButton onClick={onUseLink}>Primeiro acesso ou esqueceu a senha? Receber link por e-mail</SwitchButton>
    </form>
  );
}

function MagicLinkLogin({ onUsePassword }: { onUsePassword: () => void }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
          <MailCheck className="size-6" strokeWidth={2} aria-hidden />
        </span>
        <p className="text-[17px] font-semibold">Verifique seu e-mail</p>
        <p className="text-sm text-muted-foreground">
          Enviamos um link de acesso para <strong className="text-foreground">{state.email}</strong>. Ele expira em 1
          hora. Ao entrar, você pode criar (ou trocar) a sua senha.
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : null;
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
        <ErrorText id="email-error" message={error} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link de acesso"}
      </Button>
      <SwitchButton onClick={onUsePassword}>Já tenho senha</SwitchButton>
    </form>
  );
}
