import { describe, expect, it } from "vitest";
import { formatBRL } from "./money";

// Intl usa espaço não separável entre "R$" e o número.
const normalize = (s: string) => s.replace(/\s/g, " ");

describe("formatBRL", () => {
  it.each([
    [0, "R$ 0,00"],
    [5, "R$ 0,05"],
    [5230, "R$ 52,30"],
    [123456789, "R$ 1.234.567,89"],
    [-5230, "-R$ 52,30"],
    [9007199254740993n, "R$ 90.071.992.547.409,93"],
  ])("%s centavos -> %s", (cents, expected) => {
    expect(normalize(formatBRL(cents))).toBe(expected);
  });

  it("rejeita valores fracionários (centavos são inteiros)", () => {
    expect(() => formatBRL(10.5)).toThrow();
  });
});
