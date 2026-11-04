import "server-only";
import { cache } from "react";
import { monthFromParam } from "@/components/month-nav";
import { requireActor } from "@/lib/auth/session";
import { parseYearMonth, todayInSaoPaulo } from "@/lib/finance/dates";
import { listMembers } from "@/lib/services/households";
import { getMonthOverview } from "@/lib/services/overview";
import { listRecentTransactions } from "@/lib/services/transactions";
import { createClient } from "@/lib/supabase/server";

// Cada seção da Visão geral fica no seu <Suspense> e chama estes loaders; o `cache`
// do React faz a busca uma vez por requisição. `mes` é o parâmetro cru da URL.
const context = cache(async (mes: string | undefined) => {
  const actor = await requireActor();
  const db = await createClient(); // faz `await connection()` antes do Date.now() abaixo
  const today = todayInSaoPaulo();
  // Sem `?mes` (ou inválido): todos os meses até o atual (padrão da Visão geral).
  const allMonths = !(mes && parseYearMonth(mes));
  return { actor, db, today, allMonths, month: monthFromParam(mes, today) };
});

export const loadOverview = cache(async (mes: string | undefined) => {
  const { actor, db, today, month, allMonths } = await context(mes);
  return getMonthOverview(db, { householdId: actor.householdId, month: allMonths ? "all" : month, today });
});

export const loadRecent = cache(async (mes: string | undefined) => {
  const { actor, db, month, today, allMonths } = await context(mes);
  const [transactions, members] = await Promise.all([
    listRecentTransactions(db, {
      householdId: actor.householdId,
      ...(allMonths ? { until: today } : { month }),
      limit: 8,
    }),
    listMembers(db, { householdId: actor.householdId }),
  ]);
  return { month, allMonths, transactions, memberIds: members.map((m) => m.userId) };
});

export const mesParam = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
