"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess } from "@/components/form";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/validation/form";
import { updateMemberAction } from "../actions";

export function MemberForm({
  member,
}: {
  member: { userId: string; displayName: string; phoneDisplay: string };
}) {
  const [state, action, pending] = useActionState(updateMemberAction, {} as FormState);
  const errors = state.fieldErrors ?? {};
  const prefix = `member-${member.userId.slice(0, 8)}`;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="userId" value={member.userId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${prefix}-name`}
          name="displayName"
          label="Nome"
          defaultValue={member.displayName}
          maxLength={80}
          required
          error={errors.displayName}
        />
        <Field
          id={`${prefix}-phone`}
          name="phone"
          label="WhatsApp (opcional)"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(61) 99999-9999"
          hint="Só números cadastrados aqui conseguem usar o bot."
          defaultValue={member.phoneDisplay}
          error={errors.phone}
        />
      </div>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
