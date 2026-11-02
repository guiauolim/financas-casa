import type { ValueSource } from "@/lib/services/investments";
import type { TxSource } from "@/lib/services/transactions";
import { cn } from "@/lib/utils";

// Origem de um lançamento (WhatsApp/Site/Importado) ou do valor de um investimento (Manual/B3).
type Source = TxSource | ValueSource;

const STYLES: Record<Source, { label: string; className: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-primary-soft text-primary-soft-foreground" },
  web: { label: "Site", className: "bg-muted text-muted-foreground" },
  import: { label: "Importado", className: "bg-[#E3ECF8] text-[#2A548F]" },
  manual: { label: "Manual", className: "bg-muted text-muted-foreground" },
  b3: { label: "B3", className: "bg-[#E3ECF8] text-[#2A548F]" },
};

export function SourceBadge({ source }: { source: Source }) {
  const style = STYLES[source];
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-medium", style.className)}>
      {style.label}
    </span>
  );
}
