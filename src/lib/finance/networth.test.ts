import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledger";
import { cardDebtAt, type NetWorthInput, netWorthAt, netWorthForMonth } from "./networth";

const entry = (
  type: LedgerEntry["type"],
  occurredOn: string,
  amountCents: number,
  accountId: string,
  transferAccountId: string | null = null,
  invoiceRef: string | null = null,
): LedgerEntry => ({ type, occurredOn, amountCents, accountId, transferAccountId, categoryId: null, invoiceRef });

const card = { id: "card", closingDay: 5, dueDay: 12 };
const ledger: LedgerEntry[] = [
  entry("income", "2026-10-01", 500000, "bank"),
  entry("expense", "2026-10-10", 30000, "card"), // fatura "2026-11" (05/10 a 04/11)
  entry("transfer", "2026-11-12", 30000, "bank", "card"), // paga essa fatura
  entry("expense", "2026-11-03", 20000, "card"), // ainda na fatura "2026-11" (já aberta em 31/10)
  entry("expense", "2026-11-20", 10000, "card"), // fatura seguinte
  entry("expense", "2026-12-20", 99900, "card"), // parcela futura
];

const input: NetWorthInput = {
  moneyAccounts: [{ id: "bank", openingBalanceCents: 100000, openingBalanceDate: null }],
  cards: [card],
  ledger,
  investments: [
    { id: "cdb", assetClass: "fixed_income", currentValueCents: 210000, archivedOn: null },
    { id: "velho", assetClass: "stock", currentValueCents: 5000, archivedOn: "2026-11-01" },
  ],
  snapshots: [
    { investmentId: "cdb", takenOn: "2026-10-31", valueCents: 200000 },
    { investmentId: "cdb", takenOn: "2026-11-15", valueCents: 210000 },
    { investmentId: "velho", takenOn: "2026-10-01", valueCents: 5000 },
  ],
};

describe("cardDebtAt", () => {
  it("faturas em aberto até a data, sem faturas futuras", () => {
    // Em 31/10 a fatura aberta é a "2026-11": inclui a compra de 03/11, que já está nela (como uma
    // parcela que o banco põe na fatura desde o início do ciclo). As de dezembro em diante não.
    expect(cardDebtAt(card, ledger, "2026-10-31")).toBe(50000);
    expect(cardDebtAt(card, ledger, "2026-11-10")).toBe(50000 + 10000); // fechada não paga + aberta (compra de 20/11)
    expect(cardDebtAt(card, ledger, "2026-11-30")).toBe(20000 + 10000 - 0); // pagamento FIFO quita a de 30000
  });

  it("parcela de compra antiga gravada na fatura aberta conta mesmo com data adiante", () => {
    const parcel = [entry("expense", "2026-11-20", 7000, "card", null, "2026-11")];
    expect(cardDebtAt(card, parcel, "2026-11-01")).toBe(7000);
    const nextInvoice = [entry("expense", "2026-11-20", 7000, "card", null, "2026-12")];
    expect(cardDebtAt(card, nextInvoice, "2026-11-01")).toBe(0);
  });

  it("crédito pago a mais reduz a dívida", () => {
    const extra = [...ledger, entry("transfer", "2026-11-25", 100000, "bank", "card")];
    expect(cardDebtAt(card, extra, "2026-11-30")).toBe(-70000);
  });
});

describe("netWorthAt", () => {
  it("contas + investimentos ativos − faturas", () => {
    expect(netWorthAt("2026-10-31", input)).toEqual({
      accountsCents: 600000,
      investmentsCents: 200000 + 5000,
      invoicesCents: 50000,
      totalCents: 600000 + 205000 - 50000,
    });
  });

  it("pagamento de fatura não muda o patrimônio (só tira da conta e da dívida)", () => {
    const before = netWorthAt("2026-11-11", input);
    const after = netWorthAt("2026-11-12", input);
    expect(after.totalCents).toBe(before.totalCents);
  });
});

describe("netWorthForMonth", () => {
  it("mês corrente: hoje vs fim do mês anterior", () => {
    const report = netWorthForMonth({ year: 2026, month: 11 }, "2026-11-30", input);
    expect(report.asOf).toBe("2026-11-30");
    expect(report.previousAsOf).toBe("2026-10-31");
    // nov: 570000 + 210000 − 30000 = 750000; out: 600000 + 205000 − 50000 = 755000
    expect(report.totalCents).toBe(750000);
    expect(report.changeCents).toBe(750000 - 755000);
  });

  it("mês passado usa o último dia do mês", () => {
    const report = netWorthForMonth({ year: 2026, month: 10 }, "2026-11-30", input);
    expect(report.asOf).toBe("2026-10-31");
    expect(report.previousAsOf).toBe("2026-09-30");
  });
});

describe("faturas pagas fora do sistema", () => {
  it("não abatem o patrimônio depois do vencimento", () => {
    // Histórico importado: compras de faturas já pagas, sem o pagamento lançado.
    const imported: NetWorthInput = {
      ...input,
      ledger: [entry("expense", "2026-09-10", 800000, "card"), entry("expense", "2026-10-01", 900000, "card")],
    };
    const settled: NetWorthInput = {
      ...imported,
      cards: [{ ...card, settledRefs: new Set(["2026-09", "2026-10"]) }],
    };
    expect(netWorthAt("2026-10-20", imported).invoicesCents).toBe(1700000);
    const result = netWorthAt("2026-10-20", settled);
    expect(result.invoicesCents).toBe(0);
    expect(result.totalCents).toBe(result.accountsCents + result.investmentsCents);
  });
});
