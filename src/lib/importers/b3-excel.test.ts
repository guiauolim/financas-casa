import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  B3ImportError,
  b3ExternalId,
  decimalToCents,
  detectReferenceDate,
  diffB3Import,
  parseB3Position,
  toCents,
  toDecimalString,
  toISO,
} from "./b3-excel";

// Fixture FICTÍCIA (gerada por scripts/make-b3-fixture.mjs), mesmo layout do arquivo da B3.
const fixture = readFileSync(new URL("./__fixtures__/b3-posicao-ficticia.xlsx", import.meta.url));

function workbookBytes(sheets: Record<string, unknown[][]>): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe("normalização de números e datas BR", () => {
  it("decimal a partir de número ou texto BR", () => {
    expect(toDecimalString(1614.81)).toBe("1614.81");
    expect(toDecimalString("1.234,56")).toBe("1234.56");
    expect(toDecimalString("R$ 2.020,00")).toBe("2020.00");
    expect(toDecimalString("1.234")).toBe("1234");
    expect(toDecimalString("0,25")).toBe("0.25");
    expect(toDecimalString("-")).toBeNull();
    expect(toDecimalString("")).toBeNull();
    expect(toDecimalString("abc")).toBeNull();
    expect(toDecimalString(1e-7)).toBe("0.0000001");
  });

  it("centavos arredondando meio para cima, sem float", () => {
    expect(decimalToCents("1.005")).toBe(101);
    expect(decimalToCents("1.004")).toBe(100);
    expect(decimalToCents("10")).toBe(1000);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("-")).toBeNull();
  });

  it("datas dd/mm/aaaa e serial do Excel", () => {
    expect(toISO("02/03/2026")).toBe("2026-03-02");
    expect(toISO("31/02/2026")).toBeNull();
    expect(toISO(46083)).toBe("2026-03-02");
    expect(toISO("-")).toBeNull();
  });

  it("identificador por código + instituição normalizada", () => {
    expect(b3ExternalId("fake3", "Corretora  Exemplo S.A.")).toBe("FAKE3|CORRETORA EXEMPLO S.A.");
    expect(b3ExternalId("BRSTN1", "Instituição Ñ")).toBe("BRSTN1|INSTITUICAO N");
  });
});

describe("parseB3Position (fixture fictícia)", () => {
  const position = parseB3Position(fixture, "posicao-2026-10-30-18-01-02.xlsx");
  const byId = new Map(position.assets.map((a) => [a.externalId, a]));

  it("reconhece as abas de posição e ignora as outras", () => {
    expect(position.sheets).toEqual(["Acoes", "BDR", "ETF", "Fundo de Investimento", "Renda Fixa", "Tesouro Direto"]);
    expect(position.ignoredSheets).toEqual(["Proventos"]);
  });

  it("mapeia cada aba para a classe e ignora linhas vazias e de total", () => {
    const classes = Object.fromEntries(position.assets.map((a) => [a.code, a.assetClass]));
    expect(classes).toMatchObject({
      FAKE3: "stock",
      TSTE4: "stock",
      FAKE34: "stock",
      FICT11: "etf",
      TSTE11: "fii",
      CDBFICT001: "fixed_income",
      LCIFICT002: "fixed_income",
      BRSTNFICT002: "treasury",
    });
    expect(position.assets).toHaveLength(10);
  });

  it("ações: valor atualizado e quantidade", () => {
    expect(byId.get("FAKE3|CORRETORA EXEMPLO S.A.")).toMatchObject({
      name: "FAKE3 - EMPRESA FICTICIA S.A.",
      institution: "CORRETORA EXEMPLO S.A.",
      quantity: "100",
      valueCents: 123400,
      netValueCents: null,
      avgPriceCents: null,
    });
  });

  it("mesmo ativo em duas linhas da mesma instituição: soma", () => {
    expect(byId.get("TSTE4|CORRETORA EXEMPLO S.A.")).toMatchObject({ quantity: "60", valueCents: 120000 });
  });

  it("renda fixa: CURVA; se vier \"-\", usa o MTM (texto BR)", () => {
    expect(byId.get("CDBFICT001|BANCO FICTICIO S/A")).toMatchObject({ valueCents: 161481, quantity: "1500" });
    expect(byId.get("LCIFICT002|BANCO EXEMPLO S.A.")).toMatchObject({ valueCents: 202000 });
  });

  it("tesouro: valor bruto, líquido só informativo, preço médio pelo aplicado", () => {
    expect(byId.get("BRSTNFICT001|CORRETORA EXEMPLO S.A.")).toMatchObject({
      quantity: "1.5",
      valueCents: 321045,
      netValueCents: 315040,
      avgPriceCents: 200000,
    });
    // mesmo título em outra instituição é outro ativo
    expect(byId.get("BRSTNFICT001|OUTRA CORRETORA LTDA")).toMatchObject({ quantity: "0.25", valueCents: 53508 });
  });

  it("data de referência pelo nome do arquivo", () => {
    expect(position.referenceDate).toBe("2026-10-30");
  });

  it("sem data no nome: usa a data de criação do arquivo", () => {
    expect(parseB3Position(fixture, "minha-carteira.xlsx").referenceDate).toBe("2026-10-31");
  });
});

