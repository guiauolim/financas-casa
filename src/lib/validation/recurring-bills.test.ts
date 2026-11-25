import { describe, expect, it } from "vitest";
import { recurringBillSchema } from "./recurring-bills";

const ID = "3f1c2b8e-6a4d-4b7e-9c1a-2d3e4f5a6b7c";
const base = { name: "Aluguel", categoryId: ID, accountId: ID, amountCents: "1.500,00", dueDay: "5", spentBy: "casa" };

describe("recurringBillSchema", () => {
  it("valor em centavos, dia e Casa = null", () => {
    expect(recurringBillSchema.parse(base)).toEqual({
      name: "Aluguel",
      categoryId: ID,
      accountId: ID,
      amountCents: 150_000,
      dueDay: 5,
      spentBy: null,
    });
  });

  it("pessoa da casa pelo id", () => {
    expect(recurringBillSchema.parse({ ...base, spentBy: ID }).spentBy).toBe(ID);
  });

  it("dia de 1 a 31 e valor positivo", () => {
    expect(recurringBillSchema.safeParse({ ...base, dueDay: "0" }).success).toBe(false);
    expect(recurringBillSchema.safeParse({ ...base, dueDay: "32" }).success).toBe(false);
    expect(recurringBillSchema.safeParse({ ...base, dueDay: "" }).success).toBe(false);
    expect(recurringBillSchema.safeParse({ ...base, amountCents: "0" }).success).toBe(false);
  });
});
