import { formatBRL } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

// Valor em Geist Mono. `kind` define o sinal: saída "−", entrada "+" em verde,
// transferência sem sinal. Sem `kind`, mostra o valor como está.
export function Money({
  cents,
  kind,
  className,
}: {
  cents: number;
  kind?: "expense" | "income" | "transfer";
  className?: string;
}) {
  const text = formatBRL(Math.abs(cents));
  const sign = kind === "expense" ? "−" : kind === "income" ? "+" : cents < 0 ? "−" : "";
  return (
    <span
      className={cn(
        "font-mono whitespace-nowrap tabular-nums",
        kind === "income" && "text-primary",
        !kind && cents < 0 && "text-danger",
        className,
      )}
    >
      {sign}
      {text}
    </span>
  );
}
