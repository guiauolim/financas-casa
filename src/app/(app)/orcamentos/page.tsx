import { PiggyBank } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Orçamentos" };

export default function OrcamentosPage() {
  return (
    <>
      <PageHeader title="Orçamentos" description="Limites mensais por categoria e semanais por cartão." />
      <EmptyState
        icon={PiggyBank}
        title="Nenhum orçamento definido"
        description="Defina limites para acompanhar o quanto ainda dá para gastar no mês."
      />
    </>
  );
}
