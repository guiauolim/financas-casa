import "server-only";
import type { RecurringBill } from "@/lib/finance/recurring";
import type { RecurringBillInput } from "@/lib/validation/recurring-bills";
import { ServiceError, throwIf } from "./errors";
import type { Actor, Db } from "./types";

// Contas fixas (aluguel, luz, internet, assinaturas). A situação do mês (paga/prevista/atrasada)
// é regra pura em lib/finance/recurring e roda sobre o ledger (lançamentos com recurring_bill_id).

export type RecurringBillRow = RecurringBill & {
  category: { id: string; name: string; icon: string | null } | null;
  account: { id: string; name: string; kind: string } | null;
};

const SELECT = `
  id, name, category_id, account_id, amount_cents, due_day, spent_by, active,
  category:categories!recurring_bills_category_id_fkey(id, name, icon),
  account:accounts!recurring_bills_account_id_fkey(id, name, kind)
`;

type Row = {
  id: string;
  name: string;
  category_id: string;
  account_id: string;
  amount_cents: number;
  due_day: number;
  spent_by: string | null;
  active: boolean;
  category: RecurringBillRow["category"];
  account: RecurringBillRow["account"];
};

const toBill = (row: Row): RecurringBillRow => ({
  id: row.id,
  name: row.name,
  categoryId: row.category_id,
  accountId: row.account_id,
  amountCents: row.amount_cents,
  dueDay: row.due_day,
  spentBy: row.spent_by,
  active: row.active,
  category: row.category,
  account: row.account,
});

export async function listRecurringBills(db: Db, { householdId }: { householdId: string }): Promise<RecurringBillRow[]> {
  const { data, error } = await db
    .from("recurring_bills")
    .select(SELECT)
    .eq("household_id", householdId)
    .order("due_day")
    .order("name")
    .returns<Row[]>();
  throwIf(error);
  return (data ?? []).map(toBill);
}

export async function getRecurringBill(db: Db, { householdId, billId }: { householdId: string; billId: string }) {
  const { data, error } = await db
    .from("recurring_bills")
    .select(SELECT)
    .eq("household_id", householdId)
    .eq("id", billId)
    .returns<Row[]>()
    .maybeSingle();
  throwIf(error);
  return data ? toBill(data) : null;
}

// Categoria de despesa, conta e pessoa da casa (ativas, a não ser que já fossem as da conta fixa).
async function assertReferences(db: Db, householdId: string, input: RecurringBillInput, current?: RecurringBillRow) {
  const [category, account, member] = await Promise.all([
    db.from("categories").select("id, type, archived").eq("household_id", householdId).eq("id", input.categoryId).maybeSingle(),
    db.from("accounts").select("id, archived").eq("household_id", householdId).eq("id", input.accountId).maybeSingle(),
    input.spentBy
      ? db.from("profiles").select("user_id").eq("household_id", householdId).eq("user_id", input.spentBy).maybeSingle()
      : Promise.resolve({ data: { user_id: null }, error: null }),
  ]);
  throwIf(category.error);
  throwIf(account.error);
  throwIf(member.error);
  if (!category.data || category.data.type !== "expense") throw new ServiceError("Escolha uma categoria de despesa.", "categoryId");
  if (category.data.archived && current?.categoryId !== category.data.id) {
    throw new ServiceError("Esta categoria está arquivada.", "categoryId");
  }
  if (!account.data) throw new ServiceError("Conta não encontrada.", "accountId");
  if (account.data.archived && current?.accountId !== account.data.id) {
    throw new ServiceError("Esta conta está arquivada.", "accountId");
  }
  if (!member.data) throw new ServiceError("Escolha um membro da casa.", "spentBy");
}

const columns = (input: RecurringBillInput) => ({
  name: input.name,
  category_id: input.categoryId,
  account_id: input.accountId,
  amount_cents: input.amountCents,
  due_day: input.dueDay,
  spent_by: input.spentBy,
});

export async function createRecurringBill(db: Db, actor: Actor, input: RecurringBillInput): Promise<string> {
  await assertReferences(db, actor.householdId, input);
  const { data, error } = await db
    .from("recurring_bills")
    .insert({ ...columns(input), household_id: actor.householdId })
    .select("id")
    .single();
  throwIf(error);
  return data!.id;
}

export async function updateRecurringBill(db: Db, actor: Actor, billId: string, input: RecurringBillInput): Promise<void> {
  const current = await getRecurringBill(db, { householdId: actor.householdId, billId });
  if (!current) throw new ServiceError("Conta fixa não encontrada.");
  await assertReferences(db, actor.householdId, input, current);
  const { error } = await db
    .from("recurring_bills")
    .update(columns(input))
    .eq("household_id", actor.householdId)
    .eq("id", billId);
  throwIf(error);
}

// Pausar tira a conta fixa do previsto dos próximos meses; os lançamentos já ligados ficam.
export async function setRecurringBillActive(db: Db, actor: Actor, billId: string, active: boolean): Promise<void> {
  const { data, error } = await db
    .from("recurring_bills")
    .update({ active })
    .eq("household_id", actor.householdId)
    .eq("id", billId)
    .select("id");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Conta fixa não encontrada.");
}

// Excluir só desliga os lançamentos (recurring_bill_id vira null): nenhum lançamento é apagado.
export async function deleteRecurringBill(db: Db, actor: Actor, billId: string): Promise<void> {
  const { data, error } = await db
    .from("recurring_bills")
    .delete()
    .eq("household_id", actor.householdId)
    .eq("id", billId)
    .select("id");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Conta fixa não encontrada.");
}
