import "server-only";
import { addDays, todayInSaoPaulo } from "@/lib/finance/dates";
import { cardPaymentAccount } from "@/lib/finance/payment-account";
import { type HistoryEntry, learnCategoryHistory } from "@/lib/finance/categorize";
import { PLUGGY_START_DATE } from "@/lib/finance/pluggy-links";
import type { PlanCategory } from "@/lib/importers/card-statement/plan";
import {
  type ExistingExternal,
  type ExistingTx,
  planPluggySync,
  type SourceData,
  type SyncCard,
  type SyncLink,
  type SyncPlan,
} from "@/lib/importers/pluggy/plan";
import type { PluggyAccount, PluggyClient } from "@/lib/pluggy/client";
import { listAccounts } from "./accounts";
import { listCategories } from "./categories";
import { ServiceError, throwIf } from "./errors";
import { listMerchantRules } from "./merchant-rules";
import { listPluggyLinks } from "./pluggy";
import { assertCutoverDone } from "./pluggy-cutover";
import type { Db } from "./types";

export type SyncResult = SyncPlan["counts"] & { warnings: string[]; investments: number };

const chunks = <T>(list: readonly T[], size = 200): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

// Nome curto do banco a partir do nome da conta na Pluggy ("Nu Pagamentos S.A. - …" → "Nubank").
export function institutionName(label: string): string {
  if (/^nu\b|nubank|nu pagamentos/i.test(label)) return "Nubank";
  if (/ita[uú]/i.test(label)) return "Itaú";
  if (/banco do brasil|\bbb\b/i.test(label)) return "Banco do Brasil";
  return label;
}

