// Gera a fixture FICTÍCIA do Excel de posição da B3 usada nos testes do importador.
// Mesmo layout do arquivo real (abas, cabeçalhos, "-", datas em texto, linha vazia,
// linha "Total"), mas com tickers, códigos, instituições e valores INVENTADOS.
// Uso: node scripts/make-b3-fixture.mjs
import { writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const OUT = new URL("../src/lib/importers/__fixtures__/b3-posicao-ficticia.xlsx", import.meta.url);

// Após os dados: linha vazia, rótulos "Total" e totais (como a B3 exporta).
function withFooter(header, rows, totalCols) {
  const labels = header.map((_, i) => (totalCols.includes(i) ? "Total" : ""));
  const totals = header.map((_, i) =>
    totalCols.includes(i) ? rows.reduce((s, r) => s + (typeof r[i] === "number" ? r[i] : 0), 0) : "",
  );
  return [header, ...rows, [""], labels, totals];
}

const equityHeader = [
  "Produto", "Instituição", "Conta", "Código de Negociação", "CNPJ da Empresa", "Código ISIN / Distribuição",
  "Tipo", "Escriturador", "Quantidade", "Quantidade Disponível", "Quantidade Indisponível", "Motivo",
  "Preço de Fechamento", "Valor Atualizado",
];
const eq = (produto, inst, ticker, qty, price) => [
  produto, inst, "000001", ticker, "00.000.000/0001-00", `BRFAKEACNOR${ticker.length}`, "ON", "ESCRITURADOR FICTICIO",
  qty, qty, 0, "-", price, Math.round(qty * price * 100) / 100,
];

const fiiHeader = equityHeader.map((h) => (h === "CNPJ da Empresa" ? "CNPJ do Fundo" : h === "Escriturador" ? "Administrador" : h));

const rfHeader = [
  "Produto", "Instituição", "Emissor", "Código", "Indexador", "Tipo de regime", "Data de Emissão", "Vencimento",
  "Quantidade", "Quantidade Disponível", "Quantidade Indisponível", "Motivo", "Contraparte",
  "Preço Atualizado MTM", "Valor Atualizado MTM", "Preço Atualizado CURVA", "Valor Atualizado CURVA",
  "Preço Atualizado FECHAMENTO", "Valor Atualizado FECHAMENTO",
];

const tdHeader = [
  "Produto", "Instituição", "Código ISIN", "Indexador", "Vencimento", "Quantidade", "Quantidade Disponível",
  "Quantidade Indisponível", "Motivo", "Valor Aplicado", "Valor bruto", "Valor líquido", "Valor Atualizado",
];

const sheets = {
  Acoes: withFooter(
    equityHeader,
    [
      eq("FAKE3 - EMPRESA FICTICIA S.A.", "CORRETORA EXEMPLO S.A.", "FAKE3", 100, 12.34),
      eq("TSTE4 - TESTE PARTICIPACOES S.A.", "CORRETORA EXEMPLO S.A.", "TSTE4", 50, 20),
      // mesmo ativo em outra conta da mesma corretora: soma
      eq("TSTE4 - TESTE PARTICIPACOES S.A.", "CORRETORA EXEMPLO S.A.", "TSTE4", 10, 20),
    ],
    [13],
  ),
  BDR: withFooter(equityHeader, [eq("FAKE34 - FICTIONAL CORP", "CORRETORA EXEMPLO S.A.", "FAKE34", 7, 50.5)], [13]),
  ETF: withFooter(equityHeader, [eq("FICT11 - ETF FICTICIO", "OUTRA CORRETORA LTDA", "FICT11", 30, 99.9)], [13]),
  "Fundo de Investimento": withFooter(
    fiiHeader,
    [eq("TSTE11 - FII TESTE IMOBILIARIO", "CORRETORA EXEMPLO S.A.", "TSTE11", 15, 101.01)],
    [13],
  ),
  "Renda Fixa": withFooter(
    rfHeader,
    [
      ["CDB - BANCO FICTICIO S/A", "BANCO FICTICIO S/A", "BANCO FICTICIO S/A", "CDBFICT001", "DI", "REGISTRADO",
        "10/01/2025", "15/07/2029", 1500, 1500, "-", "-", "-", "-", "-", 1.07654321, 1614.81, "-", "-"],
      // CURVA vazia: usa o MTM; valor em texto BR
      ["LCI - BANCO EXEMPLO S.A.", "BANCO EXEMPLO S.A.", "BANCO EXEMPLO S.A.", "LCIFICT002", "DI", "REGISTRADO",
        "05/06/2025", "20/12/2030", 2, 2, "-", "-", "-", "1.010,00", "2.020,00", "-", "-", "-", "-"],
    ],
    [16, 18],
  ),
  "Tesouro Direto": withFooter(
    tdHeader,
    [
      ["Tesouro IPCA+ 2099", "CORRETORA EXEMPLO S.A.", "BRSTNFICT001", "IPCA", "15/05/2099", 1.5, 1.5, 0, "-",
        3000, 3210.45, 3150.4, 3210.45],
      // mesmo título em outra instituição: ativo separado
      ["Tesouro IPCA+ 2099", "OUTRA CORRETORA LTDA", "BRSTNFICT001", "IPCA", "15/05/2099", 0.25, 0.25, 0, "-",
        500, 535.08, 525.07, 535.08],
      ["Tesouro Prefixado 2098", "CORRETORA EXEMPLO S.A.", "BRSTNFICT002", "prefixado", "01/01/2098", 2, 2, 0, "-",
        1600, 1700.1, 1680.9, 1700.1],
    ],
    [12],
  ),
  // aba que o importador não conhece: ignorada
  Proventos: [["Produto", "Valor"], ["FAKE3", 1]],
};

const workbook = XLSX.utils.book_new();
for (const [name, rows] of Object.entries(sheets)) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
}
workbook.Props = { CreatedDate: new Date("2026-10-31T15:00:00Z") };
writeFileSync(OUT, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
console.log(`fixture gerada: ${OUT.pathname}`);
