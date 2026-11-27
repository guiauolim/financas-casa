import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { pathAfterEmailLink } from "@/lib/auth/password";
import { safeNextPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES = new Set<EmailOtpType>(["email", "magiclink", "invite", "signup", "recovery", "email_change"]);

// Destino dos links de e-mail (magic link e convite). Sem senha ainda → /senha.
// token_hash (template customizado) funciona mesmo abrindo o link em outro
// navegador; `code` (PKCE) é o fallback do template padrão do Supabase.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();
  let result: { error: unknown; data: { user: { user_metadata?: unknown } | null } } | null = null;
  if (tokenHash && type && OTP_TYPES.has(type)) {
    result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  } else if (code) {
    result = await supabase.auth.exchangeCodeForSession(code);
  }

  if (!result || result.error || !result.data.user) {
    return NextResponse.redirect(new URL("/login?erro=link", request.url));
  }
  // Quem ainda não criou senha vai para /senha (e depois segue para `next`).
  return NextResponse.redirect(new URL(pathAfterEmailLink(result.data.user.user_metadata, next), request.url));
}
