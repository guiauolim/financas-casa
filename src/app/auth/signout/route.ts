import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { createClient } from "@/lib/supabase/server";

// Logout: só aceita POST vindo do próprio site (sem isso, outro site deslogaria o usuário — CSRF).
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers, request.url)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
