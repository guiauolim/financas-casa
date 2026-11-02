import { addMonthsYM, daysBetween, monthRange, toYearMonth, yearMonthOf } from "./dates";

// Regras da carteira de investimentos. O histórico vem dos snapshots (um valor por ativo
// por data); o valor de um ativo numa data é o do último snapshot até ela.

export const ASSET_CLASSES = ["stock", "fii", "etf", "fixed_income", "treasury", "crypto", "fund", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  stock: "Ação",
  fii: "FII",
  etf: "ETF",
  fixed_income: "Renda fixa",
  treasury: "Tesouro",
  crypto: "Cripto",
  fund: "Fundo",
  other: "Outro",
};

export type PortfolioInvestment = {
  id: string;
  assetClass: AssetClass;
  currentValueCents: number;
  archivedOn: string | null; // vendido/resgatado nesta data: fora dos totais a partir dela
};

export type Snapshot = { investmentId: string; takenOn: string; valueCents: number };

export const isActiveOn = (investment: Pick<PortfolioInvestment, "archivedOn">, date: string) =>
  investment.archivedOn === null || investment.archivedOn > date;

// Snapshots agrupados por ativo, em ordem de data.
export function snapshotsByInvestment(snapshots: readonly Snapshot[]): Map<string, Snapshot[]> {
  const map = new Map<string, Snapshot[]>();
  for (const snapshot of snapshots) {
    const list = map.get(snapshot.investmentId);
    if (list) list.push(snapshot);
    else map.set(snapshot.investmentId, [snapshot]);
  }
  for (const list of map.values()) list.sort((a, b) => a.takenOn.localeCompare(b.takenOn));
  return map;
}

function valueOn(list: readonly Snapshot[] | undefined, date: string): number {
  let value = 0;
  for (const snapshot of list ?? []) {
    if (snapshot.takenOn > date) break;
    value = snapshot.valueCents;
  }
  return value;
}

// Total investido numa data: soma do último snapshot até a data dos ativos que ainda
// não tinham sido arquivados nela.
export function investedValueAt(
  date: string,
  investments: readonly PortfolioInvestment[],
  snapshots: readonly Snapshot[] | Map<string, Snapshot[]>,
): number {
  const byInvestment = snapshots instanceof Map ? snapshots : snapshotsByInvestment(snapshots);
  return investments
    .filter((investment) => isActiveOn(investment, date))
    .reduce((sum, investment) => sum + valueOn(byInvestment.get(investment.id), date), 0);
}

export type Variation = { previousValueCents: number; previousDate: string; changeCents: number };

// Variação do último snapshot em relação ao anterior. null se só há um.
export function variationSincePrevious(list: readonly Snapshot[] | undefined): Variation | null {
  if (!list || list.length < 2) return null;
  const last = list[list.length - 1]!;
  const previous = list[list.length - 2]!;
  return {
    previousValueCents: previous.valueCents,
    previousDate: previous.takenOn,
    changeCents: last.valueCents - previous.valueCents,
  };
}

export type ClassAllocation = { assetClass: AssetClass; valueCents: number; share: number };

// Distribuição por classe dos ativos não arquivados (maior primeiro). `share` de 0 a 1.
export function allocationByClass(investments: readonly PortfolioInvestment[]): ClassAllocation[] {
  const totals = new Map<AssetClass, number>();
  for (const investment of investments) {
    if (investment.archivedOn !== null) continue;
    totals.set(investment.assetClass, (totals.get(investment.assetClass) ?? 0) + investment.currentValueCents);
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .filter(([, valueCents]) => valueCents !== 0)
    .map(([assetClass, valueCents]) => ({ assetClass, valueCents, share: total > 0 ? valueCents / total : 0 }))
    .sort((a, b) => b.valueCents - a.valueCents);
}

export type InvestedPoint = { month: string; date: string; valueCents: number };

// Patrimônio investido no fim de cada mês (o mês corrente usa hoje), do mais antigo ao atual.
export function monthlyInvestedSeries(
  today: string,
  investments: readonly PortfolioInvestment[],
  snapshots: readonly Snapshot[],
  months = 12,
): InvestedPoint[] {
  const byInvestment = snapshotsByInvestment(snapshots);
  const current = yearMonthOf(today);
  return Array.from({ length: months }, (_, i) => {
    const ym = addMonthsYM(current, i - (months - 1));
    const date = i === months - 1 ? today : monthRange(ym).to;
    return { month: toYearMonth(ym), date, valueCents: investedValueAt(date, investments, byInvestment) };
  });
}

export const B3_STALE_DAYS = 35;

// Última posição da B3 com mais de 35 dias: hora de exportar de novo.
export function isB3ImportStale(referenceDate: string, today: string, maxDays = B3_STALE_DAYS): boolean {
  return daysBetween(referenceDate, today) > maxDays;
}
