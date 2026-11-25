import { describe, expect, it } from "vitest";
import { invoiceByRef } from "./billing";
import { cardPacing, cycleWeeks, type PacingEntry } from "./pacing";

// Cartão fictício: melhor dia 26 → fatura "2026-11" = 26/10 a 25/11 (31 dias; 26/10 é segunda).
const invoice = invoiceByRef("2026-11", { closingDay: 26, dueDay: 5 });
const cycle = { from: invoice.periodStart, to: invoice.periodEnd };
const LIMIT = 31_000;

const expense = (occurredOn: string, amountCents: number): PacingEntry => ({ type: "expense", amountCents, occurredOn });
const pace = (today: string, entries: PacingEntry[] = [], extra = 0) =>
  cardPacing({ limitCents: LIMIT, cycle, today, invoiceEntries: entries, extraCommittedCents: extra });

describe("semanas do ciclo", () => {
  it("corta segunda a domingo nas bordas do ciclo", () => {
    expect(cycle).toEqual({ from: "2026-10-26", to: "2026-11-25" });
    expect(cycleWeeks(cycle)).toEqual([
      { from: "2026-10-26", to: "2026-11-01" },
      { from: "2026-11-02", to: "2026-11-08" },
      { from: "2026-11-09", to: "2026-11-15" },
      { from: "2026-11-16", to: "2026-11-22" },
      { from: "2026-11-23", to: "2026-11-25" },
    ]);
  });

  it("ciclo que começa no meio da semana", () => {
    expect(cycleWeeks({ from: "2026-11-04", to: "2026-11-10" })).toEqual([
      { from: "2026-11-04", to: "2026-11-08" },
      { from: "2026-11-09", to: "2026-11-10" },
    ]);
  });
});

describe("cardPacing", () => {
  it("primeira semana: limite proporcional aos dias", () => {
    const p = pace("2026-10-26");
    expect(p.phase).toBe("current");
    expect(p.current).toMatchObject({ allowanceCents: 7_000, spentCents: 0, remainingCents: 7_000, weekStatus: "ok" });
  });

  it("o que sobra numa semana passa para as próximas", () => {
    const p = pace("2026-11-02");
    expect(p.weeks[0]).toMatchObject({ status: "done", allowanceCents: 7_000, spentCents: 0, balanceCents: 7_000 });
    expect(p.current?.allowanceCents).toBe(Math.floor((31_000 * 7) / 24)); // 9.041
  });

  it("o que passa numa semana sai das próximas", () => {
    const p = pace("2026-11-02", [expense("2026-10-28", 14_000)]);
    expect(p.weeks[0]?.balanceCents).toBe(-7_000);
    expect(p.current?.allowanceCents).toBe(Math.floor((17_000 * 7) / 24)); // 4.958
    expect(p.usedCents).toBe(14_000);
    expect(p.remainingCents).toBe(17_000);
  });

  it("parcelas antigas e extras entram como comprometido", () => {
    const p = pace("2026-10-26", [expense("2026-09-10", 2_000)], 1_100);
    expect(p.committedCents).toBe(3_100);
    expect(p.spentCents).toBe(0);
    expect(p.current?.allowanceCents).toBe(Math.floor((27_900 * 7) / 31)); // 6.300
  });

  it("limite já estourado: semana com 0 e status estourado", () => {
    const p = pace("2026-11-03", [expense("2026-10-27", 40_000), expense("2026-11-03", 100)]);
    expect(p.status).toBe("over");
    expect(p.overCents).toBe(9_100);
    expect(p.current).toMatchObject({ allowanceCents: 0, overCents: 100, weekStatus: "over" });
    expect(p.nextWeeksCents).toBe(0);
  });

  it("receitas (estornos) não contam", () => {
    const p = pace("2026-10-26", [{ type: "income", amountCents: 5_000, occurredOn: "2026-10-26" }]);
    expect(p.usedCents).toBe(0);
  });

  it("última semana curta usa só os dias que faltam", () => {
    const p = pace("2026-11-23", [expense("2026-11-01", 28_000)]);
    expect(p.current).toMatchObject({ from: "2026-11-23", to: "2026-11-25", allowanceCents: 3_000 });
    expect(p.nextWeeksCents).toBeNull();
  });

  it("estimativa das próximas semanas sem gasto novo", () => {
    const p = pace("2026-11-04", [expense("2026-11-03", 5_000)]);
    // Faltam 17 dias depois desta semana (09/11 a 25/11); disponível 26.000.
    expect(p.nextWeeksCents).toBe(Math.floor((26_000 * 7) / 17));
    expect(p.weeks.at(-1)).toMatchObject({ status: "upcoming", spentCents: 0 });
  });

  it("projeção no ritmo atual, a partir do 2º dia", () => {
    expect(pace("2026-10-26", [expense("2026-10-26", 1_000)]).projectedCents).toBeNull();
    const p = pace("2026-10-30", [expense("2026-10-27", 5_000)], 1_000);
    expect(p.projectedCents).toBe(1_000 + Math.round((5_000 * 31) / 5));
  });

  it("ciclo fechado: tudo concluído, sem semana atual", () => {
    const p = pace("2026-12-01", [expense("2026-11-20", 12_000)]);
    expect(p.phase).toBe("past");
    expect(p.current).toBeNull();
    expect(p.weeks.every((w) => w.status === "done")).toBe(true);
    expect(p.projectedCents).toBe(12_000);
  });

  it("ciclo futuro: semanas estimadas pelo ciclo inteiro", () => {
    const p = pace("2026-10-01");
    expect(p.phase).toBe("future");
    expect(p.weeks[0]).toMatchObject({ status: "upcoming", allowanceCents: 7_000 });
  });
});
