import { describe, expect, it } from "vitest";
import { expensesByCategory, monthlySeries, summarize } from "./summary";

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

describe("monthlySeries e expensesByCategory", () => {
  const e = (type: "expense" | "income" | "transfer", occurredOn: string, amountCents: number, categoryId: string | null = null) => ({
    type,
    occurredOn,
    amountCents,
    categoryId,
    accountId: "a",
    transferAccountId: type === "transfer" ? "b" : null,
  });
  const entries = [
    e("income", "2026-11-05", 850000),
    e("expense", "2026-11-06", 5000, "mercado"),
    e("expense", "2026-11-07", 7000, "lazer"),
    e("expense", "2026-11-08", 3000, "mercado"),
    e("transfer", "2026-11-10", 50000),
    e("expense", "2026-06-30", 1000),
    e("expense", "2026-05-31", 999), // fora da janela de 6 meses
  ];

  it("6 meses terminando no mês escolhido, mais antigo primeiro, sem transferências", () => {
    const series = monthlySeries(entries, { year: 2026, month: 11 });
    expect(series.map((m) => m.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(series[0]).toEqual({ month: "2026-06", incomeCents: 0, expenseCents: 1000 });
    expect(series[5]).toEqual({ month: "2026-11", incomeCents: 850000, expenseCents: 15000 });
  });

  it("série cruza a virada do ano", () => {
    expect(monthlySeries([], { year: 2027, month: 2 }, 3).map((m) => m.month)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });

  it("despesas por categoria, maior primeiro", () => {
    expect(expensesByCategory(entries, { year: 2026, month: 11 })).toEqual([
      { categoryId: "mercado", spentCents: 8000 },
      { categoryId: "lazer", spentCents: 7000 },
    ]);
  });
});
