import { Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NavLinks } from "@/components/nav-links";
import { UserMenu, UserMenuSkeleton } from "@/components/user-menu";

// Desktop: coluna de 220px à esquerda. Celular: barra no topo com o menu rolando
// na horizontal. A altura acompanha o conteúdo (sem 100vh fixo).
export function AppSidebar() {
  return (
    <aside className="flex flex-col gap-3 border-b border-border bg-card px-4 py-3 md:w-[220px] md:shrink-0 md:gap-6 md:border-r md:border-b-0 md:px-3 md:py-5">
      <div className="flex items-center justify-between gap-3 md:px-2">
        <Link
          href="/dashboard"
          className="flex min-h-11 items-center gap-2 rounded-lg text-[15px] font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-[18px]" strokeWidth={2} aria-hidden />
          </span>
          Finanças da Casa
        </Link>
        <div className="md:hidden">
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
      <nav aria-label="Menu principal" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:flex-1 md:px-0">
        <NavLinks />
      </nav>
      <div className="hidden border-t border-divider pt-4 md:block">
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenu />
        </Suspense>
      </div>
    </aside>
  );
}
