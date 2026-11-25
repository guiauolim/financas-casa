import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledger";
import { purchaseMonthOf } from "./ledger";
import { monthPlan } from "./month-plan";
import { recurringMonth } from "./recurring";

const BANK = "bank-1";
const CARD = "card-1";
const tx = (type: LedgerEntry["type"], amountCents: number, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  type,
  amountCents,
  occurredOn: "2026-11-05",
  accountId: BANK,
  transferAccountId: null,
  categoryId: null,
  ...extra,
});
const month = { year: 2026, month: 11 };

describe("monthPlan", () => {
  it("receitas − fixas − cartão (limite) − outros", () => {
    const bills = [
      { id: "aluguel", name: "Aluguel", categoryId: "c", accountId: BANK, amountCents: 200_000, dueDay: 5, spentBy: null, active: true },
      { id: "luz", name: "Luz", categoryId: "c", accountId: BANK, amountCents: 15_000, dueDay: 20, spentBy: null, active: true },
      { id: "stream", name: "Streaming", categoryId: "c", accountId: CARD, amountCents: 4_000, dueDay: 20, spentBy: null, active: true },
    ];
    const entries = [
      tx("income", 1_000_000),
      tx("expense", 200_000, { recurringBillId: "aluguel" }),
      tx("expense", 30_000), // pix do mercado
      tx("expense", 120_000, { accountId: CARD }),
      tx("income", 5_000, { accountId: CARD }), // estorno: não é receita
      tx("transfer", 50_000, { transferAccountId: CARD }),
    ];
    const recurring = recurringMonth(bills, entries, { month, today: "2026-11-10", monthOf: purchaseMonthOf });
    const plan = monthPlan({
      entries,
      month,
      monthOf: purchaseMonthOf,
      cardIds: new Set([CARD]),
      invoiceLimits: new Map([[CARD, 400_000]]),
      recurring,
    });
    expect(plan).toEqual({
      incomeCents: 1_000_000,
      fixedCents: 215_000, // aluguel lançado + luz prevista (streaming está no cartão)
      cardsCents: 400_000,
      otherCents: 30_000,
      leftoverCents: 355_000,
    });
  });

  it("cartão acima do limite ou sem limite conta o gasto", () => {
    const entries = [tx("expense", 500_000, { accountId: CARD }), tx("expense", 7_000, { accountId: "card-2" })];
    const plan = monthPlan({
      entries,
      month,
      monthOf: purchaseMonthOf,
      cardIds: new Set([CARD, "card-2"]),
      invoiceLimits: new Map([[CARD, 400_000]]),
      recurring: null,
    });
    expect(plan.cardsCents).toBe(507_000);
    expect(plan.leftoverCents).toBe(-507_000);
  });
});
