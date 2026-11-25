import { describe, expect, it } from "vitest";
import { buildInsights, categoryTrends, type InsightsInput, topMerchants } from "./insights";
import { purchaseMonthOf } from "./ledger";

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

describe("insights do ritmo, contas fixas, categorias e comércios", () => {
  const pacing = (extra: Partial<NonNullable<InsightsInput["pacing"]>> = {}) => ({
    cardName: "Cartão X",
    allowanceCents: 70_000,
    spentCents: 10_000,
    lastWeekBalanceCents: null,
    nextWeeksCents: 60_000,
    ...extra,
  });

  it("semana que passou do liberado é a mais grave", () => {
    expect(texts({ ...base, pacing: pacing({ spentCents: 80_000 }) })).toEqual([
      "Cartão X: a semana passou R$ 100,00 do liberado. Para fechar a fatura no limite, as próximas semanas têm cerca de R$ 600,00 cada.",
    ]);
  });

  it("sobra da semana passada aumenta esta", () => {
    const [insight] = buildInsights({ ...base, pacing: pacing({ lastWeekBalanceCents: 15_000 }) });
    expect(insight?.tone).toBe("positive");
    expect(normalize(insight!.text)).toBe(
      "Cartão X: na semana passada sobraram R$ 150,00, então esta semana dá R$ 700,00 (ainda faltam R$ 600,00).",
    );
  });

  it("perto do liberado avisa; com o limite da fatura não compara semana x semana", () => {
    const result = buildInsights({
      ...base,
      pacing: pacing({ spentCents: 60_000 }),
      week: { currentCents: 50_000, previousCents: 10_000 },
    });
    expect(result.map((i) => i.id)).toEqual(["pacing"]);
    expect(result[0]?.tone).toBe("warning");
  });

  it("conta fixa atrasada e as que vencem em breve", () => {
    expect(texts({ ...base, bills: [{ name: "Luz", dueDate: "2026-11-08", amountCents: 15_000, late: true }] })).toEqual([
      "A conta fixa Luz venceu em 08/11 e ainda não foi lançada.",
    ]);
    expect(
      texts({
        ...base,
        bills: [
          { name: "Luz", dueDate: "2026-11-12", amountCents: 15_000, late: false },
          { name: "Internet", dueDate: "2026-11-13", amountCents: 10_000, late: false },
          { name: "Aluguel", dueDate: "2026-11-20", amountCents: 200_000, late: false },
        ],
      }),
    ).toEqual(["2 contas fixas vencem nos próximos 3 dias (R$ 250,00)."]);
  });

  it("categoria acima da média só com 20% e R$ 100 de diferença", () => {
    const trend = (currentCents: number, averageCents: number) => ({ ...base, trends: [{ name: "Restaurantes", currentCents, averageCents }] });
    expect(texts(trend(60_000, 40_000))).toEqual([
      "Restaurantes: R$ 600,00 no mês, 50% acima da média dos últimos 3 meses (R$ 400,00).",
    ]);
    expect(texts(trend(15_000, 10_000))).toEqual([]); // 50%, mas só R$ 50
    expect(texts(trend(1_100_000, 1_000_000))).toEqual([]); // R$ 1.000, mas só 10%
  });

  it("maiores comércios da fatura (informativo)", () => {
    expect(
      texts({ ...base, merchants: { cardName: "Cartão X", items: [{ name: "Loja A", cents: 30_000 }, { name: "Loja B", cents: 20_000 }] } }),
    ).toEqual(["Maiores gastos da fatura do Cartão X: Loja A (R$ 300,00), Loja B (R$ 200,00)."]);
  });
});

describe("categoryTrends e topMerchants", () => {
  const e = (occurredOn: string, amountCents: number, categoryId = "rest") => ({
    type: "expense" as const,
    amountCents,
    occurredOn,
    accountId: "bank",
    transferAccountId: null,
    categoryId,
  });

  it("média dos 3 meses anteriores, só com histórico", () => {
    const entries = [e("2026-08-10", 30_000), e("2026-09-10", 30_000), e("2026-10-10", 30_000), e("2026-11-05", 50_000), e("2026-11-05", 9_000, "novo")];
    expect(
      categoryTrends(entries, { month: { year: 2026, month: 11 }, monthOf: purchaseMonthOf, names: new Map([["rest", "Restaurantes"]]) }),
    ).toEqual([{ name: "Restaurantes", currentCents: 50_000, averageCents: 30_000 }]);
  });

  it("agrupa pela descrição normalizada", () => {
    expect(
      topMerchants([
        { type: "expense", amountCents: 1_000, description: "LOJA EXEMPLO" },
        { type: "expense", amountCents: 2_500, description: "Loja Exemplo" },
        { type: "expense", amountCents: 3_000, description: "Padaria Fictícia" },
        { type: "income", amountCents: 9_000, description: "Estorno" },
        { type: "expense", amountCents: 100, description: null },
      ]),
    ).toEqual([
      { name: "LOJA EXEMPLO", cents: 3_500 },
      { name: "Padaria Fictícia", cents: 3_000 },
    ]);
  });
});
