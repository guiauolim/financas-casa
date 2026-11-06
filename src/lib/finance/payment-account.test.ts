import { describe, expect, it } from "vitest";
import { cardPaymentAccount, defaultPaymentAccount, invoicePaidOn } from "./payment-account";

// Dados inventados.
const conjunta = { id: "conjunta", kind: "checking", ownerUserId: null, archived: false };
const daAna = { id: "ana-cc", kind: "checking", ownerUserId: "ana", archived: false };
const vale = { id: "vale", kind: "meal_voucher", ownerUserId: null, archived: false };
const cartao = { id: "cartao", kind: "credit_card", ownerUserId: null, archived: false };

describe("defaultPaymentAccount", () => {
  it("prefere a conta corrente conjunta", () => {
    expect(defaultPaymentAccount([daAna, vale, conjunta, cartao])).toBe(conjunta);
  });
  it("sem conjunta, a primeira conta corrente; sem conta corrente, nenhuma", () => {
    expect(defaultPaymentAccount([vale, daAna])).toBe(daAna);
    expect(defaultPaymentAccount([vale, cartao])).toBeNull();
  });
  it("ignora contas arquivadas", () => {
    expect(defaultPaymentAccount([{ ...conjunta, archived: true }, daAna])).toBe(daAna);
  });
});

describe("cardPaymentAccount", () => {
  const accounts = [conjunta, daAna, vale, cartao];
  it("usa a escolhida no cartão", () => {
    expect(cardPaymentAccount({ paymentAccountId: "ana-cc" }, accounts)).toBe(daAna);
  });
  it("sem escolha, arquivada ou cartão: cai na padrão", () => {
    expect(cardPaymentAccount({ paymentAccountId: null }, accounts)).toBe(conjunta);
    expect(cardPaymentAccount({ paymentAccountId: "ana-cc" }, [conjunta, { ...daAna, archived: true }])).toBe(conjunta);
    expect(cardPaymentAccount({ paymentAccountId: "cartao" }, accounts)).toBe(conjunta);
  });
});

describe("invoicePaidOn", () => {
  const pay = (occurredOn: string, invoiceRef: string | null, transferAccountId = "cartao") => ({
    type: "transfer" as const,
    occurredOn,
    transferAccountId,
    invoiceRef,
  });
  it("última data de pagamento daquela fatura do cartão", () => {
    const entries = [
      pay("2026-11-28", "2026-11"),
      pay("2026-12-03", "2026-11"), // segundo pagamento (parcial antes)
      pay("2026-12-01", "2026-10"), // outra fatura
      pay("2026-12-05", "2026-11", "outro-cartao"),
      pay("2026-12-06", null), // sem fatura gravada
      { type: "expense" as const, occurredOn: "2026-12-07", transferAccountId: null, invoiceRef: "2026-11" },
    ];
    expect(invoicePaidOn("cartao", "2026-11", entries)).toBe("2026-12-03");
    expect(invoicePaidOn("cartao", "2026-09", entries)).toBeNull();
  });
});
