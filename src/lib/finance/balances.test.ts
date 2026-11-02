import { describe, expect, it } from "vitest";
import { accountBalance, cardInvoices, totalBalance } from "./balances";
import type { LedgerEntry } from "./ledger";

const BANK = "bank";
const SAVINGS = "savings";
const CARD = "card";

const entry = (
  type: LedgerEntry["type"],
  occurredOn: string,
  amountCents: number,
  accountId: string,
  transferAccountId: string | null = null,
): LedgerEntry => ({ type, occurredOn, amountCents, accountId, transferAccountId, categoryId: null });

describe("accountBalance", () => {
  const entries = [
    entry("income", "2026-10-31", 99999, BANK), // antes do saldo inicial: ignorado
    entry("income", "2026-11-05", 850000, BANK),
    entry("expense", "2026-11-06", 12000, BANK),
    entry("transfer", "2026-11-07", 100000, BANK, SAVINGS),
    entry("transfer", "2026-11-10", 50000, BANK, CARD), // pagamento de fatura
    entry("expense", "2026-11-08", 7000, CARD), // compra no cartão não mexe na conta
    entry("expense", "2026-12-15", 3000, BANK), // futuro
  ];
  const bank = { id: BANK, openingBalanceCents: 100000, openingBalanceDate: "2026-11-01" };

  it("saldo inicial + entradas − saídas ± transferências, a partir da data do saldo inicial", () => {
    expect(accountBalance(bank, entries)).toBe(100000 + 850000 - 12000 - 100000 - 50000 - 3000);
  });

  it("até uma data (lançamentos futuros não contam)", () => {
    expect(accountBalance(bank, entries, "2026-11-30")).toBe(788000);
  });

  it("sem data de saldo inicial considera tudo", () => {
    expect(accountBalance({ ...bank, openingBalanceDate: null }, entries, "2026-11-30")).toBe(788000 + 99999);
  });

  it("transferência entra na conta de destino", () => {
    const savings = { id: SAVINGS, openingBalanceCents: -5000, openingBalanceDate: null };
    expect(accountBalance(savings, entries)).toBe(95000);
    expect(totalBalance([bank, savings], entries, "2026-11-30")).toBe(788000 + 95000);
  });
});

describe("cardInvoices", () => {
  // Fecha dia 3, vence dia 10 (mesmo mês). Compras de 03/10 a 02/11 → fatura que fecha em 03/11 e vence 10/11.
  const card = { id: CARD, closingDay: 3, dueDay: 10 };

  it("fatura aberta = compras do ciclo atual; pagamento da anterior não abate a aberta (FIFO)", () => {
    const entries = [
      entry("expense", "2026-10-05", 30000, CARD), // fatura nov (fecha 03/11)
      entry("expense", "2026-11-03", 10000, CARD), // dia do fechamento → fatura dez
      entry("expense", "2026-11-04", 5000, CARD), // fatura dez
      entry("transfer", "2026-11-09", 30000, BANK, CARD), // paga a fatura de nov, dentro do ciclo de dez
    ];
    const result = cardInvoices(card, entries, "2026-11-12");
    expect(result.open).toMatchObject({
      reference: "2026-12",
      closingDate: "2026-12-03",
      dueDate: "2026-12-10",
      chargesCents: 15000,
      paidCents: 0,
      remainingCents: 15000,
    });
    expect(result.closedUnpaid).toEqual([]);
    expect(result.creditCents).toBe(0);
  });

  it("fatura fechada ainda não paga aparece com o vencimento", () => {
    const entries = [entry("expense", "2026-10-20", 30000, CARD), entry("transfer", "2026-11-05", 10000, BANK, CARD)];
    const result = cardInvoices(card, entries, "2026-11-05");
    expect(result.closedUnpaid).toHaveLength(1);
    expect(result.closedUnpaid[0]).toMatchObject({ dueDate: "2026-11-10", paidCents: 10000, remainingCents: 20000 });
    expect(result.open.chargesCents).toBe(0);
  });

  it("pagamento adiantado abate a fatura aberta", () => {
    const entries = [
      entry("expense", "2026-10-20", 30000, CARD),
      entry("expense", "2026-11-05", 20000, CARD),
      entry("transfer", "2026-11-06", 40000, BANK, CARD),
    ];
    const result = cardInvoices(card, entries, "2026-11-12");
    expect(result.open).toMatchObject({ chargesCents: 20000, paidCents: 10000, remainingCents: 10000 });
  });

  it("pagamento a mais vira crédito", () => {
    const result = cardInvoices(card, [entry("transfer", "2026-11-06", 5000, BANK, CARD)], "2026-11-12");
    expect(result.open.remainingCents).toBe(0);
    expect(result.creditCents).toBe(5000);
  });

  it("estorno (receita no cartão) abate a fatura do ciclo", () => {
    const entries = [entry("expense", "2026-11-05", 20000, CARD), entry("income", "2026-11-06", 5000, CARD)];
    expect(cardInvoices(card, entries, "2026-11-12").open).toMatchObject({ chargesCents: 15000, remainingCents: 15000 });
  });

  it("parcelas futuras ficam nas faturas futuras", () => {
    const entries = ["2026-10-15", "2026-11-15", "2026-12-15"].map((date) => entry("expense", date, 10000, CARD));
    const result = cardInvoices(card, entries, "2026-11-20");
    expect(result.open).toMatchObject({ reference: "2026-12", chargesCents: 10000 });
    // A de out/15 caiu na fatura de nov (já fechada, não paga).
    expect(result.closedUnpaid.map((i) => i.reference)).toEqual(["2026-11"]);
  });

  it("vencimento no mês seguinte quando o dia do vencimento é antes do fechamento", () => {
    const late = { id: CARD, closingDay: 28, dueDay: 5 };
    const result = cardInvoices(late, [entry("expense", "2026-02-27", 1000, CARD)], "2026-02-27");
    expect(result.open).toMatchObject({ closingDate: "2026-02-28", dueDate: "2026-03-05" });
  });
});
