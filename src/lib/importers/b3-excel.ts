import type * as XLSX from "xlsx";
import { parseISODate, todayInSaoPaulo } from "@/lib/finance/dates";
import {
  type Cell,
  decimalToCents,
  isEmpty,
  looksLikeExcel,
  normalizeLabel,
  readWorkbook,
  sheetRows,
  text,
  toCents,
  toDecimalString,
  toISO,
} from "./excel";
import type { AssetClass } from "@/lib/finance/portfolio";

// Importador do Excel de posição da Área do Investidor da B3 (Extratos → Posição).
// Puro: recebe os bytes e devolve os ativos normalizados; não grava nada nem loga conteúdo.
//
// Layout do arquivo: uma aba por tipo de produto, cabeçalho na 1ª linha e uma linha por
// ativo. No fim de cada aba há uma linha vazia, uma linha de rótulos "Total" e os totais.
// Datas vêm como texto "dd/mm/aaaa", valores ausentes como "-". As colunas são lidas pelo
// NOME (a B3 muda a ordem de vez em quando). Valor atual = valor BRUTO.

export class B3ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B3ImportError";
  }
}

export type B3Asset = {
  externalId: string; // "CODIGO|INSTITUICAO" — identifica o ativo entre importações
  code: string; // ticker, código do título ou ISIN
  name: string;
  assetClass: AssetClass;
  institution: string | null;
  quantity: string | null; // decimal em texto (vai para numeric sem passar por float)
  valueCents: number; // valor bruto
  netValueCents: number | null; // valor líquido, quando a aba informa (só exibição)
  avgPriceCents: number | null;
  sheet: string;
};

export type B3Position = {
  assets: B3Asset[];
  sheets: string[]; // abas reconhecidas
  ignoredSheets: string[];
  referenceDate: string | null; // detectada pelo nome do arquivo ou pela data de criação
};

// ───────────────────────── Normalização ─────────────────────────

const normalizeInstitution = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim();

export const b3ExternalId = (code: string, institution: string | null) =>
  `${code.trim().toUpperCase()}|${institution ? normalizeInstitution(institution) : ""}`;

// ───────────────────────── Abas e colunas ─────────────────────────

type SheetSpec = {
  label: string; // nome amigável nas mensagens
  assetClass: AssetClass;
  code: string[]; // primeira coluna existente vira o identificador
  value: string[]; // primeira com valor na linha vira o valor bruto
  net?: string;
  applied?: string; // valor aplicado (preço médio = aplicado ÷ quantidade)
};

const EQUITY = { code: ["Código de Negociação"], value: ["Valor Atualizado"] };

const SHEETS: { match: (name: string) => boolean; spec: SheetSpec }[] = [
  { match: (n) => n.startsWith("acoes"), spec: { label: "Ações", assetClass: "stock", ...EQUITY } },
  { match: (n) => n.startsWith("bdr"), spec: { label: "BDR", assetClass: "stock", ...EQUITY } },
  { match: (n) => n.startsWith("etf"), spec: { label: "ETF", assetClass: "etf", ...EQUITY } },
  {
    match: (n) => n.startsWith("fundo de investimento") || n.startsWith("fii"),
    spec: { label: "Fundo de Investimento", assetClass: "fii", ...EQUITY },
  },
  {
    match: (n) => n.startsWith("renda fixa"),
    spec: {
      label: "Renda Fixa",
      assetClass: "fixed_income",
      code: ["Código"],
      value: ["Valor Atualizado CURVA", "Valor Atualizado MTM", "Valor Atualizado FECHAMENTO"],
    },
  },
  {
    match: (n) => n.startsWith("tesouro direto"),
    spec: {
      label: "Tesouro Direto",
      assetClass: "treasury",
      code: ["Código ISIN"],
      value: ["Valor bruto", "Valor Atualizado"],
      net: "Valor líquido",
      applied: "Valor Aplicado",
    },
  },
];

export const EXPECTED_SHEETS = "Ações, BDR, ETF, Fundo de Investimento, Renda Fixa, Tesouro Direto";

function parseSheet(sheetName: string, rows: Cell[][], spec: SheetSpec): B3Asset[] {
  const headerIndex = rows.findIndex((row) => row.some((cell) => !isEmpty(cell)));
  if (headerIndex < 0) return []; // aba vazia: nada a importar
  const header = new Map<string, number>();
  rows[headerIndex]!.forEach((cell, index) => {
    const label = text(cell);
    if (label && !header.has(normalizeLabel(label))) header.set(normalizeLabel(label), index);
  });

  const column = (name: string) => header.get(normalizeLabel(name));
  const require = (names: string[]) => {
    const found = names.map(column).filter((index): index is number => index !== undefined);
    if (found.length === 0) {
      throw new B3ImportError(`Aba "${sheetName}": coluna "${names[0]}" não encontrada.`);
    }
    return found;
  };

  const codeCol = require(spec.code)[0]!;
  const nameCol = require(["Produto"])[0]!;
  const qtyCol = require(["Quantidade"])[0]!;
  const valueCols = require(spec.value);
  const institutionCol = column("Instituição");
  const netCol = spec.net ? column(spec.net) : undefined;
  const appliedCol = spec.applied ? column(spec.applied) : undefined;

  const assets: B3Asset[] = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const code = text(row[codeCol]);
    if (!code) return; // linha vazia, rótulo "Total" ou linha de totais
    const line = headerIndex + offset + 2;
    const name = text(row[nameCol]) ?? code;
    const valueCents = valueCols.map((index) => toCents(row[index])).find((v) => v !== null) ?? null;
    if (valueCents === null) {
      throw new B3ImportError(`Aba "${sheetName}", linha ${line} (${code}): valor atualizado não encontrado.`);
    }
    const quantity = toDecimalString(row[qtyCol]);
    const institution = institutionCol === undefined ? null : text(row[institutionCol]);
    const applied = appliedCol === undefined ? null : toCents(row[appliedCol]);
    const qtyNumber = quantity === null ? 0 : Number(quantity);
    assets.push({
      externalId: b3ExternalId(code, institution),
      code: code.toUpperCase(),
      name,
      assetClass: spec.assetClass,
      institution,
      quantity,
      valueCents,
      netValueCents: netCol === undefined ? null : toCents(row[netCol]),
      avgPriceCents: applied !== null && qtyNumber > 0 ? Math.round(applied / qtyNumber) : null,
      sheet: sheetName,
    });
  });
  return assets;
}

