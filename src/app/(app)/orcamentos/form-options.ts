import "server-only";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import type { Db } from "@/lib/services/types";

// Categorias de despesa e cartões ativos; mantém os já escolhidos mesmo se arquivados.
export async function budgetFormOptions(
  db: Db,
  householdId: string,
  keep: { categoryId?: string | null; accountId?: string | null } = {},
) {
  const [categories, accounts] = await Promise.all([
    listCategories(db, { householdId, includeArchived: true }),
    listAccounts(db, { householdId, includeArchived: true }),
  ]);
  return {
    categories: categories
      .filter((c) => c.type === "expense" && (!c.archived || c.id === keep.categoryId))
      .map((c) => ({ id: c.id, name: c.archived ? `${c.name} (arquivada)` : c.name })),
    cards: accounts
      .filter((a) => a.kind === "credit_card" && (!a.archived || a.id === keep.accountId))
      .map((a) => ({ id: a.id, name: a.archived ? `${a.name} (arquivado)` : a.name })),
  };
}
