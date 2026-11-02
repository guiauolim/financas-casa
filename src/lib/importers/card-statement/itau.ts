import type * as XLSX from "xlsx";
import { type Cell, normalizeLabel, sheetRows, text, toCents, toISO } from "../excel";
import { CardImportError, type CardStatement, type CardStatementParser, type StatementLine, type StatementLineKind } from "./types";

// Fatura do cartão Itaú exportada pelo app/site (.xls ou .xlsx), uma aba por fatura.
//
// Layout (colunas lidas pelo NOME, a posição pode mudar):
// - bloco de resumo: uma linha com "Cartão | Valor | Vencimento" e, logo abaixo,
//   "<produto> - final NNNN", o total da fatura e a data de vencimento;
// - bloco "Lançamentos": cabeçalho "Data | Lançamento | Parcelamento | Valor |
//   Titularidade | Nome | Tipo do cartão | Número do cartão" e uma linha por lançamento,
//   terminando em "Subtotal". Valor negativo = crédito/pagamento. Em compras parceladas a
//   data é a da compra original e "Parcelamento" traz "Parcela k de n".
// - o arquivo não traz a data de fechamento: ela vem do cartão cadastrado.

const COLUMNS = {
  date: "Data",
  description: "Lançamento",
  installment: "Parcelamento",
  amount: "Valor",
  holderKind: "Titularidade",
  holderName: "Nome",
  cardType: "Tipo do cartão",
  cardNumber: "Número do cartão",
} as const;

const REQUIRED: (keyof typeof COLUMNS)[] = ["date", "description", "amount", "cardNumber"];

const labelsOf = (row: Cell[] | undefined) => (row ?? []).map((cell) => normalizeLabel(text(cell) ?? ""));

const isLinesHeader = (row: Cell[] | undefined) => {
  const labels = labelsOf(row);
  return labels.includes("data") && labels.includes("lancamento");
};

const isSummaryHeader = (row: Cell[] | undefined) => {
  const labels = labelsOf(row);
  return labels.includes("cartao") && labels.includes("vencimento");
};

const PAYMENT = /^pagamento (com saldo|efetuado|recebido|de fatura|fatura|debito automatico)/;
const FEE = /^(iof|anuidade|juros|multa|encargos?|tarifa|imposto|seguro fatura|avaliacao emergencial)\b/;

export function classifyLine(description: string, amountCents: number): StatementLineKind {
  const normalized = normalizeLabel(description);
  if (PAYMENT.test(normalized)) return "payment";
  if (FEE.test(normalized)) return amountCents < 0 ? "credit" : "fee";
  return amountCents < 0 ? "credit" : "purchase";
}

export function parseInstallment(cell: Cell): { number: number; total: number } | null {
  const value = text(cell);
  if (!value) return null;
  const match = /(\d{1,3})\s*(?:de|\/)\s*(\d{1,3})/i.exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  const total = Number(match[2]);
  if (number < 1 || total < 1 || number > total) return null;
  return total === 1 ? null : { number, total };
}

const lastDigits = (cell: Cell): string | null => {
  const digits = (text(cell) ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

function parseSheet(sheet: string, rows: Cell[][]): CardStatement | null {
  const headerIndex = rows.findIndex(isLinesHeader);
  if (headerIndex < 0) return null;
  const where = `Aba "${sheet}"`;

  // ── Resumo: vencimento, total e final do cartão principal ──
  const summaryIndex = rows.findIndex((row, i) => i < headerIndex && isSummaryHeader(row));
  if (summaryIndex < 0) {
    throw new CardImportError(`${where}: resumo da fatura ("Cartão | Valor | Vencimento") não encontrado.`);
  }
  const summaryLabels = labelsOf(rows[summaryIndex]);
  const summary = rows[summaryIndex + 1] ?? [];
  const at = (label: string) => {
    const index = summaryLabels.indexOf(label);
    return index < 0 ? undefined : summary[index];
  };
  const dueDate = toISO(at("vencimento"));
  if (!dueDate) throw new CardImportError(`${where}: data de vencimento da fatura não reconhecida.`);
  const cardFinal = /final\s*(\d{4})/i.exec(text(at("cartao")) ?? "")?.[1] ?? null;
  const totalCents = at("valor") === undefined ? null : toCents(at("valor"));
  const title =
    rows
      .slice(0, summaryIndex)
      .map((row) => row.map(text).find((v) => v && /^fatura\b/i.test(v)))
      .find(Boolean) ?? null;

  // ── Lançamentos ──
  const header = new Map<string, number>();
  labelsOf(rows[headerIndex]).forEach((label, index) => {
    if (label && !header.has(label)) header.set(label, index);
  });
  const column = (key: keyof typeof COLUMNS) => header.get(normalizeLabel(COLUMNS[key]));
  for (const key of REQUIRED) {
    if (column(key) === undefined) {
      throw new CardImportError(`${where}: coluna "${COLUMNS[key]}" não encontrada.`);
    }
  }
  const col = (row: Cell[], key: keyof typeof COLUMNS) => {
    const index = column(key);
    return index === undefined ? undefined : row[index];
  };

  const lines: StatementLine[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const line = i + 1;
    const values = row.map(text).filter(Boolean) as string[];
    if (values.length === 0) continue;
    const rawDate = col(row, "date");
    const hasDate = text(rawDate) !== null;
    // Fim do bloco: "Subtotal"/"Total"/"Importante saber" numa linha sem data.
    if (!hasDate && values.some((v) => /^(sub)?total\b/i.test(v) || /^importante saber/i.test(v))) break;

    const description = text(col(row, "description"));
    if (!description && !hasDate) continue;
    if (!description) throw new CardImportError(`${where}, linha ${line}: descrição do lançamento vazia.`);
    const date = toISO(rawDate);
    if (!date) throw new CardImportError(`${where}, linha ${line} (${description}): data não reconhecida.`);
    const amountCents = toCents(col(row, "amount"));
    if (amountCents === null || amountCents === 0) {
      throw new CardImportError(`${where}, linha ${line} (${description}): valor não reconhecido.`);
    }
    const holder = normalizeLabel(text(col(row, "holderKind")) ?? "");
    lines.push({
      row: line,
      date,
      description: description.replace(/\s+/g, " "),
      amountCents,
      installment: parseInstallment(col(row, "installment")),
      cardLast4: lastDigits(col(row, "cardNumber")) ?? cardFinal,
      holderKind: holder.startsWith("titular") ? "titular" : holder.startsWith("adicional") ? "adicional" : null,
      holderName: text(col(row, "holderName")),
      cardType: text(col(row, "cardType")),
      kind: classifyLine(description, amountCents),
    });
  }

  return { bank: "itau", sheet, title, dueDate, totalCents, cardFinal, lines };
}

export const itauParser: CardStatementParser = {
  id: "itau",
  label: "Itaú",
  detect: (workbook: XLSX.WorkBook) =>
    workbook.SheetNames.some((name) => sheetRows(workbook, name).slice(0, 60).some(isLinesHeader)),
  parse: (workbook: XLSX.WorkBook) => {
    const statements: CardStatement[] = [];
    for (const name of workbook.SheetNames) {
      const statement = parseSheet(name, sheetRows(workbook, name));
      if (statement) statements.push(statement);
    }
    return statements;
  },
};
