import { describe, expect, it } from "vitest";
import { evaluateBudget, monthProjection } from "./budget";
import { type LedgerEntry, purchaseMonthOf } from "./ledger";
import { invoiceMonthOf, type ViewCard } from "./spending-view";
import { expensesByCategory, monthlySeries, summarizeMonth } from "./summary";

// Cartão: melhor dia 26 (fecha 25), vence dia 5. "Fatura de novembro" (fechamento) = 26/10–25/11.
const CARD = "card";
const BANK = "bank";
const card: ViewCard = { id: CARD, closingDay: 26, dueDay: 5, naming: "closing" };
const nov = { year: 2026, month: 11 };
const dec = { year: 2026, month: 12 };

const tx = (
  occurredOn: string,
  amountCents: number,
  accountId = CARD,
  invoiceRef: string | null = null,
  type: LedgerEntry["type"] = "expense",
  categoryId: string | null = "mercado",
): LedgerEntry => ({ type, occurredOn, amountCents, accountId, transferAccountId: null, categoryId, invoiceRef });

describe("invoiceMonthOf", () => {
  const purchase = purchaseMonthOf;
  const invoice = invoiceMonthOf([card]);

  it("pela data da compra (uso interno): sempre o mês da data", () => {
    expect(purchase(tx("2026-10-27", 1, CARD, "2026-11"))).toBe("2026-10");
  });

  it("por fatura: compra no dia 25 fica no mês; no dia 26 vai para o seguinte", () => {
    expect(invoice(tx("2026-11-25", 1))).toBe("2026-11");
    expect(invoice(tx("2026-11-26", 1))).toBe("2026-12");
    expect(invoice(tx("2026-10-26", 1))).toBe("2026-11");
  });

  it("por fatura: vira o ano", () => {
    expect(invoice(tx("2026-12-26", 1))).toBe("2027-01");
    expect(invoice(tx("2026-12-31", 1, CARD, "2027-01"))).toBe("2027-01");
  });

  it("por fatura: usa a fatura gravada (parcela de compra de julho na fatura de novembro)", () => {
    // 5/6 de uma compra de 20/07: a data da parcela é 20/11, mas o que manda é a fatura gravada.
    expect(invoice(tx("2026-11-20", 1, CARD, "2026-11"))).toBe("2026-11");
    // Importada com data original (julho) na fatura de novembro.
    expect(invoice(tx("2026-07-20", 1, CARD, "2026-11"))).toBe("2026-11");
  });

  it("por fatura com nome pelo vencimento: a fatura que fecha em novembro é a de dezembro", () => {
    const byDue = invoiceMonthOf([{ ...card, naming: "due" }]);
    expect(byDue(tx("2026-11-10", 1, CARD, "2026-11"))).toBe("2026-12");
  });

  it("mês curto: melhor dia 31 em fevereiro", () => {
    const short = invoiceMonthOf([{ id: CARD, closingDay: 31, dueDay: 8, naming: "closing" }]);
    expect(short(tx("2026-02-27", 1))).toBe("2026-02");
    expect(short(tx("2026-02-28", 1))).toBe("2026-03");
  });

  it("fora do cartão continua pela data", () => {
    expect(invoice(tx("2026-10-27", 1, BANK))).toBe("2026-10");
  });
});

describe("relatórios do mês: por fatura × pela data da compra (interno)", () => {
  const ledger = [
    tx("2026-10-27", 10000, CARD, "2026-11"), // cartão, fim de outubro → fatura de novembro
    tx("2026-11-10", 20000, CARD, "2026-11"),
    tx("2026-11-26", 40000, CARD, "2026-12"), // melhor dia → fatura de dezembro
    tx("2026-07-20", 5000, CARD, "2026-11", "expense", "moveis"), // parcela de compra de julho na fatura de novembro
    tx("2026-11-15", 8000, BANK), // débito: sempre pela data
    tx("2026-11-12", 3000, CARD, "2026-11", "income", "reembolso"), // estorno no cartão
  ];
  const byPurchase = purchaseMonthOf;
  const byInvoice = invoiceMonthOf([card]);

  it("saídas e entradas do mês", () => {
    expect(summarizeMonth(ledger, nov, byPurchase)).toMatchObject({ expenseCents: 20000 + 40000 + 8000, incomeCents: 3000 });
    expect(summarizeMonth(ledger, nov, byInvoice)).toMatchObject({ expenseCents: 10000 + 20000 + 5000 + 8000, incomeCents: 3000 });
    expect(summarizeMonth(ledger, dec, byInvoice).expenseCents).toBe(40000);
  });

  it("por categoria e série", () => {
    expect(expensesByCategory(ledger, nov, byInvoice)).toEqual([
      { categoryId: "mercado", spentCents: 38000 },
      { categoryId: "moveis", spentCents: 5000 },
    ]);
    expect(monthlySeries(ledger, dec, 2, byInvoice).map((m) => m.expenseCents)).toEqual([43000, 40000]);
  });

  it("orçamento mensal conta pela fatura; o semanal segue a data da compra", () => {
    const monthly = { id: "b", period: "monthly" as const, categoryId: null, accountId: null, limitCents: 50000 };
    expect(evaluateBudget(monthly, ledger, { month: nov, today: "2026-11-30", monthOf: byPurchase }).spentCents).toBe(68000);
    expect(evaluateBudget(monthly, ledger, { month: nov, today: "2026-11-30", monthOf: byInvoice }).spentCents).toBe(43000);
    const weekly = { id: "w", period: "weekly" as const, categoryId: null, accountId: CARD, limitCents: 50000 };
    // Semana de 23/11 a 29/11: só a compra de 26/11, mesmo contando o mês pela fatura.
    expect(evaluateBudget(weekly, ledger, { month: nov, today: "2026-11-26", monthOf: byInvoice }).spentCents).toBe(40000);
  });

  it("projeção por fatura: o que veio de antes do mês entra fixo, sem extrapolar", () => {
    // Dia 10/11, por fatura: 15000 de antes do mês (27/10 e a parcela de julho) + 20000 até hoje.
    const projection = monthProjection(ledger, { month: nov, today: "2026-11-10", monthOf: byInvoice });
    expect(projection).toEqual({
      kind: "current",
      projectedCents: 15000 + Math.round((20000 * 30) / 10),
      daysElapsed: 10,
      daysInMonth: 30,
    });
  });
});
