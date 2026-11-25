import "server-only";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import { listMembers } from "@/lib/services/households";
import type { Db } from "@/lib/services/types";
import { ACCOUNT_KIND_LABELS } from "@/lib/validation/accounts";

// Categorias de despesa, contas/cartões ativos e membros; mantém os já escolhidos mesmo se arquivados.
export async function recurringBillFormOptions(
  db: Db,
  householdId: string,
  keep: { categoryId?: string | null; accountId?: string | null } = {},
) {
  const [categories, accounts, members] = await Promise.all([
    listCategories(db, { householdId, includeArchived: true }),
    listAccounts(db, { householdId, includeArchived: true }),
    listMembers(db, { householdId }),
  ]);
  return {
    categories: categories
      .filter((c) => c.type === "expense" && (!c.archived || c.id === keep.categoryId))
      .map((c) => ({ id: c.id, name: c.name, householdDefault: c.householdDefault })),
    accounts: accounts
      .filter((a) => !a.archived || a.id === keep.accountId)
      .map((a) => ({ id: a.id, name: `${a.name} · ${ACCOUNT_KIND_LABELS[a.kind]}` })),
    members: members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
  };
}
