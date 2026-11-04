import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MemberInput } from "@/lib/validation/members";
import type { AcceptInviteInput, CreateHouseholdInput } from "@/lib/validation/onboarding";
import { isUniqueViolation, ServiceError, supabaseError, throwIf } from "./errors";
import type { Db } from "./types";

// `db` é o cliente com a sessão do usuário: as RPCs usam auth.uid() e a RLS vale.

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
  throwIf(error);
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
  throwIf(error);
  const invite = data?.[0];
  return invite ? { householdId: invite.household_id, householdName: invite.household_name } : null;
}

export async function createHousehold(db: Db, input: CreateHouseholdInput): Promise<string> {
  const { data, error } = await db.rpc("create_household", {
    p_household_name: input.householdName,
    p_display_name: input.displayName,
  });
  if (error) throw supabaseError(error);
  return data;
}

export async function acceptPendingInvite(db: Db, input: AcceptInviteInput): Promise<string> {
  const { data, error } = await db.rpc("accept_household_invite", { p_display_name: input.displayName });
  if (error) throw supabaseError(error);
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
  throwIf(error);

  const admin = createAdminClient();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(params.email, {
    redirectTo: params.redirectTo,
  });
  if (inviteError?.code === "email_exists") return "existing_user";
  if (inviteError) throw inviteError;
  return "invited";
}

export type Member = { userId: string; displayName: string; phoneE164: string | null; createdAt: string };

// Membros em ordem de entrada na casa: a posição define a cor fixa do avatar.
export async function listMembers(db: Db, { householdId }: { householdId: string }): Promise<Member[]> {
  const { data, error } = await db
    .from("profiles")
    .select("user_id, display_name, phone_e164, created_at")
    .eq("household_id", householdId)
    .order("created_at");
  throwIf(error);
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    phoneE164: row.phone_e164,
    createdAt: row.created_at,
  }));
}

export async function updateMember(
  db: Db,
  { householdId, memberUserId, input }: { householdId: string; memberUserId: string; input: MemberInput },
): Promise<void> {
  const { data, error } = await db
    .from("profiles")
    .update({ display_name: input.displayName, phone_e164: input.phone })
    .eq("household_id", householdId)
    .eq("user_id", memberUserId)
    .select("user_id");
  if (isUniqueViolation(error)) throw new ServiceError("Este telefone já está cadastrado para outra pessoa.", "phone");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Membro não encontrado.");
}

export type PendingInvite = { id: string; email: string; createdAt: string };

export async function listPendingInvites(db: Db, { householdId }: { householdId: string }): Promise<PendingInvite[]> {
  const { data, error } = await db
    .from("household_invites")
    .select("id, email, created_at")
    .eq("household_id", householdId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  throwIf(error);
  return (data ?? []).map((row) => ({ id: row.id, email: row.email, createdAt: row.created_at }));
}

// Cancelar só apaga o registro: o e-mail já enviado continua válido para login,
// mas sem convite a pessoa não entra em nenhuma casa no onboarding.
export async function cancelInvite(db: Db, { householdId, inviteId }: { householdId: string; inviteId: string }) {
  const { data, error } = await db
    .from("household_invites")
    .delete()
    .eq("household_id", householdId)
    .eq("id", inviteId)
    .is("accepted_at", null)
    .select("id");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Convite não encontrado.");
}
