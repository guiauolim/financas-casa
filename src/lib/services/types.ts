import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// `db` é o cliente com a sessão do usuário (RLS vale) no site, ou o admin no bot.
// Mesmo assim, todo serviço filtra por household_id explicitamente.
export type Db = SupabaseClient<Database>;

export type Actor = { householdId: string; userId: string };
