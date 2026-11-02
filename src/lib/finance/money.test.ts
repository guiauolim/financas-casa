import { describe, expect, it } from "vitest";
import { formatAmountInput, formatBRL, parseBRL } from "./money";

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

describe("parseBRL", () => {
  it.each([
    ["52,30", 5230],
    ["52", 5200],
    ["0,5", 50],
    ["0,05", 5],
    ["1.234,56", 123456],
    ["1.234.567,89", 123456789],
    ["1234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["r$52,3", 5230],
    ["  18  ", 1800],
    ["0", 0],
  ])("%s -> %s centavos", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(["", "abc", "1,234", "1.23", "12.34,5", "52,301", "-52,30", "52.", ",50", "1.2345,00", "52,3a"])(
    "rejeita %j",
    (input) => {
      expect(parseBRL(input)).toBeNull();
    },
  );
});

describe("formatAmountInput", () => {
  it("formata sem o símbolo", () => {
    expect(formatAmountInput(123456).replace(/\s/g, " ")).toBe("1.234,56");
    expect(formatAmountInput(5)).toBe("0,05");
  });
});
