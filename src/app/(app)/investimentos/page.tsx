import { TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Investimentos" };

export default function InvestimentosPage() {
  return (
    <>
      <PageHeader title="Investimentos" description="Posições e patrimônio da casa." />
      <EmptyState
        icon={TrendingUp}
        title="Nenhum investimento cadastrado"
        description="Cadastre seus ativos ou importe a posição da B3 para acompanhar o patrimônio."
      />
    </>
  );
}
