import { describe, expect, it } from "vitest";
import { summarize } from "./summary";

describe("summarize", () => {
  it("soma entradas e saídas e ignora transferências", () => {
    expect(
      summarize([
        { type: "income", amountCents: 850000 },
        { type: "expense", amountCents: 5230 },
        { type: "expense", amountCents: 1800 },
        { type: "transfer", amountCents: 300000 },
      ]),
    ).toEqual({ incomeCents: 850000, expenseCents: 7030, balanceCents: 842970, count: 4 });
  });

  it("lista vazia", () => {
    expect(summarize([])).toEqual({ incomeCents: 0, expenseCents: 0, balanceCents: 0, count: 0 });
  });
});
