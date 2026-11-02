const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Centavos -> "R$ 1.234,56". Converte via string decimal para não passar por float.
export function formatBRL(cents: bigint | number): string {
  const value = BigInt(cents);
  const abs = value < 0n ? -value : value;
  const decimal = `${value < 0n ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  return brl.format(decimal as Intl.StringNumericLiteral);
}

// "52,30" | "1.234,56" | "R$ 1.234,56" | "52" | "0,5" -> centavos (inteiro). Inválido -> null.
// Ponto só como separador de milhar (grupos de 3); vírgula só como decimal (até 2 casas).
// Faz o parse por string para nunca passar por float.
const BRL_PATTERN = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/^\s*R\$\s*/i, "").replace(/\s/g, "");
  const match = BRL_PATTERN.exec(cleaned);
  if (!match) return null;
  const reais = match[1]!.replace(/\./g, "");
  const centavos = (match[2] ?? "").padEnd(2, "0");
  const cents = Number(`${reais}${centavos}`);
  return Number.isSafeInteger(cents) ? cents : null;
}

// Centavos -> "1.234,56" (sem "R$"; negativo com "-"), para preencher campos de formulário.
export function formatAmountInput(cents: number): string {
  const text = formatBRL(Math.abs(cents)).replace(/^R\$\s?/, "").trim();
  return cents < 0 ? `-${text}` : text;
}
