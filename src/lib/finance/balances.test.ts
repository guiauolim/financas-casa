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
  invoiceRef: string | null = null,
): LedgerEntry => ({ type, occurredOn, amountCents, accountId, transferAccountId, categoryId: null, invoiceRef });

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
  // Melhor dia 3, vence dia 10 (mesmo mês). Compras de 03/10 a 02/11 → fatura "2026-11", fecha 02/11, vence 10/11.
  const card = { id: CARD, closingDay: 3, dueDay: 10 };

  it("fatura aberta = compras do ciclo atual; pagamento da anterior não abate a aberta (FIFO)", () => {
    const entries = [
      entry("expense", "2026-10-05", 30000, CARD), // fatura nov (fecha 02/11)
      entry("expense", "2026-11-03", 10000, CARD), // melhor dia de compra → fatura dez
      entry("expense", "2026-11-04", 5000, CARD), // fatura dez
      entry("transfer", "2026-11-09", 30000, BANK, CARD), // paga a fatura de nov, dentro do ciclo de dez
    ];
    const result = cardInvoices(card, entries, "2026-11-12");
    expect(result.open).toMatchObject({
      ref: "2026-12",
      closingDate: "2026-12-02",
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
    expect(result.open).toMatchObject({ ref: "2026-12", chargesCents: 10000 });
    // A de out/15 caiu na fatura de nov (já fechada, não paga).
    expect(result.closedUnpaid.map((i) => i.ref)).toEqual(["2026-11"]);
    expect(result.invoices.map((i) => i.ref)).toEqual(["2026-11", "2026-12", "2027-01"]);
    // Limite comprometido inclui a parcela da fatura futura.
    expect(result.limitUsedCents).toBe(30000);
  });

  it("vencimento no mês seguinte quando o dia do vencimento é antes do fechamento", () => {
    const late = { id: CARD, closingDay: 28, dueDay: 5 };
    const result = cardInvoices(late, [entry("expense", "2026-02-27", 1000, CARD)], "2026-02-27");
    expect(result.open).toMatchObject({ ref: "2026-02", closingDate: "2026-02-27", dueDate: "2026-03-05" });
  });
});

describe("cardInvoices com faturas pagas fora do sistema", () => {
  // Melhor dia 3, vence dia 10. Compras importadas de faturas já pagas, sem o pagamento lançado.
  const card = { id: CARD, closingDay: 3, dueDay: 10 };
  const entries = [
    entry("expense", "2026-08-20", 40000, CARD), // fatura 2026-09
    entry("expense", "2026-09-20", 30000, CARD), // fatura 2026-10
    entry("expense", "2026-10-20", 5000, CARD), // fatura 2026-11 (aberta em 2026-10-25)
  ];

  it("sem a marcação, tudo aparece como devido", () => {
    const result = cardInvoices(card, entries, "2026-10-25");
    expect(result.closedUnpaid.map((i) => i.ref)).toEqual(["2026-09", "2026-10"]);
  });

  it("faturas marcadas como pagas não ficam em aberto (depois do vencimento)", () => {
    const settled = { ...card, settledRefs: new Set(["2026-09", "2026-10"]) };
    const result = cardInvoices(settled, entries, "2026-10-25");
    expect(result.closedUnpaid).toEqual([]);
    expect(result.open).toMatchObject({ ref: "2026-11", remainingCents: 5000 });
    expect(result.creditCents).toBe(0);
  });

  it("antes do vencimento a dívida ainda existia", () => {
    const settled = { ...card, settledRefs: new Set(["2026-10"]) };
    const result = cardInvoices(settled, entries, "2026-10-05");
    expect(result.closedUnpaid.find((i) => i.ref === "2026-10")?.remainingCents).toBe(30000);
  });

  it("pagamento lançado de fatura marcada não vira crédito na aberta", () => {
    const settled = { ...card, settledRefs: new Set(["2026-09", "2026-10"]) };
    const withPayment = [...entries, entry("transfer", "2026-09-10", 40000, BANK, CARD)];
    const result = cardInvoices(settled, withPayment, "2026-10-25");
    expect(result.creditCents).toBe(0);
    expect(result.open.remainingCents).toBe(5000);
  });
});

