import { z } from "zod";
import type { BudgetPeriod, BudgetScope } from "@/lib/finance/budget";
import { amountCents, uuid } from "./form";

export const BUDGET_SCOPES = ["total", "category", "invoice", "card"] as const satisfies readonly BudgetScope[];

// O que dá para criar hoje. "total" (mensal da casa) e "card" (semanal fixo) seguem válidos para os
// orçamentos que já existem, mas o cartão é um só para a casa: o limite da fatura cobre os dois.
export const NEW_BUDGET_SCOPES = ["invoice", "category"] as const satisfies readonly BudgetScope[];

export const BUDGET_SCOPE_LABELS: Record<BudgetScope, string> = {
  total: "Mensal da casa",
  category: "Mensal por categoria",
  invoice: "Limite da fatura",
  card: "Semanal fixo do cartão",
};

const limit = { limitCents: amountCents({ label: "o limite" }) };

export const budgetSchema = z.discriminatedUnion(
  "scope",
  [
    z.object({ scope: z.literal("total"), ...limit }),
    z.object({ scope: z.literal("category"), categoryId: z.uuid({ error: "Escolha a categoria." }), ...limit }),
    z.object({ scope: z.literal("invoice"), accountId: z.uuid({ error: "Escolha o cartão." }), ...limit }),
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
    account_id: input.scope === "card" || input.scope === "invoice" ? input.accountId : null,
    limit_cents: input.limitCents,
  };
}

export const budgetIdSchema = z.object({ id: uuid });
