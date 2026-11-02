import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getProfile } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";

// Leem cookies: chamar só dentro de <Suspense>, Server Actions ou Route Handlers.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  return getProfile(await createClient(), user.id);
});

// Para Server Actions e páginas que precisam da casa: sem profile -> onboarding.
export async function requireActor() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/onboarding");
  return { householdId: profile.householdId, userId: profile.userId, profile };
}