describe("cardInvoices com a fatura gravada no lançamento (invoice_ref)", () => {
  // Melhor dia 26 (fecha 25), vence dia 5 do mês seguinte.
  const card = { id: CARD, closingDay: 26, dueDay: 5 };

  it("usa a fatura gravada, sem recalcular pela data", () => {
    const entries = [
      entry("expense", "2026-11-10", 10000, CARD, null, "2026-11"),
      // Parcela 5/6 de compra de julho: a data é 20/11, mas o banco pôs na fatura de novembro.
      entry("expense", "2026-11-20", 5000, CARD, null, "2026-11"),
      // Importada: comprada em 27/10 mas o arquivo diz fatura de novembro (seria a mesma pelo cálculo).
      entry("expense", "2026-10-27", 2000, CARD, null, "2026-11"),
      // Data de 24/11 mas gravada na fatura de dezembro (ex.: banco adiou o fechamento).
      entry("expense", "2026-11-24", 3000, CARD, null, "2026-12"),
    ];
    const result = cardInvoices(card, entries, "2026-11-12");
    expect(result.open).toMatchObject({ ref: "2026-11", chargesCents: 17000 });
    expect(result.invoices.find((i) => i.ref === "2026-12")?.chargesCents).toBe(3000);
  });

  it("sem fatura gravada, calcula pela data (lançamentos antigos)", () => {
    const result = cardInvoices(card, [entry("expense", "2026-11-26", 1000, CARD)], "2026-11-26");
    expect(result.open).toMatchObject({ ref: "2026-12", chargesCents: 1000 });
  });

  it("pagamento com fatura gravada quita essa fatura primeiro", () => {
    const entries = [
      entry("expense", "2026-09-10", 20000, CARD, null, "2026-09"),
      entry("expense", "2026-10-10", 30000, CARD, null, "2026-10"),
      // Paga a de outubro (venceu 03/11) sem ter pago a de setembro: FIFO puro abateria setembro.
      entry("transfer", "2026-11-02", 30000, BANK, CARD, "2026-10"),
    ];
    const result = cardInvoices(card, entries, "2026-11-12");
    expect(result.closedUnpaid.map((i) => [i.ref, i.remainingCents])).toEqual([["2026-09", 20000]]);
    expect(result.invoices.find((i) => i.ref === "2026-10")).toMatchObject({ paidCents: 30000, remainingCents: 0 });
  });

  it("sobra do pagamento com fatura vai para as outras (FIFO)", () => {
    const entries = [
      entry("expense", "2026-09-10", 20000, CARD, null, "2026-09"),
      entry("expense", "2026-10-10", 30000, CARD, null, "2026-10"),
      entry("transfer", "2026-11-02", 45000, BANK, CARD, "2026-10"),
    ];
    const result = cardInvoices(card, entries, "2026-11-12");
    expect(result.invoices.find((i) => i.ref === "2026-09")).toMatchObject({ paidCents: 15000, remainingCents: 5000 });
    expect(result.creditCents).toBe(0);
  });

  it("limite comprometido = tudo o que falta pagar, inclusive faturas futuras", () => {
    const entries = [
      entry("expense", "2026-11-10", 10000, CARD, null, "2026-11"),
      entry("expense", "2026-12-10", 10000, CARD, null, "2026-12"),
      entry("expense", "2027-01-10", 10000, CARD, null, "2027-01"),
      entry("transfer", "2026-11-11", 4000, BANK, CARD), // adiantado
    ];
    expect(cardInvoices(card, entries, "2026-11-12").limitUsedCents).toBe(26000);
  });
});
