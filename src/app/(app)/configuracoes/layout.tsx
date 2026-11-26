import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SubNav, SubNavSkeleton } from "@/components/sub-nav";

const TABS = [
  { href: "/configuracoes/contas", label: "Contas e cartões" },
  { href: "/configuracoes/contas-fixas", label: "Contas fixas" },
  { href: "/configuracoes/categorias", label: "Categorias" },
  { href: "/configuracoes/regras", label: "Regras de categoria" },
  { href: "/configuracoes/membros", label: "Membros da casa" },
  { href: "/configuracoes/pluggy", label: "Bancos (Pluggy)" },
] as const;

export default function ConfiguracoesLayout({ children }: LayoutProps<"/configuracoes">) {
  return (
    <>
      <PageHeader title="Configurações" description="Contas, cartões, contas fixas, categorias, regras de categoria, membros da casa e bancos." />
      <Suspense fallback={<SubNavSkeleton items={TABS} />}>
        <SubNav label="Seções das configurações" items={TABS} />
      </Suspense>
      {children}
    </>
  );
}
