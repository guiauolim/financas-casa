import "server-only";
import type { CategoryInput, TxType } from "@/lib/validation/categories";
import { isUniqueViolation, ServiceError, throwIf } from "./errors";
import type { Actor, Db } from "./types";

export type Category = {
  id: string;
  name: string;
  type: TxType;
  icon: string | null;
  aliases: string[];
  archived: boolean;
  householdDefault: boolean; // gasto vai para Casa por padrão
};

const COLUMNS = "id, name, type, icon, aliases, archived, household_default";

type Row = {
  id: string;
  name: string;
  type: TxType;
  icon: string | null;
  aliases: string[];
  archived: boolean;
  household_default: boolean;
};

const toCategory = ({ household_default, ...row }: Row): Category => ({ ...row, householdDefault: household_default });

const toRow = ({ householdDefault, ...input }: CategoryInput) => ({ ...input, household_default: householdDefault });

export async function listCategories(
  db: Db,
  { householdId, includeArchived = false }: { householdId: string; includeArchived?: boolean },
): Promise<Category[]> {
  let query = db.from("categories").select(COLUMNS).eq("household_id", householdId);
  if (!includeArchived) query = query.eq("archived", false);
  const { data, error } = await query.order("name");
  throwIf(error);
  return (data ?? []).map(toCategory).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function getCategory(db: Db, { householdId, categoryId }: { householdId: string; categoryId: string }) {
  const { data, error } = await db
    .from("categories")
    .select(COLUMNS)
    .eq("household_id", householdId)
    .eq("id", categoryId)
    .maybeSingle();
  throwIf(error);
  return data ? toCategory(data) : null;
}

const DUPLICATE = "Já existe uma categoria com esse nome.";

export async function createCategory(db: Db, actor: Actor, input: CategoryInput): Promise<string> {
  const { data, error } = await db
    .from("categories")
    .insert({ household_id: actor.householdId, ...toRow(input) })
    .select("id")
    .single();
  if (isUniqueViolation(error)) throw new ServiceError(DUPLICATE, "name");
  throwIf(error);
  return data!.id;
}

export async function updateCategory(db: Db, actor: Actor, categoryId: string, input: CategoryInput): Promise<void> {
  const { data, error } = await db
    .from("categories")
    .update(toRow(input))
    .eq("household_id", actor.householdId)
    .eq("id", categoryId)
    .select("id");
  if (isUniqueViolation(error)) throw new ServiceError(DUPLICATE, "name");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Categoria não encontrada.");
}

export async function setCategoryArchived(db: Db, actor: Actor, categoryId: string, archived: boolean): Promise<void> {
  const { data, error } = await db
    .from("categories")
    .update({ archived })
    .eq("household_id", actor.householdId)
    .eq("id", categoryId)
    .select("id");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Categoria não encontrada.");
}