// Sincroniza a casa com a Pluggy: lê as origens ligadas, monta o plano (puro) e grava.
// `db`: cliente do usuário (botão, RLS vale) ou admin (cron; filtra por household_id sempre).
// `userId`: quem pediu (created_by); null no cron.
export async function syncPluggy(
  db: Db,
  client: PluggyClient,
  { householdId, userId, today = todayInSaoPaulo() }: { householdId: string; userId: string | null; today?: string },
): Promise<SyncResult> {
  const links = (await listPluggyLinks(db, { householdId })).filter((l) => l.role !== "ignore");
  if (links.length === 0) throw new ServiceError("Ligue as contas do banco em Configurações → Bancos (Pluggy).");
  await assertCutoverDone(db, householdId);

  const [accounts, categoryList, rules, holdersRes, externalsRes] = await Promise.all([
    listAccounts(db, { householdId, includeArchived: true }),
    listCategories(db, { householdId, includeArchived: true }),
    listMerchantRules(db, { householdId }),
    db.from("card_holders").select("account_id, last_digits, user_id").eq("household_id", householdId),
    db
      .from("external_transactions")
      .select("external_id, status, transaction_id, provider_status, bill_id, link_id")
      .eq("household_id", householdId)
      .eq("provider", "pluggy"),
  ]);
  throwIf(holdersRes.error);
  throwIf(externalsRes.error);

  // Cartões ligados: ciclo, conta pagadora e finais.
  const cards = new Map<string, SyncCard>();
  for (const link of links.filter((l) => l.role === "card" && l.accountId)) {
    const account = accounts.find((a) => a.id === link.accountId);
    if (!account?.closingDay || !account.dueDay) continue;
    cards.set(account.id, {
      accountId: account.id,
      closingDay: account.closingDay,
      dueDay: account.dueDay,
      paymentAccountId: cardPaymentAccount(account, accounts)?.id ?? null,
      holders: new Map(
        (holdersRes.data ?? []).filter((h) => h.account_id === account.id).map((h) => [h.last_digits, h.user_id]),
      ),
    });
  }

  // Dados da Pluggy, por origem (contas de cada login lidas uma vez só).
  const accountsByItem = new Map<string, Promise<PluggyAccount[]>>();
  const itemAccounts = (itemId: string) => {
    if (!accountsByItem.has(itemId)) accountsByItem.set(itemId, client.listAccounts(itemId));
    return accountsByItem.get(itemId)!;
  };
  const data: SourceData[] = await Promise.all(
    links.map(async (link): Promise<SourceData> => {
      if (link.sourceKind === "bank_account") {
        const [list, transactions] = await Promise.all([
          itemAccounts(link.itemId),
          client.listTransactions(link.externalId, { from: PLUGGY_START_DATE }),
        ]);
        const balance = list.find((a) => a.id === link.externalId)?.balance;
        return {
          linkId: link.id,
          kind: "bank_account",
          balanceCents: balance == null ? null : Math.round(balance * 100),
          transactions,
        };
      }
      if (link.sourceKind === "card") {
        const [transactions, bills] = await Promise.all([
          // Antes do corte também: o fim do mês anterior pode ser da 1ª fatura (o plano filtra pela fatura).
          client.listTransactions(link.externalId, { from: addDays(PLUGGY_START_DATE, -45) }),
          client.listBills(link.externalId),
        ]);
        return { linkId: link.id, kind: "card", transactions, bills };
      }
      return { linkId: link.id, kind: "investments", investments: await client.listInvestments(link.itemId) };
    }),
  );

  // CPFs dos logins (só em memória) e o nome do banco de cada link de investimentos.
  const allItemIds = [...new Set(links.map((l) => l.itemId))];
  const itemLists = await Promise.all(allItemIds.map((id) => itemAccounts(id)));
  const householdDocs = new Set(
    itemLists.flat().flatMap((a) => (a.taxNumber ? [a.taxNumber.replace(/\D/g, "")] : [])).filter(Boolean),
  );
  const institutions = new Map(
    links
      .filter((l) => l.sourceKind === "investments")
      .map((l) => {
        const bank = itemLists[allItemIds.indexOf(l.itemId)]?.find((a) => a.type === "BANK");
        return [l.id, bank ? institutionName(bank.name) : "Pluggy"];
      }),
  );

  const existing = new Map<string, ExistingExternal>(
    (externalsRes.data ?? []).map((e) => [
      e.external_id,
      {
        externalId: e.external_id,
        status: e.status as ExistingExternal["status"],
        transactionId: e.transaction_id,
        providerStatus: e.provider_status as ExistingExternal["providerStatus"],
        billId: e.bill_id,
        linkId: e.link_id,
      },
    ]),
  );

  // Lançamentos ligados (para atualizar) e "Pagar fatura" ainda sem ligação (para conciliar).
  const TX_COLUMNS = "id, source, type, amount_cents, occurred_on, account_id, transfer_account_id, invoice_ref, category_id";
  type TxRow = {
    id: string;
    source: string;
    type: ExistingTx["type"];
    amount_cents: number;
    occurred_on: string;
    account_id: string;
    transfer_account_id: string | null;
    invoice_ref: string | null;
    category_id: string | null;
  };
  const toTx = (r: TxRow): ExistingTx => ({
    id: r.id,
    source: r.source,
    type: r.type,
    amountCents: r.amount_cents,
    occurredOn: r.occurred_on,
    accountId: r.account_id,
    transferAccountId: r.transfer_account_id,
    invoiceRef: r.invoice_ref,
    categoryId: r.category_id,
  });
  const linkedIds = [...existing.values()].map((e) => e.transactionId).filter((id): id is string => Boolean(id));
  const existingTx = new Map<string, ExistingTx>();
  for (const ids of chunks(linkedIds)) {
    const { data: rows, error } = await db.from("transactions").select(TX_COLUMNS).eq("household_id", householdId).in("id", ids);
    throwIf(error);
    for (const row of rows ?? []) existingTx.set(row.id, toTx(row));
  }
  const linked = new Set(linkedIds);
  let openPayments: ExistingTx[] = [];
  if (cards.size > 0) {
    const { data: rows, error } = await db
      .from("transactions")
      .select(TX_COLUMNS)
      .eq("household_id", householdId)
      .eq("type", "transfer")
      .neq("source", "pluggy")
      .in("transfer_account_id", [...cards.keys()])
      .gte("occurred_on", PLUGGY_START_DATE);
    throwIf(error);
    openPayments = (rows ?? []).filter((r) => !linked.has(r.id)).map(toTx);
  }

  const categories: PlanCategory[] = categoryList;
  const syncLinks: SyncLink[] = links.map((l) => ({
    id: l.id,
    sourceKind: l.sourceKind,
    externalId: l.externalId,
    role: l.role,
    accountId: l.accountId,
    ownerUserId: l.ownerUserId,
  }));

  // Histórico de categorias da casa (todas as origens): o que a casa deu por último a cada comércio.
  const historyRows: HistoryEntry[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await db
      .from("transactions")
      .select("description, category_id, type, updated_at")
      .eq("household_id", householdId)
      .neq("type", "transfer")
      .not("category_id", "is", null)
      .not("description", "is", null)
      .order("id")
      .range(from, from + 999);
    throwIf(error);
    historyRows.push(
      ...(rows ?? []).map((r) => ({ description: r.description, categoryId: r.category_id, type: r.type, updatedAt: r.updated_at })),
    );
    if (!rows || rows.length < 1000) break;
  }
  const history = learnCategoryHistory(historyRows, categoryList);

  const plan = planPluggySync({
    householdId,
    startDate: PLUGGY_START_DATE,
    today,
    links: syncLinks,
    data,
    cards,
    categories,
    rules: rules.map((r) => ({ pattern: r.pattern, categoryId: r.categoryId })),
    history,
    householdDocs,
    institutions,
    existing,
    existingTx,
    openPayments,
  });

  await applyPlan(db, plan, { householdId, userId });
  return { ...plan.counts, warnings: [...new Set(plan.warnings)], investments: plan.investments.length };
}

