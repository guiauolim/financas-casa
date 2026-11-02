import type * as XLSX from "xlsx";
import { looksLikeExcel, readWorkbook } from "../excel";
import { itauParser } from "./itau";
import { CardImportError, type CardStatement, type CardStatementParser } from "./types";

export * from "./types";
export { classifyLine, parseInstallment } from "./itau";

// Bancos suportados. Para um banco novo: implementar CardStatementParser e incluir aqui.
export const CARD_STATEMENT_PARSERS: readonly CardStatementParser[] = [itauParser];

export const SUPPORTED_BANKS = CARD_STATEMENT_PARSERS.map((p) => p.label).join(", ");

// Bytes do arquivo -> faturas normalizadas. Só em memória; não guarda nem loga nada.
export function parseCardStatement(data: ArrayBuffer | Uint8Array): CardStatement[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!looksLikeExcel(bytes)) throw new CardImportError("O arquivo não é uma planilha Excel (.xls ou .xlsx).");

  let workbook: XLSX.WorkBook;
  try {
    workbook = readWorkbook(bytes);
  } catch {
    throw new CardImportError("Não foi possível ler a planilha. Exporte a fatura de novo pelo app ou site do banco.");
  }

  const parser = CARD_STATEMENT_PARSERS.find((p) => p.detect(workbook));
  if (!parser) {
    throw new CardImportError(
      `Layout de fatura não reconhecido: nenhuma aba tem o cabeçalho "Data | Lançamento | Valor". Bancos suportados: ${SUPPORTED_BANKS}.`,
    );
  }
  const statements = parser.parse(workbook);
  if (statements.length === 0) throw new CardImportError("O arquivo não tem nenhuma fatura.");
  return statements;
}
