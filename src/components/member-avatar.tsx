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
  className,
}: {
  name: string | null;
  index: number;
  size?: "sm" | "md";
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
      <span className="sr-only">{name ? `Lançado por ${name}` : "Autor desconhecido"}</span>
    </span>
  );
}
