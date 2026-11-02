import { describe, expect, it } from "vitest";
import { addMonthsToDate, addMonthsYM, monthRange, parseISODate, parseYearMonth, todayInSaoPaulo } from "./dates";

describe("dates", () => {
  it("valida datas de calendário", () => {
    expect(parseISODate("2026-02-29")).toBeNull();
    expect(parseISODate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseISODate("2026-13-01")).toBeNull();
    expect(parseYearMonth("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseYearMonth("2026-00")).toBeNull();
  });

  it("soma meses", () => {
    expect(addMonthsYM({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonthsYM({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDate("2026-01-31", 2)).toBe("2026-03-31");
  });

  it("intervalo do mês", () => {
    expect(monthRange({ year: 2026, month: 2 })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("hoje no fuso de São Paulo", () => {
    // 01/11 02:00 UTC ainda é 31/10 em São Paulo (UTC-3).
    expect(todayInSaoPaulo(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10-31");
    expect(todayInSaoPaulo(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11-01");
  });
});
