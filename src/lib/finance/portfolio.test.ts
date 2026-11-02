import { describe, expect, it } from "vitest";
import {
  allocationByClass,
  investedValueAt,
  isB3ImportStale,
  monthlyInvestedSeries,
  type PortfolioInvestment,
  type Snapshot,
  snapshotsByInvestment,
  variationSincePrevious,
} from "./portfolio";

const inv = (id: string, assetClass: PortfolioInvestment["assetClass"], currentValueCents: number, archivedOn: string | null = null): PortfolioInvestment => ({
  id,
  assetClass,
  currentValueCents,
  archivedOn,
});
const snap = (investmentId: string, takenOn: string, valueCents: number): Snapshot => ({ investmentId, takenOn, valueCents });

const investments = [inv("cdb", "fixed_income", 120000), inv("acao", "stock", 50000), inv("cripto", "crypto", 30000, "2026-10-15")];
const snapshots = [
  snap("cdb", "2026-09-30", 100000),
  snap("cdb", "2026-10-31", 110000),
  snap("cdb", "2026-11-01", 120000),
  snap("acao", "2026-10-10", 40000),
  snap("acao", "2026-11-01", 50000),
  snap("cripto", "2026-09-01", 30000),
];

describe("investedValueAt", () => {
  it("usa o último snapshot até a data", () => {
    expect(investedValueAt("2026-10-05", investments, snapshots)).toBe(100000 + 30000);
    expect(investedValueAt("2026-10-31", investments, snapshots)).toBe(110000 + 40000); // cripto já arquivado
  });

  it("ativo arquivado sai a partir da data de arquivamento", () => {
    expect(investedValueAt("2026-10-14", investments, snapshots)).toBe(100000 + 40000 + 30000);
    expect(investedValueAt("2026-10-15", investments, snapshots)).toBe(100000 + 40000);
  });

  it("antes do primeiro snapshot o ativo vale zero", () => {
    expect(investedValueAt("2026-08-31", investments, snapshots)).toBe(0);
  });

  it("snapshot com data antiga não muda o valor mais recente", () => {
    const withOld = [...snapshots, snap("cdb", "2026-06-30", 90000)];
    expect(investedValueAt("2026-11-02", investments, withOld)).toBe(120000 + 50000);
  });
});

describe("variationSincePrevious", () => {
  const byInvestment = snapshotsByInvestment(snapshots);
  it("último menos o anterior", () => {
    expect(variationSincePrevious(byInvestment.get("cdb"))).toEqual({
      previousValueCents: 110000,
      previousDate: "2026-10-31",
      changeCents: 10000,
    });
  });
  it("um snapshot só: sem variação", () => {
    expect(variationSincePrevious(byInvestment.get("cripto"))).toBeNull();
    expect(variationSincePrevious(undefined)).toBeNull();
  });
});

describe("allocationByClass", () => {
  it("soma por classe, ignora arquivados e ordena do maior", () => {
    const result = allocationByClass([...investments, inv("tesouro", "treasury", 50000), inv("cdb2", "fixed_income", 30000)]);
    expect(result.map((r) => [r.assetClass, r.valueCents])).toEqual([
      ["fixed_income", 150000],
      ["stock", 50000],
      ["treasury", 50000],
    ]);
    expect(result[0]!.share).toBeCloseTo(0.6);
  });
  it("vazio", () => {
    expect(allocationByClass([])).toEqual([]);
  });
});

describe("monthlyInvestedSeries", () => {
  it("fim de cada mês e hoje no mês corrente", () => {
    const series = monthlyInvestedSeries("2026-11-02", investments, snapshots, 3);
    expect(series).toEqual([
      { month: "2026-09", date: "2026-09-30", valueCents: 100000 + 30000 },
      { month: "2026-10", date: "2026-10-31", valueCents: 110000 + 40000 },
      { month: "2026-11", date: "2026-11-02", valueCents: 120000 + 50000 },
    ]);
  });
  it("12 meses por padrão, atravessando o ano", () => {
    const series = monthlyInvestedSeries("2026-02-10", [], []);
    expect(series).toHaveLength(12);
    expect(series[0]!.month).toBe("2025-03");
  });
});

describe("isB3ImportStale", () => {
  it("mais de 35 dias", () => {
    expect(isB3ImportStale("2026-09-28", "2026-11-02")).toBe(false); // 35 dias
    expect(isB3ImportStale("2026-09-27", "2026-11-02")).toBe(true);
  });
});
