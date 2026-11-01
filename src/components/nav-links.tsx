"use client";

import { ArrowLeftRight, LayoutDashboard, PiggyBank, Settings, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
  { href: "/orcamentos", label: "Orçamentos", icon: PiggyBank },
  { href: "/investimentos", label: "Investimentos", icon: TrendingUp },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex gap-1 md:flex-col">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active
                  ? "bg-primary-soft text-primary-soft-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={2} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
