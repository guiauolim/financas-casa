import { type NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { parseYearMonth, todayInSaoPaulo } from "@/lib/finance/dates";
import { getTransactionsMonth } from "@/lib/services/month-transactions";
import { createClient } from "@/lib/supabase/server";

// Dados de um mês da tela Transações, para trocar de mês sem renderizar a página de novo
// (o cliente guarda em memória e busca antes o mês anterior e o próximo).
// Passa pelo proxy (sessão renovada; sem login → /login). A RLS protege os dados.
export async function GET(request: NextRequest) {
  const month = parseYearMonth(request.nextUrl.searchParams.get("mes") ?? "");
  if (!month) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Sem sessão." }, { status: 401 });
  try {
    const data = await getTransactionsMonth(await createClient(), {
      householdId: profile.householdId,
      month,
      today: todayInSaoPaulo(),
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? "sem código";
    console.error(`[transacoes/dados] Não foi possível carregar o mês (${code})`);
    return NextResponse.json({ error: "Não foi possível carregar o mês." }, { status: 500 });
  }
}
