import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentProfile } from "@/lib/auth/session";

// Lê a sessão: renderizar dentro de <Suspense>. Também funciona como guarda do
// grupo (app): quem ainda não tem profile vai para o onboarding.
export async function UserMenu() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/onboarding");

  return (
    <div className="flex items-center gap-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-foreground"
        aria-hidden
      >
        {profile.displayName.charAt(0).toUpperCase()}
      </span>
      <div className="hidden min-w-0 flex-1 md:block">
        <p className="truncate text-sm font-medium">{profile.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{profile.householdName}</p>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          aria-label="Sair"
          title="Sair"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <LogOut className="size-[18px]" strokeWidth={2} aria-hidden />
        </button>
      </form>
    </div>
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="size-9 rounded-full" />
      <Skeleton className="hidden h-8 flex-1 md:block" />
    </div>
  );
}
