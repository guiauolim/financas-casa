import "server-only";
import {
  type BudgetRule,
  type EvaluatedBudget,
  evaluateBudget,
  type MonthProjection,
  monthProjection,
  weeklyByDay,
} from "@/lib/finance/budget";
import type { YearMonth } from "@/lib/finance/dates";
import type { LedgerEntry } from "@/lib/finance/ledger";
import { type BudgetInput, budgetColumns } from "@/lib/validation/budgets";
import { isUniqueViolation, ServiceError, throwIf } from "./errors";
import { listLedger } from "./transactions";
import type { Actor, Db } from "./types";

export type Budget = BudgetRule & {
  category: { id: string; name: string; icon: string | null; archived: boolean } | null;
  account: { id: string; name: string; archived: boolean } | null;
};

const SELECT = `
  id, period, category_id, account_id, limit_cents,
  category:categories!budgets_category_id_fkey(id, name, icon, archived),
  account:accounts!budgets_account_id_fkey(id, name, archived)
`;

type Row = {
  id: string;
  period: BudgetRule["period"];
  category_id: string | null;
  account_id: string | null;
  limit_cents: number;
  category: Budget["category"];
  account: Budget["account"];
};

const toBudget = (row: Row): Budget => ({
  id: row.id,
  period: row.period,
  categoryId: row.category_id,
  accountId: row.account_id,
  limitCents: row.limit_cents,
  category: row.category,
  account: row.account,
});

export async function listBudgets(db: Db, { householdId }: { householdId: string }): Promise<Budget[]> {
  const { data, error } = await db
    .from("budgets")
    .select(SELECT)
    .eq("household_id", householdId)
    .order("created_at")
    .returns<Row[]>();
  throwIf(error);
  return (data ?? []).map(toBudget);
}

export async function getBudget(db: Db, { householdId, budgetId }: { householdId: string; budgetId: string }) {
  const { data, error } = await db
    .from("budgets")
    .select(SELECT)
    .eq("household_id", householdId)
    .eq("id", budgetId)
    .returns<Row[]>()
    .maybeSingle();
  throwIf(error);
  return data ? toBudget(data) : null;
}

// Categoria precisa ser de despesa e cartão precisa ser cartão, ambos da casa e ativos
// (a não ser que já fossem os do orçamento editado).
async function assertReferences(db: Db, householdId: string, input: BudgetInput, current?: Budget) {
  if (input.scope === "category") {
    const { data, error } = await db
      .from("categories")
      .select("id, type, archived")
      .eq("household_id", householdId)
      .eq("id", input.categoryId)
      .maybeSingle();
    throwIf(error);
    if (!data) throw new ServiceError("Categoria não encontrada.", "categoryId");
    if (data.type !== "expense") throw new ServiceError("Escolha uma categoria de despesa.", "categoryId");
    if (data.archived && current?.categoryId !== data.id) {
      throw new ServiceError("Esta categoria está arquivada.", "categoryId");
    }
  }
  if (input.scope === "card") {
    const { data, error } = await db
      .from("accounts")
      .select("id, kind, archived")
      .eq("household_id", householdId)
      .eq("id", input.accountId)
      .maybeSingle();
    throwIf(error);
    if (!data) throw new ServiceError("Cartão não encontrado.", "accountId");
    if (data.kind !== "credit_card") throw new ServiceError("O limite semanal é só para cartão de crédito.", "accountId");
    if (data.archived && current?.accountId !== data.id) {
      throw new ServiceError("Este cartão está arquivado.", "accountId");
    }
  }
}

const DUPLICATE: Record<BudgetInput["scope"], [string, string?]> = {
  total: ["Já existe um orçamento mensal da casa. Edite o existente.", "scope"],
  category: ["Já existe um orçamento para esta categoria.", "categoryId"],
  card: ["Já existe um limite semanal para este cartão.", "accountId"],
};

export async function createBudget(db: Db, actor: Actor, input: BudgetInput): Promise<string> {
  await assertReferences(db, actor.householdId, input);
  const { data, error } = await db
    .from("budgets")
    .insert({ ...budgetColumns(input), household_id: actor.householdId })
    .select("id")
    .single();
  if (isUniqueViolation(error)) throw new ServiceError(...DUPLICATE[input.scope]);
  throwIf(error);
  return data!.id;
}

export async function updateBudget(db: Db, actor: Actor, budgetId: string, input: BudgetInput): Promise<void> {
  const current = await getBudget(db, { householdId: actor.householdId, budgetId });
  if (!current) throw new ServiceError("Orçamento não encontrado.");
  await assertReferences(db, actor.householdId, input, current);
  const { error } = await db
    .from("budgets")
    .update(budgetColumns(input))
    .eq("household_id", actor.householdId)
    .eq("id", budgetId);
  if (isUniqueViolation(error)) throw new ServiceError(...DUPLICATE[input.scope]);
  throwIf(error);
}

export async function deleteBudget(db: Db, actor: Actor, budgetId: string): Promise<void> {
  const { data, error } = await db
    .from("budgets")
    .delete()
    .eq("household_id", actor.householdId)
    .eq("id", budgetId)
    .select("id");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Orçamento não encontrado.");
}

// ───────────────────────── Situação dos orçamentos ─────────────────────────

export type BudgetWithStatus = Budget & EvaluatedBudget;

export type BudgetStatusReport = {
  month: YearMonth;
  today: string;
  // Projeção do gasto total da casa no mês (existe mesmo sem orçamento mensal).
  projection: MonthProjection;
  total: BudgetWithStatus | null;
  categories: BudgetWithStatus[]; // mais usado (%) primeiro
  cards: (BudgetWithStatus & { days: { date: string; spentCents: number }[] })[];
};

// Monta a situação a partir de dados já carregados (a Visão geral reaproveita o ledger).
export function buildBudgetStatus(
  budgets: readonly Budget[],
  ledger: readonly LedgerEntry[],
  { month, today }: { month: YearMonth; today: string },
): BudgetStatusReport {
  const evaluated = budgets.map((b) => ({ ...b, ...evaluateBudget(b, ledger, { month, today }) }));
  return {
    month,
    today,
    projection: monthProjection(ledger, { month, today }),
    total: evaluated.find((b) => b.scope === "total") ?? null,
    categories: evaluated
      .filter((b) => b.scope === "category")
      .sort((a, b) => b.spentCents * a.limitCents - a.spentCents * b.limitCents || b.spentCents - a.spentCents),
    cards: evaluated
      .filter((b) => b.scope === "card")
      .map((b) => ({ ...b, days: weeklyByDay(ledger, today, b.accountId) }))
      .sort((a, b) => b.percent - a.percent),
  };
}

// Usado pela tela de Orçamentos e (Fase 7) pela tool get_budget_status do bot.
export async function getBudgetStatus(
  db: Db,
  { householdId, month, today }: { householdId: string; month: YearMonth; today: string },
): Promise<BudgetStatusReport> {
  const [budgets, ledger] = await Promise.all([listBudgets(db, { householdId }), listLedger(db, { householdId })]);
  return buildBudgetStatus(budgets, ledger, { month, today });
}
