import type { CookieOptionsWithName } from "@supabase/ssr";

// Cookies da sessão do Supabase. HttpOnly: o JavaScript da página não lê o token (um XSS não
// rouba a sessão) — por isso não existe cliente Supabase no navegador; tudo passa pelo servidor.
// Secure em produção (em http://localhost alguns navegadores recusariam o cookie). SameSite=Lax:
// o cookie não vai em POST vindo de outro site.
export function sessionCookieOptions(production = process.env.NODE_ENV === "production"): CookieOptionsWithName {
  return { httpOnly: true, secure: production, sameSite: "lax", path: "/" };
}
