import { describe, expect, it } from "vitest";
import { purchaseMonthOf } from "./ledger";
import { invoiceMonthOf } from "./spending-view";
import { type BillEntry, dueSoon, pendingOnAccount, type RecurringBill, recurringMonth } from "./recurring";

const BANK = "bank-1";
const CARD = "card-1";
const bill = (id: string, extra: Partial<RecurringBill> = {}): RecurringBill => ({
  id,
  name: `Conta ${id}`,
  categoryId: "moradia",
  accountId: BANK,
  amountCents: 10_000,
  dueDay: 10,
  spentBy: null,
  active: true,
  ...extra,
});
const paid = (recurringBillId: string, occurredOn: string, amountCents: number, accountId = BANK): BillEntry => ({
  type: "expense",
  amountCents,
  occurredOn,
  accountId,
  invoiceRef: null,
  recurringBillId,
});
const nov = { year: 2026, month: 11 };

describe("recurringMonth", () => {
  it("paga, prevista e atrasada", () => {
    const bills = [bill("aluguel", { dueDay: 5, amountCents: 200_000 }), bill("luz", { dueDay: 20 }), bill("net", { dueDay: 8 })];
    const month = recurringMonth(bills, [paid("aluguel", "2026-11-04", 200_000)], { month: nov, today: "2026-11-15", monthOf: purchaseMonthOf });
    expect(month.items.map((i) => [i.bill.id, i.status, i.dueDate])).toEqual([
      ["net", "late", "2026-11-08"],
      ["luz", "pending", "2026-11-20"],
      ["aluguel", "paid", "2026-11-05"],
    ]);
    expect(month).toMatchObject({ paidCents: 200_000, pendingCents: 20_000, expectedCents: 220_000 });
  });

  it("valor lançado pode ser diferente do previsto", () => {
    const month = recurringMonth([bill("luz")], [paid("luz", "2026-11-09", 13_450)], { month: nov, today: "2026-11-15", monthOf: purchaseMonthOf });
    expect(month.items[0]).toMatchObject({ status: "paid", paidCents: 13_450, paidOn: "2026-11-09" });
    expect(month.expectedCents).toBe(13_450);
  });

  it("lançamento de outro mês não paga este", () => {
    const month = recurringMonth([bill("luz")], [paid("luz", "2026-10-09", 9_000)], { month: nov, today: "2026-11-01", monthOf: purchaseMonthOf });
    expect(month.items[0]?.status).toBe("pending");
  });

  it("no cartão conta pela fatura", () => {
    // Melhor dia 26: compra em 27/10 cai na fatura de novembro.
    const monthOf = invoiceMonthOf([{ id: CARD, closingDay: 26, dueDay: 5, naming: "closing" }]);
    const streaming = bill("stream", { accountId: CARD, amountCents: 4_000, dueDay: 27 });
    const month = recurringMonth([streaming], [paid("stream", "2026-10-27", 4_000, CARD)], { month: nov, today: "2026-11-02", monthOf });
    expect(month.items[0]?.status).toBe("paid");
  });

  it("dia 31 em mês curto vence no último dia", () => {
    const month = recurringMonth([bill("x", { dueDay: 31 })], [], { month: { year: 2027, month: 2 }, today: "2027-02-01", monthOf: purchaseMonthOf });
    expect(month.items[0]?.dueDate).toBe("2027-02-28");
  });

  it("inativa só aparece se teve lançamento no mês", () => {
    const off = bill("velha", { active: false });
    expect(recurringMonth([off], [], { month: nov, today: "2026-11-01", monthOf: purchaseMonthOf }).items).toHaveLength(0);
    expect(recurringMonth([off], [paid("velha", "2026-11-02", 100)], { month: nov, today: "2026-11-03", monthOf: purchaseMonthOf }).items).toHaveLength(1);
  });

  it("pendente por conta e vencendo em breve", () => {
    const bills = [bill("luz", { dueDay: 12 }), bill("stream", { accountId: CARD, amountCents: 4_000, dueDay: 20 })];
    const month = recurringMonth(bills, [], { month: nov, today: "2026-11-10", monthOf: purchaseMonthOf });
    expect(pendingOnAccount(month, CARD)).toBe(4_000);
    expect(dueSoon(month, "2026-11-10", "2026-11-13").map((i) => i.bill.id)).toEqual(["luz"]);
  });
});
