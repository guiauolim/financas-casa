import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-6" strokeWidth={2} aria-hidden />
      </span>
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
