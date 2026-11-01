const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Centavos -> "R$ 1.234,56". Converte via string decimal para não passar por float.
export function formatBRL(cents: bigint | number): string {
  const value = BigInt(cents);
  const abs = value < 0n ? -value : value;
  const decimal = `${value < 0n ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  return brl.format(decimal as Intl.StringNumericLiteral);
}
