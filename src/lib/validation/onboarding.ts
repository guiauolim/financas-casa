import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Informe um e-mail válido." }));

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `Informe ${label}.` })
    .max(80, { error: "Use no máximo 80 caracteres." });

export const loginSchema = z.object({ email });

export const createHouseholdSchema = z.object({
  householdName: name("o nome da casa"),
  displayName: name("seu nome"),
});

export const acceptInviteSchema = z.object({ displayName: name("seu nome") });

export const inviteMemberSchema = z.object({ email });

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
