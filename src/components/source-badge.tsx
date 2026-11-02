import type { TxSource } from "@/lib/services/transactions";
import { cn } from "@/lib/utils";

const STYLES: Record<TxSource, { label: string; className: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-primary-soft text-primary-soft-foreground" },
  web: { label: "Site", className: "bg-muted text-muted-foreground" },
  import: { label: "Importado", className: "bg-[#E3ECF8] text-[#2A548F]" },
};

export function SourceBadge({ source }: { source: TxSource }) {
  const style = STYLES[source];
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-medium", style.className)}>
      {style.label}
    </span>
  );
}
