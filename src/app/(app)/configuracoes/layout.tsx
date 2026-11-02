import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SubNav, SubNavSkeleton } from "@/components/sub-nav";

const TABS = [
  { href: "/configuracoes/contas", label: "Contas e cartões" },
  { href: "/configuracoes/categorias", label: "Categorias" },
  { href: "/configuracoes/membros", label: "Membros da casa" },
] as const;

export default function ConfiguracoesLayout({ children }: LayoutProps<"/configuracoes">) {
  return (
    <>
      <PageHeader title="Configurações" description="Contas, cartões, categorias e membros da casa." />
      <Suspense fallback={<SubNavSkeleton items={TABS} />}>
        <SubNav label="Seções das configurações" items={TABS} />
      </Suspense>
      {children}
    </>
  );
}
