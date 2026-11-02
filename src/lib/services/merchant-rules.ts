import "server-only";
import { normalizeMerchant } from "@/lib/finance/categorize";
import type { MerchantRuleInput } from "@/lib/validation/merchant-rules";
import { isUniqueViolation, ServiceError, throwIf } from "./errors";
import type { Actor, Db } from "./types";

// Regras de categoria aprendidas ("lembrar para próximas" na importação; futuramente o
// bot). pattern = trecho normalizado do comércio (lib/finance/categorize.ts).
export type MerchantRuleRow = {
  id: string;
  pattern: string;
  categoryId: string;
  category: { id: string; name: string; icon: string | null; archived: boolean } | null;
  updatedAt: string;
};

export async function listMerchantRules(db: Db, { householdId }: { householdId: string }): Promise<MerchantRuleRow[]> {
  const { data, error } = await db
    .from("merchant_rules")
    .select("id, pattern, category_id, updated_at, category:categories!merchant_rules_category_id_fkey(id, name, icon, archived)")
    .eq("household_id", householdId)
    .order("pattern");
  throwIf(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    pattern: row.pattern,
    categoryId: row.category_id,
    category: row.category,
    updatedAt: row.updated_at,
  }));
}

export async function getMerchantRule(db: Db, { householdId, ruleId }: { householdId: string; ruleId: string }) {
  const rules = await listMerchantRules(db, { householdId });
  return rules.find((r) => r.id === ruleId) ?? null;
}

async function assertCategory(db: Db, householdId: string, categoryId: string) {
  const { data, error } = await db
    .from("categories")
    .select("id, type, archived")
    .eq("household_id", householdId)
    .eq("id", categoryId)
    .maybeSingle();
  throwIf(error);
  if (!data || data.type === "transfer") throw new ServiceError("Categoria não encontrada.", "categoryId");
  if (data.archived) throw new ServiceError("Esta categoria está arquivada.", "categoryId");
}

export async function updateMerchantRule(db: Db, actor: Actor, ruleId: string, input: MerchantRuleInput): Promise<void> {
  await assertCategory(db, actor.householdId, input.categoryId);
  const pattern = normalizeMerchant(input.pattern) || input.pattern;
  if (pattern.length < 2) throw new ServiceError("Use pelo menos 2 letras.", "pattern");
  const { data, error } = await db
    .from("merchant_rules")
    .update({ pattern, category_id: input.categoryId })
    .eq("household_id", actor.householdId)
    .eq("id", ruleId)
    .select("id");
  if (isUniqueViolation(error)) throw new ServiceError("Já existe uma regra com esse trecho.", "pattern");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Regra não encontrada.");
}

export async function deleteMerchantRule(db: Db, actor: Actor, ruleId: string): Promise<void> {
  const { data, error } = await db
    .from("merchant_rules")
    .delete()
    .eq("household_id", actor.householdId)
    .eq("id", ruleId)
    .select("id");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Regra não encontrada.");
}
