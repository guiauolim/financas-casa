import { AppSidebar } from "@/components/app-sidebar";

// Autenticação: o proxy barra quem não está logado; o UserMenu (dentro do
// AppSidebar) manda para o onboarding quem ainda não tem profile. Os dados de
// cada página continuam protegidos pela RLS.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AppSidebar />
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-[clamp(16px,3vw,40px)]">{children}</main>
    </div>
  );
}
