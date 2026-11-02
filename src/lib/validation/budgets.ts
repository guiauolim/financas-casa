import { z } from "zod";
import type { BudgetPeriod, BudgetScope } from "@/lib/finance/budget";
import { amountCents, uuid } from "./form";

export const BUDGET_SCOPES = ["total", "category", "card"] as const satisfies readonly BudgetScope[];

export const BUDGET_SCOPE_LABELS: Record<BudgetScope, string> = {
  total: "Mensal da casa",
  category: "Mensal por categoria",
  card: "Semanal do cartão",
};

const limit = { limitCents: amountCents({ label: "o limite" }) };

export const budgetSchema = z.discriminatedUnion(
  "scope",
  [
    z.object({ scope: z.literal("total"), ...limit }),
    z.object({ scope: z.literal("category"), categoryId: z.uuid({ error: "Escolha a categoria." }), ...limit }),
    z.object({ scope: z.literal("card"), accountId: z.uuid({ error: "Escolha o cartão." }), ...limit }),
  ],
  { error: "Escolha o tipo de orçamento." },
);

export type BudgetInput = z.infer<typeof budgetSchema>;
export const BUDGET_FORM_FIELDS = ["scope", "categoryId", "accountId", "limitCents"] as const;

// Colunas da tabela `budgets` para cada escopo.
export function budgetColumns(input: BudgetInput): {
  period: BudgetPeriod;
  category_id: string | null;
  account_id: string | null;
  limit_cents: number;
} {
  return {
    period: input.scope === "card" ? "weekly" : "monthly",
    category_id: input.scope === "category" ? input.categoryId : null,
    account_id: input.scope === "card" ? input.accountId : null,
    limit_cents: input.limitCents,
  };
}

export const budgetIdSchema = z.object({ id: uuid });
