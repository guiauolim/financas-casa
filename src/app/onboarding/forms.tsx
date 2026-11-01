"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInviteAction, createHouseholdAction, inviteMemberAction, type FormState } from "./actions";

const initialState: FormState = {};

function Field({
  name,
  label,
  error,
  ...inputProps
}: { name: string; label: string; error?: string } & React.ComponentProps<"input">) {
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  return message ? (
    <p className="text-[13px] text-danger" role="alert">
      {message}
    </p>
  ) : null;
}

export function CreateHouseholdForm() {
  const [state, action, pending] = useActionState(createHouseholdAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field name="displayName" label="Seu nome" autoComplete="given-name" required error={state.fieldErrors?.displayName} />
      <Field
        name="householdName"
        label="Nome da casa"
        placeholder="Ex.: Casa da Ana e do Bruno"
        required
        error={state.fieldErrors?.householdName}
      />
      <FormError message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Criando…" : "Criar casa"}
      </Button>
    </form>
  );
}

export function AcceptInviteForm() {
  const [state, action, pending] = useActionState(acceptInviteAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field name="displayName" label="Seu nome" autoComplete="given-name" required error={state.fieldErrors?.displayName} />
      <FormError message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar na casa"}
      </Button>
    </form>
  );
}

export function InviteMemberForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field
        name="email"
        label="E-mail da outra pessoa"
        type="email"
        inputMode="email"
        autoComplete="off"
        required
        error={state.fieldErrors?.email}
      />
      <FormError message={state.error} />
      {state.success ? (
        <p className="rounded-lg bg-primary-soft px-3 py-2 text-[13px] text-primary-soft-foreground" role="status">
          {state.success}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar convite"}
      </Button>
    </form>
  );
}
