import { describe, expect, it } from "vitest";
import { b3FileSchema, investmentCreateSchema, quantity } from "./investments";

describe("quantidade no formato BR", () => {
  it("converte para decimal em texto", () => {
    expect(quantity.parse("10")).toBe("10");
    expect(quantity.parse("0,25")).toBe("0.25");
    expect(quantity.parse("1.000,12345678")).toBe("1000.12345678");
    expect(quantity.parse("  ")).toBeUndefined();
    expect(quantity.parse(undefined)).toBeUndefined();
  });
  it("rejeita formato inválido ou mais de 8 casas", () => {
    expect(quantity.safeParse("1,123456789").success).toBe(false);
    expect(quantity.safeParse("abc").success).toBe(false);
    expect(quantity.safeParse("1.5").success).toBe(false);
  });
});

describe("investmentCreateSchema", () => {
  const base = {
    name: " Bitcoin ",
    assetClass: "crypto",
    ownerUserId: "joint",
    ticker: " btc ",
    valueCents: "1.234,56",
    valueDate: "2026-11-02",
    aliases: "btc, Cripto",
  };
  it("normaliza os campos", () => {
    expect(investmentCreateSchema.parse(base)).toMatchObject({
      name: "Bitcoin",
      ownerUserId: null,
      ticker: "BTC",
      valueCents: 123456,
      aliases: ["btc", "cripto"],
    });
    const parsed = investmentCreateSchema.parse(base);
    expect(parsed.quantity).toBeUndefined();
    expect(parsed.avgPriceCents).toBeUndefined();
  });
  it("aceita valor zero e exige classe válida", () => {
    expect(investmentCreateSchema.parse({ ...base, valueCents: "0" }).valueCents).toBe(0);
    expect(investmentCreateSchema.safeParse({ ...base, assetClass: "imovel" }).success).toBe(false);
  });
});

describe("b3FileSchema", () => {
  const file = (name: string, size: number) => new File([new Uint8Array(size)], name);
  it("aceita .xlsx/.xls até 4 MB", () => {
    expect(b3FileSchema.safeParse(file("posicao.xlsx", 10)).success).toBe(true);
    expect(b3FileSchema.safeParse(file("POSICAO.XLS", 10)).success).toBe(true);
  });
  it("rejeita outros tipos, vazio e acima de 4 MB", () => {
    expect(b3FileSchema.safeParse(file("posicao.csv", 10)).success).toBe(false);
    expect(b3FileSchema.safeParse(file("posicao.xlsx", 0)).success).toBe(false);
    expect(b3FileSchema.safeParse(file("posicao.xlsx", 4 * 1024 * 1024 + 1)).success).toBe(false);
    expect(b3FileSchema.safeParse("x").success).toBe(false);
  });
});
