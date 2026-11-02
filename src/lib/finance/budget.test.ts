import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  evaluateBudget,
  expenseSpent,
  monthProjection,
  weekToDate,
  weeklyByDay,
} from "./budget";
import { addDays, todayInSaoPaulo, weekRange, weekdayIndex } from "./dates";
import type { LedgerEntry } from "./ledger";

const CARD = "card-1";
const BANK = "bank-1";

const expense = (occurredOn: string, amountCents: number, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  type: "expense",
  amountCents,
  occurredOn,
  accountId: CARD,
  transferAccountId: null,
  categoryId: "mercado",
  ...extra,
});

describe("datas da semana", () => {
  it("semana vai de segunda a domingo", () => {
    // 01/11/2026 é domingo.
    expect(weekdayIndex("2026-11-01")).toBe(6);
    expect(weekdayIndex("2026-11-02")).toBe(0);
    expect(weekRange("2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(weekRange("2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });

  it("semana que cruza meses e anos", () => {
    expect(weekRange("2026-12-31")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(weekRange("2028-02-29")).toEqual({ from: "2028-02-28", to: "2028-03-05" });
  });

  it("soma dias atravessando fevereiro", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("o 'hoje' é o de São Paulo, não o UTC", () => {
    // 23h30 de domingo em SP = 02h30 UTC de segunda.
    const now = new Date("2026-11-02T02:30:00Z");
    const today = todayInSaoPaulo(now);
    expect(today).toBe("2026-11-01");
    expect(weekRange(today).from).toBe("2026-10-26");
  });
});

describe("budgetStatus", () => {
  it("ok abaixo de 80%, atenção de 80% a 100%, estourado acima", () => {
    expect(budgetStatus(7999, 10000).status).toBe("ok");
    expect(budgetStatus(8000, 10000).status).toBe("attention");
    expect(budgetStatus(10000, 10000).status).toBe("attention");
    expect(budgetStatus(10001, 10000).status).toBe("over");
  });

  it("calcula restante e excesso", () => {
    expect(budgetStatus(2500, 10000)).toMatchObject({ percent: 25, remainingCents: 7500, overCents: 0 });
    expect(budgetStatus(12345, 10000)).toMatchObject({ percent: 123, remainingCents: 0, overCents: 2345 });
    expect(budgetStatus(9999, 10000).percent).toBe(99);
  });

  it("rejeita limite zero", () => {
    expect(() => budgetStatus(1, 0)).toThrow(RangeError);
  });
});

describe("expenseSpent", () => {
  const entries: LedgerEntry[] = [
    expense("2026-11-03", 5000),
    expense("2026-11-04", 2000, { categoryId: "lazer" }),
    expense("2026-11-05", 1000, { accountId: BANK }),
    { ...expense("2026-11-05", 99999), type: "income", categoryId: "salario" },
    // Pagamento de fatura: transferência da conta para o cartão — nunca é gasto.
    { ...expense("2026-11-10", 30000), type: "transfer", accountId: BANK, transferAccountId: CARD, categoryId: null },
    expense("2026-10-31", 700),
    expense("2026-12-01", 800),
  ];

  it("só despesas, pela data da compra, dentro do intervalo", () => {
    expect(expenseSpent(entries, { from: "2026-11-01", to: "2026-11-30" })).toBe(8000);
  });

  it("filtra por categoria e por conta", () => {
    const nov = { from: "2026-11-01", to: "2026-11-30" };
    expect(expenseSpent(entries, { ...nov, categoryId: "mercado" })).toBe(6000);
    expect(expenseSpent(entries, { ...nov, accountId: CARD })).toBe(7000);
  });

  it("parcelas contam no mês de cada parcela", () => {
    const parcelas = ["2026-10-15", "2026-11-15", "2026-12-15"].map((date) => expense(date, 10000));
    expect(expenseSpent(parcelas, { from: "2026-11-01", to: "2026-11-30" })).toBe(10000);
    expect(expenseSpent(parcelas, { from: "2026-12-01", to: "2026-12-31" })).toBe(10000);
  });
});

describe("evaluateBudget", () => {
  const entries = [
    expense("2026-10-30", 4000), // sexta da semana que cruza out/nov
    expense("2026-11-01", 5000), // domingo
    expense("2026-11-02", 3000), // segunda: semana nova
    expense("2026-11-02", 1000, { accountId: "outro-cartao" }),
  ];

  it("semanal por cartão usa a semana de hoje, mesmo cruzando o mês", () => {
    const ctx = { month: { year: 2026, month: 11 }, today: "2026-11-01" };
    const weekly = evaluateBudget(
      { id: "b", period: "weekly", categoryId: null, accountId: CARD, limitCents: 10000 },
      entries,
      ctx,
    );
    expect(weekly.range).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(weekly.spentCents).toBe(9000);
    expect(weekly.status).toBe("attention");
  });

  it("vira a semana na segunda", () => {
    const ctx = { month: { year: 2026, month: 11 }, today: "2026-11-02" };
    const weekly = evaluateBudget(
      { id: "b", period: "weekly", categoryId: null, accountId: CARD, limitCents: 10000 },
      entries,
      ctx,
    );
    expect(weekly.spentCents).toBe(3000);
    expect(weekly.status).toBe("ok");
  });

  it("mensal total soma todas as contas e categorias do mês", () => {
    const ctx = { month: { year: 2026, month: 11 }, today: "2026-11-02" };
    const total = evaluateBudget(
      { id: "b", period: "monthly", categoryId: null, accountId: null, limitCents: 8000 },
      entries,
      ctx,
    );
    expect(total.scope).toBe("total");
    expect(total.spentCents).toBe(9000);
    expect(total.status).toBe("over");
    expect(total.overCents).toBe(1000);
  });

  it("barras por dia da semana", () => {
    const days = weeklyByDay(entries, "2026-11-01", CARD);
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(days.map((d) => d.spentCents)).toEqual([0, 0, 0, 0, 4000, 0, 5000]);
  });

  it("semana até hoje vs mesmo trecho da anterior", () => {
    const list = [expense("2026-11-02", 3000), expense("2026-11-03", 1000), expense("2026-10-26", 2000), expense("2026-10-28", 9000)];
    // Terça 03/11: seg+ter desta semana vs seg+ter da anterior.
    expect(weekToDate(list, "2026-11-03")).toEqual({ currentCents: 4000, previousCents: 2000 });
  });
});

describe("monthProjection", () => {
  const nov = { year: 2026, month: 11 }; // 30 dias

  it("no ritmo atual: gasto até hoje / dias passados × dias do mês", () => {
    const entries = [expense("2026-11-02", 10000), expense("2026-11-10", 20000)];
    expect(monthProjection(entries, { month: nov, today: "2026-11-10" })).toEqual({
      kind: "current",
      projectedCents: 90000,
      daysElapsed: 10,
      daysInMonth: 30,
    });
  });

  it("dia 1 não projeta", () => {
    expect(monthProjection([expense("2026-11-01", 10000)], { month: nov, today: "2026-11-01" })).toEqual({
      kind: "too-early",
    });
  });

  it("mês sem gasto projeta zero", () => {
    expect(monthProjection([], { month: nov, today: "2026-11-15" })).toMatchObject({ kind: "current", projectedCents: 0 });
  });

  it("nunca fica abaixo do já lançado (parcela com data futura no mês)", () => {
    const entries = [expense("2026-11-02", 1000), expense("2026-11-28", 50000)];
    expect(monthProjection(entries, { month: nov, today: "2026-11-10" })).toMatchObject({ projectedCents: 51000 });
  });

  it("fevereiro de 28 dias e mês de 31", () => {
    const feb = monthProjection([expense("2026-02-07", 7000)], { month: { year: 2026, month: 2 }, today: "2026-02-14" });
    expect(feb).toMatchObject({ projectedCents: 14000, daysInMonth: 28 });
    const dec = monthProjection([expense("2026-12-02", 10000)], { month: { year: 2026, month: 12 }, today: "2026-12-10" });
    expect(dec).toMatchObject({ projectedCents: 31000, daysInMonth: 31 });
  });

  it("último dia do mês: projeção = gasto real", () => {
    const entries = [expense("2026-11-15", 12345)];
    expect(monthProjection(entries, { month: nov, today: "2026-11-30" })).toMatchObject({ projectedCents: 12345 });
  });

  it("mês passado usa o gasto real; mês futuro não projeta", () => {
    const entries = [expense("2026-10-15", 5000)];
    expect(monthProjection(entries, { month: { year: 2026, month: 10 }, today: "2026-11-10" })).toEqual({
      kind: "past",
      projectedCents: 5000,
    });
    expect(monthProjection(entries, { month: { year: 2026, month: 12 }, today: "2026-11-10" })).toEqual({ kind: "future" });
  });

  it("projeção por categoria", () => {
    const entries = [expense("2026-11-05", 5000), expense("2026-11-05", 5000, { categoryId: "lazer" })];
    expect(monthProjection(entries, { month: nov, today: "2026-11-10", categoryId: "lazer" })).toMatchObject({
      projectedCents: 15000,
    });
  });
});
