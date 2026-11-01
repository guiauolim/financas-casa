import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/auth/paths";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

// Renova a sessão (cookies) e barra quem não está logado.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Não colocar código entre createServerClient e getClaims (renovação do token).
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!isLoggedIn && !isPublicPath(pathname)) return redirectKeepingCookies(request, "/login", response);
  if (isLoggedIn && pathname === "/login") return redirectKeepingCookies(request, "/dashboard", response);
  return response;
}

// Um redirect novo perderia os cookies de sessão renovados acima.
function redirectKeepingCookies(request: NextRequest, pathname: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(pathname, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  from.headers.forEach((value, key) => {
    if (/^(cache-control|expires|pragma)$/i.test(key)) redirect.headers.set(key, value);
  });
  return redirect;
}
