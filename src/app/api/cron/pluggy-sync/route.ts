import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createPluggyClient, pluggyCronConfig } from "@/lib/pluggy/client";
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
  // Só a casa dona das credenciais (PLUGGY_HOUSEHOLD_ID); ligações de outras casas são ignoradas.
  const config = pluggyCronConfig();
  if (!config) return NextResponse.json({ skipped: "pluggy não configurada" });

  try {
    const result = await syncPluggy(createAdminClient(), createPluggyClient(config), {
      householdId: config.householdId,
      userId: null,
    });
    return NextResponse.json({ created: result.created, updated: result.updated, deleted: result.deleted, warnings: result.warnings.length });
  } catch (err) {
    // Virada pendente ou erro da Pluggy: registra só o tipo, sem dados.
    const kind = err instanceof ServiceError ? "regra" : ((err as { name?: string } | null)?.name ?? "erro");
    console.error(`[cron/pluggy-sync] Não sincronizado (${kind})`);
    return NextResponse.json({ skipped: kind });
  }
}
