import { describe, expect, it } from "vitest";
import {
  candidateInvoiceRefs,
  groupMonth,
  hasFollowingInstallments,
  type MonthCard,
  type MonthEntry,
  monthInvoiceRef,
  monthTotals,
  planBatchDelete,
  selectionSummary,
  sumInvoice,
} from "./month-view";

// Dados inventados. Cartão A: melhor dia 26, vence 5, nome pelo fechamento ("novembro" = 26/10–25/11).
// Cartão B: melhor dia 3, vence 10, nome pelo vencimento.
const A: MonthCard = { id: "card-a", closingDay: 26, dueDay: 5, naming: "closing" };
const B: MonthCard = { id: "card-b", closingDay: 3, dueDay: 10, naming: "due" };
const BANK = "bank";

let seq = 0;
const tx = (over: Partial<MonthEntry> & Pick<MonthEntry, "occurredOn" | "amountCents">): MonthEntry => ({
  id: `tx-${++seq}`,
  type: "expense",
  invoiceRef: null,
  account: { id: BANK },
  transferAccount: null,
  category: { id: "mercado" },
  spentBy: null,
  installment: null,
  ...over,
});

describe("monthInvoiceRef / candidateInvoiceRefs", () => {
  it("nome pelo fechamento: a própria chave; pelo vencimento: a fatura que vence no mês", () => {
    expect(monthInvoiceRef("2026-11", A)).toBe("2026-11");
    // B vence no mesmo mês do fechamento (10 > 3): "fatura de novembro" fecha em novembro.
    expect(monthInvoiceRef("2026-11", B)).toBe("2026-11");
    expect(monthInvoiceRef("2026-11", { ...A, naming: "due" })).toBe("2026-10"); // fecha 25/10, vence 05/11
  });

  it("candidatos cobrem os dois nomes", () => {
    expect(candidateInvoiceRefs("2026-01")).toEqual(["2025-12", "2026-01"]);
  });
});

