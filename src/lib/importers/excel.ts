import { parseISODate, toISODate } from "@/lib/finance/dates";
import * as XLSX from "xlsx";

// Helpers comuns dos importadores de planilha (B3, faturas de cartão). Puros, sem I/O.

export const normalizeLabel = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

export type Cell = string | number | boolean | null | undefined;

export const isEmpty = (cell: Cell) =>
  cell === null || cell === undefined || (typeof cell === "string" && ["", "-", "—"].includes(cell.trim()));

export const text = (cell: Cell): string | null => (isEmpty(cell) ? null : String(cell).trim());

// Número decimal em texto canônico ("1234.56"), a partir de número nativo ou texto BR
// ("1.234,56", "R$ 1.234,56", "1234,5"). Vazio, "-" ou inválido -> null.
export function toDecimalString(cell: Cell): string | null {
  if (isEmpty(cell) || typeof cell === "boolean") return null;
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return null;
    const raw = String(cell);
    return /e/i.test(raw) ? cell.toFixed(10).replace(/\.?0+$/, "") : raw;
  }
  let value = String(cell)
    .replace(/^\s*R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/^−/, "-");
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, ""); // "1.234" = milhar
  return /^-?\d+(\.\d+)?$/.test(value) ? value.replace(/^(-?)0+(?=\d)/, "$1") : null;
}

// Decimal em reais -> centavos inteiros, arredondando (meio para cima) por string.
export function decimalToCents(decimal: string): number {
  const negative = decimal.startsWith("-");
  const [int = "0", frac = ""] = (negative ? decimal.slice(1) : decimal).split(".");
  let cents = Number(int) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
  if (Number(frac[2] ?? "0") >= 5) cents += 1;
  return negative ? -cents : cents;
}

export const toCents = (cell: Cell): number | null => {
  const decimal = toDecimalString(cell);
  return decimal === null ? null : decimalToCents(decimal);
};

// "dd/mm/aaaa" ou serial do Excel -> "YYYY-MM-DD".
export function toISO(cell: Cell): string | null {
  if (typeof cell === "number" && cell > 0) {
    const parsed = XLSX.SSF.parse_date_code(cell);
    return parsed ? toISODate(parsed.y, parsed.m, parsed.d) : null;
  }
  const match = typeof cell === "string" ? /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(cell) : null;
  if (!match) return null;
  const iso = toISODate(Number(match[3]), Number(match[2]), Number(match[1]));
  return parseISODate(iso) ? iso : null;
}

// ───────────────────────── Entrada ─────────────────────────

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const XLS_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

export function looksLikeExcel(bytes: Uint8Array): boolean {
  const starts = (magic: number[]) => magic.every((byte, i) => bytes[i] === byte);
  return starts(XLSX_MAGIC) || starts(XLS_MAGIC);
}

// Lê a planilha (xlsx ou xls) sem fórmulas/HTML. Lança Error genérico se estiver corrompida.
export function readWorkbook(bytes: Uint8Array): XLSX.WorkBook {
  return XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, cellText: false, dense: true });
}

export function sheetRows(workbook: XLSX.WorkBook, sheetName: string): Cell[][] {
  return XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName]!, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
}
