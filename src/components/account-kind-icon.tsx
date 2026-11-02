import { Banknote, CreditCard, Landmark, PiggyBank, Utensils } from "lucide-react";
import type { AccountKind } from "@/lib/validation/accounts";
import { cn } from "@/lib/utils";

const ICONS = {
  checking: Landmark,
  savings: PiggyBank,
  credit_card: CreditCard,
  cash: Banknote,
  meal_voucher: Utensils,
} as const;

export function AccountKindIcon({ kind, className }: { kind: AccountKind; className?: string }) {
  const Icon = ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      <Icon className="size-[18px]" strokeWidth={2} />
    </span>
  );
}
