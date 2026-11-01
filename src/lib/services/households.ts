import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { AcceptInviteInput, CreateHouseholdInput } from "@/lib/validation/onboarding";

// `db` é o cliente com a sessão do usuário: as RPCs usam auth.uid() e a RLS vale.
type Db = SupabaseClient<Database>;

export type Profile = {
  userId: string;
  householdId: string;
  displayName: string;
  householdName: string;
};

export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  const { data, error } = await db
    .from("profiles")
    .select("user_id, household_id, display_name, households(name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    userId: data.user_id,
    householdId: data.household_id,
    displayName: data.display_name,
    householdName: data.households?.name ?? "",
  };
}

export async function getPendingInvite(db: Db) {
  const { data, error } = await db.rpc("get_pending_invite");
  if (error) throw error;
  const invite = data?.[0];
  return invite ? { householdId: invite.household_id, householdName: invite.household_name } : null;
}

export async function createHousehold(db: Db, input: CreateHouseholdInput): Promise<string> {
  const { data, error } = await db.rpc("create_household", {
    p_household_name: input.householdName,
    p_display_name: input.displayName,
  });
  if (error) throw error;
  return data;
}

export async function acceptPendingInvite(db: Db, input: AcceptInviteInput): Promise<string> {
  const { data, error } = await db.rpc("accept_household_invite", { p_display_name: input.displayName });
  if (error) throw error;
  return data;
}

export type InviteResult = "invited" | "existing_user";

// Registra o convite (RLS garante que quem convida é membro da casa) e manda o
// e-mail de convite do Supabase Auth. Se a pessoa já tem conta, o convite fica
// registrado e é aceito no próximo login dela pelo onboarding.
export async function inviteMember(
  db: Db,
  params: { householdId: string; userId: string; email: string; redirectTo: string },
): Promise<InviteResult> {
  const { error } = await db
    .from("household_invites")
    .upsert(
      { household_id: params.householdId, email: params.email, invited_by: params.userId },
      { onConflict: "household_id,email", ignoreDuplicates: true },
    );
  if (error) throw error;

  const admin = createAdminClient();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(params.email, {
    redirectTo: params.redirectTo,
  });
  if (inviteError?.code === "email_exists") return "existing_user";
  if (inviteError) throw inviteError;
  return "invited";
}
