"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess } from "@/components/form";
import { Button } from "@/components/ui/button";
import { acceptInviteAction, createHouseholdAction, inviteMemberAction, type FormState } from "./actions";

const initialState: FormState = {};

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
      <FormSuccess message={state.success} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar convite"}
      </Button>
    </form>
  );
}
