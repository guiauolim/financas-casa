"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";
import { acceptPendingInvite, createHousehold, inviteMember } from "@/lib/services/households";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { acceptInviteSchema, createHouseholdSchema, inviteMemberSchema } from "@/lib/validation/onboarding";

export type FormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string>>;
  success?: string;
};

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  return Object.fromEntries(issues.map((issue) => [String(issue.path[0]), issue.message]));
}

export async function createHouseholdAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getCurrentUser())) redirect("/login");

  const parsed = createHouseholdSchema.safeParse({
    householdName: formData.get("householdName"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  try {
    await createHousehold(await createClient(), parsed.data);
  } catch {
    return { error: "Não foi possível criar a casa. Tente novamente." };
  }
  redirect("/onboarding/convite");
}

export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getCurrentUser())) redirect("/login");

  const parsed = acceptInviteSchema.safeParse({ displayName: formData.get("displayName") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  try {
    await acceptPendingInvite(await createClient(), parsed.data);
  } catch {
    return { error: "Não foi possível aceitar o convite. Tente novamente." };
  }
  redirect("/dashboard");
}

export async function inviteMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/onboarding");

  const parsed = inviteMemberSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  try {
    const result = await inviteMember(await createClient(), {
      householdId: profile.householdId,
      userId: profile.userId,
      email: parsed.data.email,
      redirectTo: `${siteUrl()}/onboarding`,
    });
    return {
      success:
        result === "invited"
          ? `Convite enviado para ${parsed.data.email}.`
          : `${parsed.data.email} já tem conta. Peça para entrar no site: o convite aparece no primeiro acesso.`,
    };
  } catch {
    return { error: "Não foi possível enviar o convite. Tente novamente." };
  }
}
