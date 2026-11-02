import { House } from "lucide-react";
import { cn } from "@/lib/utils";

// Cor fixa por membro, pela ordem de entrada na casa (listMembers ordena por created_at).
const COLORS = [
  "bg-primary-soft text-primary-soft-foreground",
  "bg-[#FBEBD9] text-[#9A4F0E]",
  "bg-[#E3ECF8] text-[#2A548F]",
  "bg-[#EFE6F7] text-[#6A3F96]",
] as const;

export function memberColor(index: number): string {
  return COLORS[(index < 0 ? 0 : index) % COLORS.length]!;
}

export function MemberAvatar({
  name,
  index,
  size = "md",
  label = "Lançado por",
  className,
}: {
  name: string | null;
  index: number;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      title={name ?? undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" ? "size-7 text-xs" : "size-9 text-sm",
        memberColor(index),
        className,
      )}
    >
      <span aria-hidden>{initial}</span>
      <span className="sr-only">{name ? `${label} ${name}` : "Pessoa desconhecida"}</span>
    </span>
  );
}

// "Casa" (gasto conjunto, spent_by = null): ícone de casa no lugar da inicial.
export function HouseAvatar({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span
      title="Casa"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
        size === "sm" ? "size-7" : "size-9",
        className,
      )}
    >
      <House className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2} aria-hidden />
      <span className="sr-only">Da casa</span>
    </span>
  );
}

// De quem é o lançamento: membro (inicial com a cor dele) ou Casa.
export function SpenderAvatar({
  spentBy,
  name,
  index,
  size = "sm",
}: {
  spentBy: string | null;
  name: string | null;
  index: number;
  size?: "sm" | "md";
}) {
  if (!spentBy) return <HouseAvatar size={size} />;
  return <MemberAvatar name={name} index={index} size={size} label="De" />;
}
