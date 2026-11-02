import { describe, expect, it } from "vitest";
import { installmentDates, planInstallments, splitInstallments } from "./installments";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("splitInstallments", () => {
  it("divide sem perder centavos, resto na 1ª parcela", () => {
    expect(splitInstallments(100, 3)).toEqual([34, 33, 33]);
    expect(splitInstallments(1000001, 10)).toEqual([100001, ...Array(9).fill(100000)]);
    expect(splitInstallments(300000, 10)).toEqual(Array(10).fill(30000));
    expect(splitInstallments(5230, 1)).toEqual([5230]);
    expect(splitInstallments(3, 2)).toEqual([2, 1]);
  });

  it("a soma sempre bate com o total", () => {
    for (const total of [1, 7, 99, 100, 101, 123457, 999999]) {
      for (let n = 1; n <= 48; n++) {
        if (total < n) continue;
        const parts = splitInstallments(total, n);
        expect(parts).toHaveLength(n);
        expect(sum(parts)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThan(n);
      }
    }
  });

  it("rejeita entradas inválidas", () => {
    expect(() => splitInstallments(0, 2)).toThrow();
    expect(() => splitInstallments(10.5, 2)).toThrow();
    expect(() => splitInstallments(100, 0)).toThrow();
    expect(() => splitInstallments(100, 49)).toThrow();
    expect(() => splitInstallments(1, 2)).toThrow();
  });
});

describe("installmentDates", () => {
  it("repete o dia nos meses seguintes, limitado ao fim do mês", () => {
    expect(installmentDates("2026-01-31", 4)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(installmentDates("2026-11-15", 3)).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
  });
});

describe("planInstallments", () => {
  it("monta número, total, valor e data", () => {
    expect(planInstallments(100, 3, "2026-11-30")).toEqual([
      { number: 1, total: 3, amountCents: 34, occurredOn: "2026-11-30" },
      { number: 2, total: 3, amountCents: 33, occurredOn: "2026-12-30" },
      { number: 3, total: 3, amountCents: 33, occurredOn: "2027-01-30" },
    ]);
  });
});
