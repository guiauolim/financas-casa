import { Settings } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Configurações" };

export default function ConfiguracoesPage() {
  return (
    <>
      <PageHeader title="Configurações" description="Contas, cartões, categorias e membros da casa." />
      <EmptyState
        icon={Settings}
        title="Nada configurado ainda"
        description="Em breve você vai cadastrar aqui as contas, os cartões e os telefones da casa."
      />
    </>
  );
}
