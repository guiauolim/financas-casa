import "server-only";
import {
  type DiscoveredSource,
  type LinkAccount,
  type LinkChoice,
  linkChoiceError,
  PLUGGY_START_DATE,
  type PluggyRole,
  type PluggySourceKind,
  sourceKey,
} from "@/lib/finance/pluggy-links";
import { addDays, todayInSaoPaulo } from "@/lib/finance/dates";
import { suggestClosingDay } from "@/lib/importers/pluggy/plan";
import { type PluggyClient, toCents } from "@/lib/pluggy/client";
import { ServiceError, throwIf } from "./errors";
import type { Actor, Db } from "./types";

export type PluggyItemInfo = {
  itemId: string;
  connectorName: string;
  status: string;
  lastUpdatedAt: string | null;
  consentExpiresAt: string | null;
};

export type PluggyDiscovery = { items: PluggyItemInfo[]; sources: DiscoveredSource[] };

// Lê da Pluggy o que cada login (item) tem: contas correntes, cartões e investimentos.
// Só leitura; nada é gravado.
export async function discoverPluggySources(client: PluggyClient): Promise<PluggyDiscovery> {
  const perItem = await Promise.all(
    client.itemIds.map(async (itemId) => {
      const [item, accounts, investments] = await Promise.all([
        client.getItem(itemId),
        client.listAccounts(itemId),
        client.listInvestments(itemId),
      ]);
      const sources: DiscoveredSource[] = [];
      for (const account of accounts) {
        const kind: PluggySourceKind = account.type === "CREDIT" ? "card" : "bank_account";
        let activity = 0;
        let suggestedClosingDay: number | null = null;
        if (kind === "card") {
          // ~6 meses de faturas fechadas para sugerir o melhor dia de compra.
          const [transactions, bills] = await Promise.all([
            client.listTransactions(account.id, { from: addDays(todayInSaoPaulo(), -180) }),
            client.listBills(account.id),
          ]);
          activity = transactions.filter((t) => t.date.slice(0, 10) >= PLUGGY_START_DATE).length;
          suggestedClosingDay = suggestClosingDay(transactions, bills);
        }
        sources.push({
          key: sourceKey(kind, account.id),
          itemId,
          sourceKind: kind,
          externalId: account.id,
          label: account.name,
          balanceCents: kind === "bank_account" && account.balance != null ? toCents(account.balance) : null,
          activity,
          investmentKinds: [],
          suggestedClosingDay,
        });
      }
      const active = investments.filter((i) => i.status !== "TOTAL_WITHDRAWAL");
      if (investments.length > 0) {
        sources.push({
          key: sourceKey("investments", itemId),
          itemId,
          sourceKind: "investments",
          externalId: itemId,
          label: "Investimentos",
          balanceCents: active.reduce((sum, i) => sum + toCents(i.balance ?? 0), 0),
          activity: active.length,
          investmentKinds: [...new Set(active.map((i) => `${i.type}/${i.subtype ?? "—"}`))].sort(),
        });
      }
      const info: PluggyItemInfo = {
        itemId,
        connectorName: item.connector?.name ?? "Pluggy",
        status: item.status,
        lastUpdatedAt: item.lastUpdatedAt ?? null,
        consentExpiresAt: item.consentExpiresAt ?? null,
      };
      return { info, sources };
    }),
  );
  return { items: perItem.map((p) => p.info), sources: perItem.flatMap((p) => p.sources) };
}

export type PluggyLink = {
  id: string;
  itemId: string;
  sourceKind: PluggySourceKind;
  externalId: string;
  key: string;
  label: string;
  role: PluggyRole;
  accountId: string | null;
  ownerUserId: string | null;
  lastBalanceCents: number | null;
  lastSyncedAt: string | null;
};

export async function listPluggyLinks(db: Db, { householdId }: { householdId: string }): Promise<PluggyLink[]> {
  const { data, error } = await db
    .from("pluggy_links")
    .select("id, item_id, source_kind, external_id, label, role, account_id, owner_user_id, last_balance_cents, last_synced_at")
    .eq("household_id", householdId)
    .order("created_at");
  throwIf(error);
  return (data ?? []).map((row) => {
    const sourceKind = row.source_kind as PluggySourceKind;
    return {
      id: row.id,
      itemId: row.item_id,
      sourceKind,
      externalId: row.external_id,
      key: sourceKey(sourceKind, row.external_id),
      label: row.label,
      role: row.role as PluggyRole,
      accountId: row.account_id,
      ownerUserId: row.owner_user_id,
      lastBalanceCents: row.last_balance_cents,
      lastSyncedAt: row.last_synced_at,
    };
  });
}

export type LinkInput = LinkChoice & { ownerUserId: string | null };

// Grava as ligações das origens descobertas (upsert). Só aceita origens que a Pluggy devolveu agora.
export async function savePluggyLinks(
  db: Db,
  actor: Actor,
  sources: readonly DiscoveredSource[],
  inputs: ReadonlyMap<string, LinkInput>,
): Promise<void> {
  const [{ data: accountRows, error: accountsError }, { data: memberRows, error: membersError }] = await Promise.all([
    db.from("accounts").select("id, name, kind, owner_user_id, archived").eq("household_id", actor.householdId),
    db.from("profiles").select("user_id").eq("household_id", actor.householdId),
  ]);
  throwIf(accountsError);
  throwIf(membersError);
  const accounts: LinkAccount[] = (accountRows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    ownerUserId: a.owner_user_id,
    archived: a.archived,
  }));
  const members = new Set((memberRows ?? []).map((m) => m.user_id));

  const rows = [];
  for (const source of sources) {
    const input = inputs.get(source.key);
    if (!input) continue;
    const problem = linkChoiceError(source, input, accounts);
    if (problem) throw new ServiceError(`${source.label}: ${problem}`, source.key);
    if (input.ownerUserId && !members.has(input.ownerUserId)) throw new ServiceError("Pessoa inválida.");
    rows.push({
      household_id: actor.householdId,
      item_id: source.itemId,
      source_kind: source.sourceKind,
      external_id: source.externalId,
      label: source.label,
      role: input.role,
      account_id: input.role === "vault" || input.role === "reserve" || input.role === "card" ? input.accountId : null,
      owner_user_id: input.ownerUserId,
    });
  }
  if (rows.length === 0) return;
  const { error } = await db.from("pluggy_links").upsert(rows, { onConflict: "household_id,source_kind,external_id" });
  throwIf(error);
}
