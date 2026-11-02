import { describe, expect, it } from "vitest";
import { budgetColumns, budgetSchema } from "./budgets";

const ID = "3f1c2b8e-6a4d-4b7e-9c1a-2d3e4f5a6b7c";

describe("budgetSchema", () => {
  it("mensal da casa: só o limite", () => {
    const parsed = budgetSchema.parse({ scope: "total", limitCents: "3.500,00", categoryId: ID });
    expect(parsed).toEqual({ scope: "total", limitCents: 350000 });
    expect(budgetColumns(parsed)).toEqual({ period: "monthly", category_id: null, account_id: null, limit_cents: 350000 });
  });

  it("por categoria exige a categoria", () => {
    expect(budgetSchema.safeParse({ scope: "category", limitCents: "100" }).success).toBe(false);
    const parsed = budgetSchema.parse({ scope: "category", categoryId: ID, limitCents: "800" });
    expect(budgetColumns(parsed)).toEqual({ period: "monthly", category_id: ID, account_id: null, limit_cents: 80000 });
  });

  it("semanal exige o cartão e vira period weekly", () => {
    expect(budgetSchema.safeParse({ scope: "card", limitCents: "100" }).success).toBe(false);
    const parsed = budgetSchema.parse({ scope: "card", accountId: ID, limitCents: "500,50" });
    expect(budgetColumns(parsed)).toEqual({ period: "weekly", category_id: null, account_id: ID, limit_cents: 50050 });
  });

  it("limite precisa ser positivo e no formato BR", () => {
    expect(budgetSchema.safeParse({ scope: "total", limitCents: "0" }).success).toBe(false);
    expect(budgetSchema.safeParse({ scope: "total", limitCents: "12.34" }).success).toBe(false);
    expect(budgetSchema.safeParse({ scope: "outro", limitCents: "10" }).success).toBe(false);
  });
});
