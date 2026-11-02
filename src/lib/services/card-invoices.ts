import "server-only";
import { throwIf } from "./errors";
import type { Db } from "./types";

// Faturas pagas fora do sistema (importadas como "Fatura Paga"): cartão -> meses de
// vencimento ("YYYY-MM"). Entram em CardAccount.settledReferences (lib/finance/balances).
export async function listSettledInvoices(
  db: Db,
  { householdId }: { householdId: string },
): Promise<Map<string, Set<string>>> {
  const { data, error } = await db
    .from("card_statement_imports")
    .select("account_id, due_date")
    .eq("household_id", householdId)
    .eq("paid", true);
  throwIf(error);
  const result = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const set = result.get(row.account_id) ?? new Set<string>();
    set.add(row.due_date.slice(0, 7));
    result.set(row.account_id, set);
  }
  return result;
}
