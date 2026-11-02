"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Abas como links reais. Lê a rota: renderizar dentro de <Suspense> em layouts
// com rotas dinâmicas abaixo.
export function SubNav({ label, items }: { label: string; items: readonly { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1">
      <ul className="flex gap-1 border-b border-border">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SubNavSkeleton({ items }: { items: readonly { label: string }[] }) {
  return (
    <div className="flex min-h-11 gap-1 border-b border-border" aria-hidden>
      {items.map((item) => (
        <span key={item.label} className="flex items-center px-3 text-sm font-medium text-muted-foreground">
          {item.label}
        </span>
      ))}
    </div>
  );
}