describe("groupMonth", () => {
  const oldInstallment = tx({
    occurredOn: "2026-07-20",
    amountCents: 5000,
    account: { id: A.id },
    invoiceRef: "2026-11",
    installment: { groupId: "g1", number: 5, total: 6 },
  });
  const entries = [
    tx({ occurredOn: "2026-10-27", amountCents: 10000, account: { id: A.id }, invoiceRef: "2026-11" }), // fim de outubro → fatura de novembro
    tx({ occurredOn: "2026-11-26", amountCents: 40000, account: { id: A.id }, invoiceRef: "2026-12" }), // outra fatura: não entra
    oldInstallment,
    tx({ occurredOn: "2026-11-12", amountCents: 3000, type: "income", account: { id: A.id }, invoiceRef: "2026-11", category: null }), // estorno
    tx({ occurredOn: "2026-11-05", amountCents: 2500, account: { id: B.id }, invoiceRef: "2026-11", spentBy: "ana" }),
    tx({ occurredOn: "2026-11-15", amountCents: 8000 }), // débito no mês
    tx({ occurredOn: "2026-10-31", amountCents: 999 }), // débito fora do mês
    tx({ occurredOn: "2026-11-05", amountCents: 900000, type: "income", category: { id: "salario" }, spentBy: "ana" }),
    tx({ occurredOn: "2026-11-06", amountCents: 7000, type: "transfer", transferAccount: { id: A.id }, invoiceRef: "2026-10", category: null }), // pagamento
    tx({ occurredOn: "2026-11-07", amountCents: 1200, account: { id: "card-sem-ciclo" } }), // cartão sem ciclo: pela data
  ];

  it("uma seção por cartão (fatura do mês, com parcela antiga) e o resto pela data", () => {
    const groups = groupMonth(entries, [A, B], "2026-11");
    expect(groups.invoices.map((s) => [s.cardId, s.ref, s.transactions.map((t) => t.amountCents)])).toEqual([
      [A.id, "2026-11", [10000, 5000, 3000]],
      [B.id, "2026-11", [2500]],
    ]);
    expect(groups.outside.map((t) => t.amountCents)).toEqual([8000, 900000, 7000, 1200]);
    expect(groups.invoices[0]!.transactions).toContain(oldInstallment);
  });

  it("cartão sem lançamentos no mês ainda tem seção (vazia)", () => {
    const groups = groupMonth([], [A], "2026-11");
    expect(groups.invoices).toEqual([{ cardId: A.id, ref: "2026-11", transactions: [] }]);
  });

  it("filtros valem para as duas seções", () => {
    const byPerson = groupMonth(entries, [A, B], "2026-11", { spentBy: "ana" });
    expect(byPerson.invoices.flatMap((s) => s.transactions).map((t) => t.amountCents)).toEqual([2500]);
    expect(byPerson.outside.map((t) => t.amountCents)).toEqual([900000]);

    const house = groupMonth(entries, [A, B], "2026-11", { spentBy: null });
    expect(house.outside.map((t) => t.amountCents)).toEqual([8000, 1200]); // sem transferência

    // Conta inclui transferências que chegam nela (pagamento da fatura do cartão A).
    const byAccount = groupMonth(entries, [A, B], "2026-11", { accountId: A.id });
    expect(byAccount.invoices[1]!.transactions).toEqual([]);
    expect(byAccount.outside.map((t) => t.amountCents)).toEqual([7000]);

    const byCategory = groupMonth(entries, [A, B], "2026-11", { categoryId: "mercado" });
    expect(byCategory.invoices[0]!.transactions.map((t) => t.amountCents)).toEqual([10000, 5000]);
  });

  it("totais: cartão (compras − estornos) + fora do cartão; transferências não entram", () => {
    const totals = monthTotals(groupMonth(entries, [A, B], "2026-11"));
    expect(totals).toEqual({
      cardCents: 10000 + 5000 - 3000 + 2500,
      outsideCents: 8000 + 1200,
      totalCents: 14500 + 9200,
      incomeCents: 900000,
      balanceCents: 900000 - 23700,
    });
    expect(sumInvoice([{ type: "expense", amountCents: 100 }, { type: "income", amountCents: 30 }])).toBe(70);
  });

  it("mês inválido", () => {
    expect(() => groupMonth([], [], "2026-13")).toThrow(RangeError);
  });
});

describe("exclusão em lote", () => {
  const single = { id: "s1", installment: null };
  const p3 = { id: "p3", installment: { groupId: "g", number: 3, total: 10 } };
  const p5 = { id: "p5", installment: { groupId: "g", number: 5, total: 10 } };
  const last = { id: "h6", installment: { groupId: "h", number: 6, total: 6 } };

  it("só as escolhidas", () => {
    expect(planBatchDelete([single, p3, p5], "one")).toEqual({ ids: ["s1", "p3", "p5"], groups: [] });
  });

  it("esta e as próximas: a partir da menor parcela escolhida de cada grupo", () => {
    expect(planBatchDelete([p5, single, p3, last], "following")).toEqual({
      ids: ["s1"],
      groups: [
        { groupId: "g", fromNumber: 3 },
        { groupId: "h", fromNumber: 6 },
      ],
    });
  });

  it("oferece 'esta e as próximas' só quando há parcela com próximas", () => {
    expect(hasFollowingInstallments([single, last])).toBe(false);
    expect(hasFollowingInstallments([single, p3])).toBe(true);
  });

  it("resumo da confirmação: quantidade e valores por tipo", () => {
    expect(
      selectionSummary([
        { type: "expense", amountCents: 1000 },
        { type: "expense", amountCents: 250 },
        { type: "income", amountCents: 300 },
        { type: "transfer", amountCents: 5000 },
      ]),
    ).toEqual({ count: 4, expenseCents: 1250, incomeCents: 300, transferCents: 5000 });
  });
});
