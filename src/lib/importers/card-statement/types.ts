import type * as XLSX from "xlsx";

// Fatura de cartão normalizada, independente do banco. Puro: sem I/O, sem log de conteúdo.

export class CardImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardImportError";
  }
}

// purchase = compra; credit = estorno/crédito (abate a fatura); payment = pagamento da
// fatura anterior; fee = IOF, anuidade, juros, multa, encargos.
export type StatementLineKind = "purchase" | "credit" | "payment" | "fee";

export type StatementLine = {
  row: number; // linha da planilha (1-based), para mensagens
  date: string; // "YYYY-MM-DD" — em parcelas, a data ORIGINAL da compra
  description: string;
  amountCents: number; // com sinal: negativo = crédito/pagamento
  installment: { number: number; total: number } | null;
  cardLast4: string | null;
  holderKind: "titular" | "adicional" | null;
  holderName: string | null;
  cardType: string | null; // "Físico", "Virtual"...
  kind: StatementLineKind;
};

export type CardStatement = {
  bank: string; // id do parser ("itau")
  sheet: string;
  title: string | null; // ex.: "Fatura Paga - Março/2026"
  dueDate: string; // vencimento "YYYY-MM-DD" (identifica a fatura)
  totalCents: number | null; // total informado no arquivo
  cardFinal: string | null; // final do cartão principal no cabeçalho
  lines: StatementLine[];
};

// Interface de um banco: reconhece a aba e a converte. Outros bancos entram no registro
// em `index.ts`.
export type CardStatementParser = {
  id: string;
  label: string;
  detect: (workbook: XLSX.WorkBook) => boolean;
  parse: (workbook: XLSX.WorkBook) => CardStatement[];
};
