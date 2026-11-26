import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createPluggyClient, pluggyConfig } from "@/lib/pluggy/client";
import { ServiceError } from "@/lib/services/errors";
import { syncPluggy } from "@/lib/services/pluggy-sync";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron (vercel.json): sincroniza com a Pluggy uma vez por dia. O proxy não roda em /api/*:
// a rota se autentica sozinha por `Authorization: Bearer ${CRON_SECRET}`. Cliente admin (sem
// sessão): o serviço filtra tudo por household_id. Sem log de valores nem de conteúdo.
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const config = pluggyConfig();
  if (!config) return NextResponse.json({ skipped: "pluggy não configurada" });

  const db = createAdminClient();
  const { data, error } = await db.from("pluggy_links").select("household_id").neq("role", "ignore");
  if (error) {
    console.error(`[cron/pluggy-sync] Não foi possível ler as ligações (${error.code ?? "sem código"})`);
    return NextResponse.json({ error: "Falha ao ler as ligações." }, { status: 500 });
  }

  const results: Record<string, unknown>[] = [];
  for (const householdId of new Set((data ?? []).map((r) => r.household_id))) {
    try {
      const result = await syncPluggy(db, createPluggyClient(config), { householdId, userId: null });
      results.push({ created: result.created, updated: result.updated, deleted: result.deleted, warnings: result.warnings.length });
    } catch (err) {
      // Virada pendente ou erro da Pluggy: registra só o tipo, sem dados.
      const kind = err instanceof ServiceError ? "regra" : ((err as { name?: string } | null)?.name ?? "erro");
      console.error(`[cron/pluggy-sync] Casa não sincronizada (${kind})`);
      results.push({ skipped: kind });
    }
  }
  return NextResponse.json({ households: results.length, results });
}
