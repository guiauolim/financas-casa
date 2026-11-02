import { describe, expect, it } from "vitest";
import { accountSchema } from "./accounts";
import { categorySchema } from "./categories";
import { memberSchema } from "./members";
import { transactionFiltersSchema, transactionSchema } from "./transactions";

const ACCOUNT = "3f1c2b8e-6a4d-4b7e-9c1a-2d3e4f5a6b7c";
const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

describe("accountSchema", () => {
  it("cartão exige fechamento e vencimento; limite em formato BR", () => {
    const parsed = accountSchema.parse({
      name: " Nubank crédito ",
      kind: "credit_card",
      ownerUserId: "joint",
      aliases: "Nubank, roxinho, nubank",
      closingDay: "31",
      dueDay: "8",
      creditLimitCents: "12.000,00",
    });
    expect(parsed).toEqual({
      name: "Nubank crédito",
      kind: "credit_card",
      ownerUserId: null,
      aliases: ["nubank", "roxinho"],
      closingDay: 31,
      dueDay: 8,
      creditLimitCents: 1200000,
    });
    expect(accountSchema.safeParse({ name: "X", kind: "credit_card", ownerUserId: "joint", dueDay: "8" }).success).toBe(
      false,
    );
  });

  it("conta aceita saldo inicial negativo e data opcional", () => {
    const parsed = accountSchema.parse({
      name: "Itaú",
      kind: "checking",
      ownerUserId: ACCOUNT,
      openingBalanceCents: "-1.234,56",
      openingBalanceDate: "2026-11-01",
    });
    expect(parsed).toMatchObject({ openingBalanceCents: -123456, openingBalanceDate: "2026-11-01" });
    const cash = accountSchema.parse({ name: "Carteira", kind: "cash", ownerUserId: "joint" });
    expect(cash).toMatchObject({ openingBalanceCents: 0 });
    expect("openingBalanceDate" in cash && cash.openingBalanceDate).toBeFalsy();
  });
});

describe("categorySchema", () => {
  it("aceita só ícones da lista", () => {
    expect(categorySchema.safeParse({ name: "Pets", type: "expense", icon: "paw-print" }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "Pets", type: "expense", icon: "skull" }).success).toBe(false);
  });
});

describe("memberSchema", () => {
  it("normaliza telefone e aceita vazio", () => {
    expect(memberSchema.parse({ displayName: "Ana", phone: "(61) 99999-9999" }).phone).toBe("+5561999999999");
    expect(memberSchema.parse({ displayName: "Ana", phone: "" }).phone).toBeNull();
    expect(memberSchema.safeParse({ displayName: "Ana", phone: "123" }).success).toBe(false);
  });
});

describe("transactionSchema", () => {
  it("despesa parcelada com valor BR", () => {
    expect(
      transactionSchema.parse({
        type: "expense",
        amountCents: "3.000,00",
        occurredOn: "2026-11-01",
        accountId: ACCOUNT,
        categoryId: "",
        installments: "10",
        description: " TV ",
      }),
    ).toEqual({
      type: "expense",
      amountCents: 300000,
      occurredOn: "2026-11-01",
      accountId: ACCOUNT,
      categoryId: undefined,
      installments: 10,
      description: "TV",
    });
  });

  it("rejeita valor zero e formato errado", () => {
    const base = { type: "income", occurredOn: "2026-11-01", accountId: ACCOUNT };
    expect(transactionSchema.safeParse({ ...base, amountCents: "0,00" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, amountCents: "1.23" }).success).toBe(false);
  });

  it("transferência exige destino diferente", () => {
    const base = { type: "transfer", amountCents: "100", occurredOn: "2026-11-01", accountId: ACCOUNT };
    expect(transactionSchema.safeParse({ ...base, transferAccountId: ACCOUNT }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, transferAccountId: "" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, transferAccountId: OTHER }).success).toBe(true);
  });

  it("não deixa parcelar 0,05 em 10x", () => {
    const result = transactionSchema.safeParse({
      type: "expense",
      amountCents: "0,05",
      occurredOn: "2026-11-01",
      accountId: ACCOUNT,
      installments: "10",
    });
    expect(result.success).toBe(false);
  });
});

describe("transactionFiltersSchema", () => {
  it("ignora filtros inválidos", () => {
    expect(transactionFiltersSchema.parse({ mes: "2026-13", conta: "x", pessoa: ACCOUNT })).toEqual({
      mes: undefined,
      conta: undefined,
      categoria: undefined,
      pessoa: ACCOUNT,
    });
  });
});
