import { describe, expect, it } from "vitest";
import { type DiscoveredSource, type LinkAccount, linkChoiceError, sourceKey, suggestLink } from "./pluggy-links";

// Dados inventados.
const accounts: LinkAccount[] = [
  { id: "cofre", name: "Conta Conjunta", kind: "checking", ownerUserId: null, archived: false },
  { id: "pessoal", name: "Conta da Ana", kind: "checking", ownerUserId: "ana", archived: false },
  { id: "cartao-azul", name: "Cartão Azul", kind: "credit_card", ownerUserId: null, archived: false },
  { id: "velho", name: "Cartão Verde", kind: "credit_card", ownerUserId: null, archived: true },
];

const source = (over: Partial<DiscoveredSource>): DiscoveredSource => ({
  key: sourceKey(over.sourceKind ?? "bank_account", over.externalId ?? "x"),
  itemId: "item-1",
  sourceKind: "bank_account",
  externalId: "x",
  label: "banco",
  balanceCents: 0,
  activity: 0,
  investmentKinds: [],
  ...over,
});

describe("suggestLink", () => {
  it("conta corrente soma na conta corrente conjunta", () => {
    expect(suggestLink(source({ sourceKind: "bank_account" }), accounts)).toEqual({ role: "vault", accountId: "cofre" });
  });

  it("sem conta corrente, ignora", () => {
    expect(suggestLink(source({ sourceKind: "bank_account" }), accounts.filter((a) => a.kind !== "checking"))).toEqual({
      role: "ignore",
      accountId: null,
    });
  });

  it("cartão com uso liga ao cartão de nome parecido; sem uso é ignorado", () => {
    expect(suggestLink(source({ sourceKind: "card", label: "azul", activity: 3 }), accounts)).toEqual({
      role: "card",
      accountId: "cartao-azul",
    });
    expect(suggestLink(source({ sourceKind: "card", label: "azul", activity: 0 }), accounts).role).toBe("ignore");
    // Cartão arquivado não é sugerido; sem par, ignora (o usuário cria o cartão).
    expect(suggestLink(source({ sourceKind: "card", label: "verde", activity: 2 }), accounts).role).toBe("ignore");
  });

  it("só CDB vira caixinha do cofre; Tesouro vai para Investimentos", () => {
    expect(
      suggestLink(source({ sourceKind: "investments", activity: 2, investmentKinds: ["FIXED_INCOME/CDB"] }), accounts),
    ).toEqual({ role: "reserve", accountId: "cofre" });
    expect(
      suggestLink(source({ sourceKind: "investments", activity: 5, investmentKinds: ["FIXED_INCOME/TREASURY"] }), accounts),
    ).toEqual({ role: "investments", accountId: null });
    expect(suggestLink(source({ sourceKind: "investments", activity: 0 }), accounts).role).toBe("ignore");
  });
});

describe("linkChoiceError", () => {
  it("exige conta para somar e cartão para cartão", () => {
    expect(linkChoiceError({ sourceKind: "bank_account" }, { role: "vault", accountId: null }, accounts)).toMatch(/conta/);
    expect(linkChoiceError({ sourceKind: "bank_account" }, { role: "vault", accountId: "cartao-azul" }, accounts)).toMatch(
      /não um cartão/,
    );
    expect(linkChoiceError({ sourceKind: "card" }, { role: "card", accountId: "cofre" }, accounts)).toMatch(/cartão/);
    expect(linkChoiceError({ sourceKind: "card" }, { role: "card", accountId: "velho" }, accounts)).toMatch(/arquivada/);
    expect(linkChoiceError({ sourceKind: "card" }, { role: "card", accountId: "cartao-azul" }, accounts)).toBeNull();
  });

  it("papel precisa combinar com a origem", () => {
    expect(linkChoiceError({ sourceKind: "card" }, { role: "investments", accountId: null }, accounts)).toMatch(/inválido/);
    expect(linkChoiceError({ sourceKind: "investments" }, { role: "investments", accountId: null }, accounts)).toBeNull();
    expect(linkChoiceError({ sourceKind: "investments" }, { role: "ignore", accountId: null }, accounts)).toBeNull();
  });
});