// Mesmo ativo em duas linhas (ex.: duas contas na mesma corretora): soma quantidade e valores.
function mergeDuplicates(assets: B3Asset[]): B3Asset[] {
  const byId = new Map<string, B3Asset>();
  for (const asset of assets) {
    const current = byId.get(asset.externalId);
    if (!current) {
      byId.set(asset.externalId, { ...asset });
      continue;
    }
    const sum = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
    current.valueCents += asset.valueCents;
    current.netValueCents = sum(current.netValueCents, asset.netValueCents);
    current.quantity =
      current.quantity === null || asset.quantity === null
        ? (current.quantity ?? asset.quantity)
        : addDecimals(current.quantity, asset.quantity);
    current.avgPriceCents = null;
  }
  return [...byId.values()];
}

function addDecimals(a: string, b: string): string {
  const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const toInt = (v: string) => {
    const [int, frac = ""] = v.split(".");
    return BigInt(int + frac.padEnd(scale, "0"));
  };
  const total = (toInt(a) + toInt(b)).toString().padStart(scale + 1, "0");
  if (scale === 0) return total;
  const result = `${total.slice(0, -scale)}.${total.slice(-scale)}`.replace(/\.?0+$/, "");
  return result;
}

// ───────────────────────── Data de referência ─────────────────────────

// O arquivo não traz a data dentro das planilhas. O nome padrão da B3 é
// "posicao-AAAA-MM-DD-hh-mm-ss.xlsx"; senão, usa a data de criação do arquivo.
export function detectReferenceDate(fileName: string | null, createdAt: Date | null | undefined): string | null {
  const match = fileName ? /posi[cç][aã]o[-_ ](\d{4})-(\d{2})-(\d{2})/i.exec(fileName) : null;
  if (match) {
    const iso = `${match[1]}-${match[2]}-${match[3]}`;
    if (parseISODate(iso)) return iso;
  }
  if (createdAt instanceof Date && !Number.isNaN(createdAt.getTime())) return todayInSaoPaulo(createdAt);
  return null;
}

// ───────────────────────── Entrada ─────────────────────────

// Reexportados para quem já importava daqui.
export { decimalToCents, looksLikeExcel, normalizeLabel, toCents, toDecimalString, toISO };

export function parseB3Position(data: ArrayBuffer | Uint8Array, fileName: string | null = null): B3Position {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!looksLikeExcel(bytes)) throw new B3ImportError("O arquivo não é uma planilha Excel (.xlsx ou .xls).");

  let workbook: XLSX.WorkBook;
  try {
    workbook = readWorkbook(bytes);
  } catch {
    throw new B3ImportError("Não foi possível ler a planilha. Exporte de novo pela Área do Investidor da B3.");
  }

  const assets: B3Asset[] = [];
  const sheets: string[] = [];
  const ignoredSheets: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const entry = SHEETS.find((s) => s.match(normalizeLabel(sheetName)));
    if (!entry) {
      ignoredSheets.push(sheetName);
      continue;
    }
    const rows = sheetRows(workbook, sheetName);
    sheets.push(sheetName);
    assets.push(...parseSheet(sheetName, rows, entry.spec));
  }

  if (sheets.length === 0) {
    throw new B3ImportError(`Nenhuma aba de posição reconhecida. Esperado: ${EXPECTED_SHEETS}.`);
  }

  return {
    assets: mergeDuplicates(assets),
    sheets,
    ignoredSheets,
    referenceDate: detectReferenceDate(fileName, workbook.Props?.CreatedDate),
  };
}

// ───────────────────────── Diferença com o que já está no sistema ─────────────────────────

export type ExistingB3Asset = {
  id: string;
  externalId: string;
  name: string;
  currentValueCents: number;
  quantity: string | null;
  archived: boolean;
};

export type B3Diff = {
  created: B3Asset[];
  updated: (B3Asset & { id: string; currentName: string; oldValueCents: number; oldQuantity: string | null; reactivated: boolean })[];
  missing: ExistingB3Asset[]; // ativos B3 deste dono que não vieram no arquivo
};

export function diffB3Import(assets: readonly B3Asset[], existing: readonly ExistingB3Asset[]): B3Diff {
  const byExternalId = new Map(existing.map((e) => [e.externalId, e]));
  const seen = new Set<string>();
  const diff: B3Diff = { created: [], updated: [], missing: [] };
  for (const asset of assets) {
    seen.add(asset.externalId);
    const current = byExternalId.get(asset.externalId);
    if (!current) {
      diff.created.push(asset);
      continue;
    }
    diff.updated.push({
      ...asset,
      id: current.id,
      currentName: current.name,
      oldValueCents: current.currentValueCents,
      oldQuantity: current.quantity,
      reactivated: current.archived,
    });
  }
  diff.missing = existing.filter((e) => !e.archived && !seen.has(e.externalId));
  return diff;
}
