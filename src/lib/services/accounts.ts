import "server-only";
import type { CardCycle, InvoiceNaming } from "@/lib/finance/billing";
import type { AccountInput, AccountKind } from "@/lib/validation/accounts";
import { ServiceError, throwIf } from "./errors";
import type { Actor, Db } from "./types";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  ownerUserId: string | null;
  closingDay: number | null;
  dueDay: number | null;
  invoiceNaming: InvoiceNaming; // nome da fatura: mês do fechamento ou do vencimento
  creditLimitCents: number | null;
  openingBalanceCents: number;
  openingBalanceDate: string | null;
  aliases: string[];
  archived: boolean;
};

const COLUMNS =
  "id, name, kind, owner_user_id, closing_day, due_day, invoice_naming, credit_limit_cents, opening_balance_cents, opening_balance_date, aliases, archived";

type Row = {
  id: string;
  name: string;
  kind: AccountKind;
  owner_user_id: string | null;
  closing_day: number | null;
  due_day: number | null;
  invoice_naming: string;
  credit_limit_cents: number | null;
  opening_balance_cents: number;
  opening_balance_date: string | null;
  aliases: string[];
  archived: boolean;
};

const toAccount = (row: Row): Account => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  ownerUserId: row.owner_user_id,
  closingDay: row.closing_day,
  dueDay: row.due_day,
  invoiceNaming: row.invoice_naming === "due" ? "due" : "closing",
  creditLimitCents: row.credit_limit_cents,
  openingBalanceCents: row.opening_balance_cents,
  openingBalanceDate: row.opening_balance_date,
  aliases: row.aliases,
  archived: row.archived,
});

const KIND_ORDER: AccountKind[] = ["checking", "credit_card", "savings", "meal_voucher", "cash"];

export async function listAccounts(
  db: Db,
  { householdId, includeArchived = false }: { householdId: string; includeArchived?: boolean },
): Promise<Account[]> {
  let query = db.from("accounts").select(COLUMNS).eq("household_id", householdId);
  if (!includeArchived) query = query.eq("archived", false);
  const { data, error } = await query.order("name");
  throwIf(error);
  return (data ?? [])
    .map(toAccount)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name, "pt-BR"));
}

// Cartão com ciclo cadastrado (melhor dia de compra e vencimento): só esses têm fatura.
export type CycleCard = Account & CardCycle;

export const isCycleCard = (account: Account): account is CycleCard =>
  account.kind === "credit_card" && account.closingDay !== null && account.dueDay !== null;

export async function getAccount(db: Db, { householdId, accountId }: { householdId: string; accountId: string }) {
  const { data, error } = await db
    .from("accounts")
    .select(COLUMNS)
    .eq("household_id", householdId)
    .eq("id", accountId)
    .maybeSingle();
  throwIf(error);
  return data ? toAccount(data) : null;
}

async function assertOwnerInHousehold(db: Db, householdId: string, ownerUserId: string | null) {
  if (!ownerUserId) return;
  const { data, error } = await db
    .from("profiles")
    .select("user_id")
    .eq("household_id", householdId)
    .eq("user_id", ownerUserId)
    .maybeSingle();
  throwIf(error);
  if (!data) throw new ServiceError("Escolha um membro da casa como dono.", "ownerUserId");
}

function toRow(input: AccountInput) {
  const card = input.kind === "credit_card";
  return {
    name: input.name,
    kind: input.kind,
    owner_user_id: input.ownerUserId,
    aliases: input.aliases,
    closing_day: card ? input.closingDay : null,
    due_day: card ? input.dueDay : null,
    ...(card ? { invoice_naming: input.invoiceNaming } : {}),
    credit_limit_cents: card ? (input.creditLimitCents ?? null) : null,
    opening_balance_cents: card ? 0 : input.openingBalanceCents,
    opening_balance_date: card ? null : (input.openingBalanceDate ?? null),
  };
}

export async function createAccount(db: Db, actor: Actor, input: AccountInput): Promise<string> {
  await assertOwnerInHousehold(db, actor.householdId, input.ownerUserId);
  const { data, error } = await db
    .from("accounts")
    .insert({ ...toRow(input), household_id: actor.householdId })
    .select("id")
    .single();
  throwIf(error);
  return data!.id;
}

export async function updateAccount(db: Db, actor: Actor, accountId: string, input: AccountInput): Promise<void> {
  const current = await getAccount(db, { householdId: actor.householdId, accountId });
  if (!current) throw new ServiceError("Conta não encontrada.");
  // Trocar cartão <-> conta mudaria o sentido das transações já lançadas.
  if ((current.kind === "credit_card") !== (input.kind === "credit_card")) {
    throw new ServiceError("Não dá para transformar cartão em conta (ou o contrário). Crie uma nova.", "kind");
  }
  await assertOwnerInHousehold(db, actor.householdId, input.ownerUserId);
  const { error } = await db
    .from("accounts")
    .update(toRow(input))
    .eq("household_id", actor.householdId)
    .eq("id", accountId);
  throwIf(error);
}

export async function setAccountArchived(db: Db, actor: Actor, accountId: string, archived: boolean): Promise<void> {
  const { data, error } = await db
    .from("accounts")
    .update({ archived })
    .eq("household_id", actor.householdId)
    .eq("id", accountId)
    .select("id");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Conta não encontrada.");
}
