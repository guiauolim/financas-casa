// Gera as fixtures FICTÍCIAS de fatura do cartão Itaú usadas nos testes do importador.
// Mesmo layout do arquivo exportado pelo banco (resumo "Cartão | Valor | Vencimento",
// bloco "Lançamentos", "Subtotal" e "Importante saber"), mas com nomes, finais de cartão,
// comércios e valores INVENTADOS. Duas faturas consecutivas (parcelas que atravessam as
// duas, estorno, IOF, encargos, pagamento, linhas idênticas no mesmo dia) e a 1ª também
// em .xls (BIFF8).
// Uso: node scripts/make-itau-fixture.mjs
import { writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const DIR = new URL("../src/lib/importers/__fixtures__/", import.meta.url);

const serial = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
};

const ANA = ["Titular", "Ana Exemplo", "Físico", "****1111"];
const ANA_VIRTUAL = ["Titular", "Ana Exemplo", "Virtual recorrente", "****3333"];
const BRUNO = ["Adicional", "Bruno Teste", "Físico", "****2222"];

// [data, lançamento, parcelamento, valor, câmbio, portador]
const FATURAS = [
  {
    file: "itau-fatura-ficticia-1",
    sheet: "Fatura 03-26",
    title: "Fatura Paga - Março/2026",
    due: "2026-03-10",
    lines: [
      ["2026-02-05", "Pagamento Com Saldo", null, -1500, null, ANA],
      ["2026-03-01", "Supermercado Exemplobrasiliabra", null, 152.3, null, ANA],
      ["2026-02-28", "Uber Uber *Trip Exemplocuritibabra", null, 18.9, null, ANA],
      ["2026-02-28", "Uber Uber *Trip Exemplocuritibabra", null, 18.9, null, ANA],
      ["2026-02-27", "Ifd*Cantina Imaginariabrasiliabra", null, 64.5, null, BRUNO],
      ["2026-02-20", "Servicoxyznew Yorkusa", null, 54.5, "USD 10,00 \n(cotação R$ 5,45)", ANA_VIRTUAL],
      ["2026-02-20", "Iof Internacional - Servicoxyznew Yorkusa", null, 1.91, null, ANA_VIRTUAL],
      ["2026-02-15", "Mp *Lojaficticiacuritibabra", "Parcela 1 de 3", 100.02, null, BRUNO],
      ["2026-02-10", "Estorno Loja Ficticia", null, -30, null, BRUNO],
      ["2026-02-08", "Xpto Comercio Ficticiobrasiliabra", null, 45, null, ANA],
      ["2026-02-03", "Anuidade Diferenciada", null, 35, null, ANA],
      ["2026-01-12", "Moveis Inventadoscuritibabra", "Parcela 2 de 4", 250, null, ANA],
    ],
  },
  {
    file: "itau-fatura-ficticia-2",
    sheet: "Fatura 04-26",
    title: "Fatura Paga - Abril/2026",
    due: "2026-04-10",
    lines: [
      ["2026-03-06", "Pagamento Com Saldo", null, -711.03, null, ANA],
      ["2026-04-01", "Multa", null, 10, null, ANA],
      ["2026-04-01", "Juros De Mora", null, 2.5, null, ANA],
      ["2026-03-20", "Drogaria Modelo 1234brasiliabra", null, 89.9, null, BRUNO],
      ["2026-03-15", "Pet Shop Fofinhobrasiliabra", null, 120, null, ANA],
      ["2026-03-05", "Auto Posto Ficticiobrasiliabra", null, 200, null, ANA],
      ["2026-02-15", "Mp *Lojaficticiacuritibabra", "Parcela 2 de 3", 100, null, BRUNO],
      ["2026-01-12", "Moveis Inventadoscuritibabra", "Parcela 3 de 4", 250, null, ANA],
    ],
  },
];

function sheetFor({ title, due, lines }) {
  const total = Math.round(lines.filter((l) => l[1] !== "Pagamento Com Saldo").reduce((s, l) => s + l[3] * 100, 0)) / 100;
  const pad = (row) => [null, ...row, ...Array(Math.max(0, 9 - row.length)).fill(null)];
  const rows = [
    [" "],
    [],
    pad(["Nome", "Ana Exemplo Ficticia Teste"]),
    pad(["Agência", "0000"]),
    pad(["Conta", "00000-0"]),
    [],
    [],
    pad([title]),
    pad(["Cartão", null, null, null, null, "Valor", null, "Vencimento", null]),
    pad([
      "Itau Exemplo Platinum Mastercard - final 1111",
      null,
      `Você pagou R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de  `,
      null,
      null,
      total,
      null,
      serial(due),
      null,
    ]),
    [],
    [],
    pad(["Lançamentos"]),
    pad(["Data", "Lançamento", "Parcelamento", "Valor", null, "Titularidade", "Nome", "Tipo do cartão", "Número do cartão"]),
    ...lines.map(([date, desc, inst, value, fx, holder]) => pad([serial(date), desc, inst, value, fx, ...holder])),
    [],
    pad([null, null, "Subtotal  "]),
    [],
    [],
    [],
    pad(["Importante saber"]),
    pad(["Texto informativo fictício do rodapé da fatura."]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Datas como data (formato dd/mm/aaaa), como o banco exporta.
  for (const [address, cell] of Object.entries(ws)) {
    if (address.startsWith("!")) continue;
    const { c } = XLSX.utils.decode_cell(address);
    if (cell.t === "n" && (c === 1 || c === 8) && cell.v > 40000) cell.z = "dd/mm/yyyy";
  }
  ws["!merges"] = [
    { s: { r: 8, c: 1 }, e: { r: 8, c: 5 } },
    { s: { r: 8, c: 6 }, e: { r: 8, c: 7 } },
    { s: { r: 8, c: 8 }, e: { r: 8, c: 9 } },
    { s: { r: 9, c: 1 }, e: { r: 9, c: 2 } },
    { s: { r: 9, c: 3 }, e: { r: 9, c: 5 } },
    { s: { r: 9, c: 6 }, e: { r: 9, c: 7 } },
    { s: { r: 9, c: 8 }, e: { r: 9, c: 9 } },
  ];
  return ws;
}

for (const [index, fatura] of FATURAS.entries()) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFor(fatura), fatura.sheet);
  writeFileSync(new URL(`${fatura.file}.xlsx`, DIR), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  if (index === 0) {
    writeFileSync(new URL("itau-fatura-ficticia.xls", DIR), XLSX.write(wb, { type: "buffer", bookType: "biff8" }));
  }
}
console.log("Fixtures geradas em", DIR.pathname);