async function applyPlan(db: Db, plan: SyncPlan, { householdId, userId }: { householdId: string; userId: string | null }) {
  const now = new Date().toISOString();

  // 1. O que sumiu da Pluggy (PENDING): o lançamento (só se veio da Pluggy) e a ligação.
  for (const ids of chunks(plan.deletes)) {
    const { error } = await db.from("transactions").delete().eq("household_id", householdId).eq("source", "pluggy").in("id", ids);
    throwIf(error);
  }
  for (const ids of chunks(plan.externalDeletes)) {
    const { error } = await db
      .from("external_transactions")
      .delete()
      .eq("household_id", householdId)
      .eq("provider", "pluggy")
      .in("external_id", ids);
    throwIf(error);
  }

  // 2. Lançamentos novos (id derivado do id da Pluggy: repetir não duplica).
  for (const rows of chunks(plan.inserts)) {
    const { error } = await db.from("transactions").upsert(
      rows.map((t) => ({ ...t, household_id: householdId, source: "pluggy" as const, created_by: userId })),
      { onConflict: "id", ignoreDuplicates: true },
    );
    throwIf(error);
  }

  // 3. Mudanças do banco (valor, data, fatura) nos lançamentos que vieram da Pluggy.
  for (const { id, ...patch } of plan.updates) {
    const { error } = await db.from("transactions").update(patch).eq("household_id", householdId).eq("source", "pluggy").eq("id", id);
    throwIf(error);
  }

  // 4. Ligações (depois dos lançamentos: transaction_id aponta para eles).
  for (const rows of chunks(plan.externals)) {
    const { error } = await db
      .from("external_transactions")
      .upsert(
        rows.map((r) => ({ ...r, household_id: householdId, provider: "pluggy" })),
        { onConflict: "household_id,provider,external_id" },
      );
    throwIf(error);
  }

  // 5. Saldos do banco (conta = soma das origens) e o último saldo de cada origem.
  for (const { accountId, cents } of plan.accountBalances) {
    const { error } = await db
      .from("accounts")
      .update({ external_balance_cents: cents, external_balance_at: now })
      .eq("household_id", householdId)
      .eq("id", accountId);
    throwIf(error);
  }
  for (const { linkId, cents } of plan.linkBalances) {
    const { error } = await db
      .from("pluggy_links")
      .update({ last_balance_cents: cents, last_synced_at: now })
      .eq("household_id", householdId)
      .eq("id", linkId);
    throwIf(error);
  }

  // 5b. Melhor dia de compra aprendido do banco (dia seguinte ao último fechamento). Só a
  // estimativa da fatura aberta usa; as faturas gravadas não mudam por isso.
  for (const { accountId, closingDay } of plan.cardClosingDays) {
    const { error } = await db
      .from("accounts")
      .update({ closing_day: closingDay })
      .eq("household_id", householdId)
      .eq("id", accountId)
      .eq("kind", "credit_card");
    throwIf(error);
  }

  // 6. Investimentos: um ativo por título (upsert por dono + external_id) e o snapshot do dia.
  if (plan.investments.length > 0) {
    const { data: saved, error } = await db
      .from("investments")
      .upsert(
        plan.investments.map((i) => ({
          household_id: householdId,
          owner_user_id: i.owner_user_id,
          source: "pluggy",
          external_id: i.external_id,
          name: i.name,
          asset_class: i.asset_class,
          institution: i.institution,
          quantity: i.quantity,
          current_value_cents: i.value_cents,
          value_as_of: i.value_as_of,
          archived_on: i.archived_on,
          updated_at: now,
        })),
        { onConflict: "household_id,owner_user_id,external_id" },
      )
      .select("id, external_id, current_value_cents, value_as_of, archived_on");
    throwIf(error);
    const snapshots = (saved ?? [])
      .filter((s) => s.value_as_of && !s.archived_on)
      .map((s) => ({ investment_id: s.id, household_id: householdId, value_cents: s.current_value_cents, taken_on: s.value_as_of! }));
    if (snapshots.length > 0) {
      const { error: snapError } = await db.from("investment_snapshots").upsert(snapshots, { onConflict: "investment_id,taken_on" });
      throwIf(snapError);
    }
  }
}
