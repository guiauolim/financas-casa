import "server-only";
import { PLUGGY_START_DATE } from "@/lib/finance/pluggy-links";
import { pluggyCardStartRef } from "@/lib/importers/pluggy/plan";
import { ServiceError, throwIf } from "./errors";
import { listPluggyLinks } from "./pluggy";
import type { Actor, Db } from "./types";

// Virada para a Pluggy: a partir de PLUGGY_START_DATE os lançamentos das contas ligadas vêm do
// banco (no cartão, a partir da fatura que contém essa data). Os lançados à mão/importados nessas contas a partir daí são substituídos — exceto os
// pagamentos de fatura (transferência para um cartão ligado), que ficam para a conciliação.
// Enquanto houver algo a substituir, a sincronização não roda (evita contar em dobro).

export type CutoverRow = { accountId: string; accountName: string; expense: number; income: number; transfer: number };
export type CutoverSummary = { rows: CutoverRow[]; total: number; keptPayments: number };

async function cutoverCandidates(db: Db, householdId: string) {
  const links = (await listPluggyLinks(db, { householdId })).filter((l) => l.role !== "ignore" && l.accountId);
  const accountIds = [...new Set(links.map((l) => l.accountId!))];
  const cardIds = new Set(links.filter((l) => l.role === "card").map((l) => l.accountId!));
  if (accountIds.length === 0) return { candidates: [], keptPayments: 0, names: new Map<string, string>() };

  const [{ data: txs, error }, { data: accounts, error: accountsError }] = await Promise.all([
    db
      .from("transactions")
      .select("id, account_id, transfer_account_id, type")
      .eq("household_id", householdId)
      .neq("source", "pluggy")
      .in("account_id", accountIds)
      .gte("occurred_on", PLUGGY_START_DATE),
    db.from("accounts").select("id, name, closing_day, due_day").eq("household_id", householdId).in("id", accountIds),
  ]);
  throwIf(error);
  throwIf(accountsError);

  // Cartão: o corte é pela fatura. Compras de antes da data do corte que estão na 1ª fatura da
  // Pluggy (ex.: 26 a 31/10 na fatura de novembro) também são substituídas pelas do banco.
  const cardRows: { id: string; account_id: string; transfer_account_id: string | null; type: string }[] = [];
  for (const account of (accounts ?? []).filter((a) => cardIds.has(a.id) && a.closing_day && a.due_day)) {
    const startRef = pluggyCardStartRef(PLUGGY_START_DATE, { closingDay: account.closing_day!, dueDay: account.due_day! });
    const { data, error: cardError } = await db
      .from("transactions")
      .select("id, account_id, transfer_account_id, type")
      .eq("household_id", householdId)
      .neq("source", "pluggy")
      .neq("type", "transfer")
      .eq("account_id", account.id)
      .lt("occurred_on", PLUGGY_START_DATE)
      .gte("invoice_ref", startRef);
    throwIf(cardError);
    cardRows.push(...(data ?? []));
  }

  const isPayment = (t: { type: string; transfer_account_id: string | null }) =>
    t.type === "transfer" && t.transfer_account_id !== null && cardIds.has(t.transfer_account_id);
  const rows = [...(txs ?? []), ...cardRows];
  return {
    candidates: rows.filter((t) => !isPayment(t)),
    keptPayments: rows.filter(isPayment).length,
    names: new Map((accounts ?? []).map((a) => [a.id, a.name])),
  };
}

export async function getCutoverSummary(db: Db, { householdId }: { householdId: string }): Promise<CutoverSummary> {
  const { candidates, keptPayments, names } = await cutoverCandidates(db, householdId);
  const byAccount = new Map<string, CutoverRow>();
  for (const t of candidates) {
    const row =
      byAccount.get(t.account_id) ??
      { accountId: t.account_id, accountName: names.get(t.account_id) ?? "Conta", expense: 0, income: 0, transfer: 0 };
    row[t.type as "expense" | "income" | "transfer"]++;
    byAccount.set(t.account_id, row);
  }
  return { rows: [...byAccount.values()], total: candidates.length, keptPayments };
}

// Exclui de vez (sem lixeira) os lançamentos que a Pluggy vai substituir. Devolve quantos.
export async function applyCutover(db: Db, actor: Actor): Promise<number> {
  const { candidates } = await cutoverCandidates(db, actor.householdId);
  const ids = candidates.map((t) => t.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db
      .from("transactions")
      .delete()
      .eq("household_id", actor.householdId)
      .neq("source", "pluggy")
      .in("id", ids.slice(i, i + 200));
    throwIf(error);
  }
  return ids.length;
}

export async function assertCutoverDone(db: Db, householdId: string): Promise<void> {
  const { candidates } = await cutoverCandidates(db, householdId);
  if (candidates.length > 0) {
    throw new ServiceError(
      `Antes da primeira sincronização, substitua os ${candidates.length} lançamentos de novembro em diante (Configurações → Bancos).`,
    );
  }
}
