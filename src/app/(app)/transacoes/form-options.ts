import "server-only";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import type { Db } from "@/lib/services/types";
import type { FormAccount, FormCategory } from "./transaction-form";

// Contas e categorias ativas; as arquivadas só entram se já forem as do lançamento editado.
export async function loadFormOptions(
  db: Db,
  householdId: string,
  keep: { accountIds?: (string | null | undefined)[]; categoryId?: string | null } = {},
): Promise<{ accounts: FormAccount[]; categories: FormCategory[] }> {
  const [accounts, categories] = await Promise.all([
    listAccounts(db, { householdId, includeArchived: true }),
    listCategories(db, { householdId, includeArchived: true }),
  ]);
  const keepAccounts = new Set(keep.accountIds?.filter(Boolean));
  return {
    accounts: accounts
      .filter((a) => !a.archived || keepAccounts.has(a.id))
      .map(({ id, name, kind, closingDay, dueDay }) => ({ id, name, kind, closingDay, dueDay })),
    categories: categories
      .filter((c) => !c.archived || c.id === keep.categoryId)
      .map(({ id, name, type }) => ({ id, name, type })),
  };
}
