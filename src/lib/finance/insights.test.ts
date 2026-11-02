import { describe, expect, it } from "vitest";
import { buildInsights, type InsightsInput } from "./insights";

const base: InsightsInput = {
  today: "2026-11-10",
  isCurrentMonth: true,
  monthlyTotal: null,
  categories: [],
  invoices: [],
  week: null,
};

// Intl usa espaço não separável depois de "R$".
const normalize = (text: string) => text.replace(/ /g, " ");
const texts = (input: InsightsInput) => buildInsights(input).map((i) => normalize(i.text));

describe("buildInsights", () => {
  it("sem dados, sem insights", () => {
    expect(buildInsights(base)).toEqual([]);
  });

  it("projeção acima do orçamento", () => {
    const [insight] = buildInsights({
      ...base,
      monthlyTotal: { limitCents: 300000, spentCents: 150000, projectedCents: 450000 },
    });
    expect(insight?.tone).toBe("warning");
    expect(normalize(insight!.text)).toBe("No ritmo atual, o mês fecha em R$ 4.500,00, R$ 1.500,00 acima do orçamento.");
  });

  it("projeção dentro do orçamento é positiva; sem projeção (dia 1) não diz nada", () => {
    expect(
      buildInsights({ ...base, monthlyTotal: { limitCents: 300000, spentCents: 50000, projectedCents: 150000 } })[0]?.tone,
    ).toBe("positive");
    expect(buildInsights({ ...base, monthlyTotal: { limitCents: 300000, spentCents: 5000, projectedCents: null } })).toEqual([]);
  });

  it("orçamento já estourado", () => {
    expect(texts({ ...base, monthlyTotal: { limitCents: 1000, spentCents: 1500, projectedCents: 3000 } })).toEqual([
      "O gasto do mês já passou R$ 5,00 acima do orçamento.",
    ]);
  });

  it("categoria mais estourada (por valor acima do limite)", () => {
    const result = texts({
      ...base,
      categories: [
        { name: "Lazer", spentCents: 15000, limitCents: 10000 },
        { name: "Mercado", spentCents: 120000, limitCents: 100000 },
      ],
    });
    expect(result).toEqual(["Mercado estourou: R$ 200,00 acima do limite."]);
  });

  it("sem estouro, avisa a categoria mais perto do limite", () => {
    const result = texts({
      ...base,
      categories: [
        { name: "Lazer", spentCents: 8000, limitCents: 10000 },
        { name: "Mercado", spentCents: 95000, limitCents: 100000 },
        { name: "Farmácia", spentCents: 100, limitCents: 10000 },
      ],
    });
    expect(result).toEqual(["Mercado já usou 95% do orçamento do mês."]);
  });

  it("fatura que vence em até 7 dias (e não as mais distantes ou pagas)", () => {
    const invoices = [
      { cardName: "Itaú", remainingCents: 10000, dueDate: "2026-11-25" },
      { cardName: "Nubank", remainingCents: 0, dueDate: "2026-11-11" },
      { cardName: "Inter", remainingCents: 52300, dueDate: "2026-11-15" },
    ];
    expect(texts({ ...base, invoices })).toEqual(["A fatura do Inter, de R$ 523,00, vence em 5 dias (15/11)."]);
    expect(texts({ ...base, invoices: [{ cardName: "Inter", remainingCents: 100, dueDate: "2026-11-11" }] })).toEqual([
      "A fatura do Inter, de R$ 1,00, vence amanhã.",
    ]);
  });

  it("fatura vencida é perigo", () => {
    const [insight] = buildInsights({ ...base, invoices: [{ cardName: "Inter", remainingCents: 100, dueDate: "2026-11-05" }] });
    expect(insight?.tone).toBe("danger");
  });

  it("semana vs semana anterior, só com diferença relevante", () => {
    expect(texts({ ...base, week: { currentCents: 12500, previousCents: 10000 } })).toEqual([
      "Gastos da semana: R$ 125,00, 25% a mais que no mesmo ponto da semana passada.",
    ]);
    expect(buildInsights({ ...base, week: { currentCents: 10500, previousCents: 10000 } })).toEqual([]);
    expect(buildInsights({ ...base, week: { currentCents: 10500, previousCents: 0 } })).toEqual([]);
    expect(buildInsights({ ...base, week: { currentCents: 5000, previousCents: 10000 } })[0]?.tone).toBe("positive");
  });

  it("no máximo 3, os mais graves primeiro", () => {
    const result = buildInsights({
      ...base,
      monthlyTotal: { limitCents: 300000, spentCents: 150000, projectedCents: 450000 },
      categories: [{ name: "Mercado", spentCents: 120000, limitCents: 100000 }],
      invoices: [{ cardName: "Inter", remainingCents: 100, dueDate: "2026-11-12" }],
      week: { currentCents: 20000, previousCents: 10000 },
    });
    expect(result.map((i) => i.id)).toEqual(["category", "month", "invoice"]);
  });

  it("mês passado: só o resultado do mês e das categorias", () => {
    const result = buildInsights({
      ...base,
      isCurrentMonth: false,
      monthlyTotal: { limitCents: 300000, spentCents: 200000, projectedCents: 200000 },
      invoices: [{ cardName: "Inter", remainingCents: 100, dueDate: "2026-11-12" }],
      week: { currentCents: 20000, previousCents: 10000 },
    });
    expect(result.map((i) => normalize(i.text))).toEqual(["O mês fechou dentro do orçamento, com R$ 1.000,00 de folga."]);
  });
});