describe("detectReferenceDate", () => {
  it("nome padrão da B3, criação do arquivo ou nada", () => {
    expect(detectReferenceDate("posicao-2026-11-01-10-00-00.xlsx", null)).toBe("2026-11-01");
    expect(detectReferenceDate("posicao-2026-13-01.xlsx", null)).toBeNull();
    expect(detectReferenceDate(null, new Date("2026-11-02T02:00:00Z"))).toBe("2026-11-01"); // fuso de SP
    expect(detectReferenceDate("x.xlsx", undefined)).toBeNull();
  });
});

describe("erros de estrutura em PT-BR", () => {
  it("não é Excel", () => {
    expect(() => parseB3Position(new TextEncoder().encode("Produto;Valor\n"))).toThrow(
      new B3ImportError("O arquivo não é uma planilha Excel (.xlsx ou .xls)."),
    );
  });

  it("nenhuma aba reconhecida", () => {
    expect(() => parseB3Position(workbookBytes({ Planilha1: [["a"]] }))).toThrow(/Nenhuma aba de posição reconhecida/);
  });

  it("coluna obrigatória faltando diz a aba e a coluna", () => {
    const bytes = workbookBytes({
      "Tesouro Direto": [
        ["Produto", "Instituição", "Código ISIN", "Quantidade"],
        ["Tesouro X", "CORRETORA", "BRSTNX", 1],
      ],
    });
    expect(() => parseB3Position(bytes)).toThrow('Aba "Tesouro Direto": coluna "Valor bruto" não encontrada.');
  });

  it("linha sem valor diz a linha e o código", () => {
    const bytes = workbookBytes({
      Acoes: [
        ["Produto", "Instituição", "Código de Negociação", "Quantidade", "Valor Atualizado"],
        ["FAKE3", "CORRETORA", "FAKE3", 1, "-"],
      ],
    });
    expect(() => parseB3Position(bytes)).toThrow('Aba "Acoes", linha 2 (FAKE3): valor atualizado não encontrado.');
  });

  it("aba reconhecida vazia não quebra", () => {
    const bytes = workbookBytes({ ETF: [], Acoes: [["Produto", "Instituição", "Código de Negociação", "Quantidade", "Valor Atualizado"]] });
    expect(parseB3Position(bytes).assets).toEqual([]);
  });
});

describe("diffB3Import", () => {
  const { assets } = parseB3Position(fixture, "posicao-2026-10-30.xlsx");
  it("separa novos, atualizados (inclusive reativados) e sumidos", () => {
    const diff = diffB3Import(assets, [
      { id: "1", externalId: "FAKE3|CORRETORA EXEMPLO S.A.", name: "Fake", currentValueCents: 100000, quantity: "100", archived: false },
      { id: "2", externalId: "FICT11|OUTRA CORRETORA LTDA", name: "ETF", currentValueCents: 1, quantity: "1", archived: true },
      { id: "3", externalId: "VENDIDO3|CORRETORA EXEMPLO S.A.", name: "Vendido", currentValueCents: 5000, quantity: "5", archived: false },
      { id: "4", externalId: "ANTIGO3|CORRETORA EXEMPLO S.A.", name: "Antigo", currentValueCents: 0, quantity: null, archived: true },
    ]);
    expect(diff.created).toHaveLength(8);
    expect(diff.updated.map((u) => [u.id, u.oldValueCents, u.valueCents, u.reactivated])).toEqual([
      ["1", 100000, 123400, false],
      ["2", 1, 299700, true],
    ]);
    expect(diff.missing.map((m) => m.id)).toEqual(["3"]);
  });
});
