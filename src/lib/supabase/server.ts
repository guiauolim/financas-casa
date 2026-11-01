import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

// Cliente com a sessão do usuário (respeita RLS). Criar um por requisição.
export async function createClient() {
  // O auth-js compara a expiração do token com Date.now(). Com Cache Components
  // + partialPrefetching, o Next pré-renderiza um App Shell em que cookies() já
  // resolve mas Date.now() é proibido; connection() adia tudo para a requisição.
  await connection();
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de um Server Component: não dá para gravar cookies aqui.
          // O proxy renova a sessão, então pode ignorar.
        }
      },
    },
  });
}
