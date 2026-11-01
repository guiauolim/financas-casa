import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Visão geral" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Visão geral" description="Resumo do mês da casa." />
      <EmptyState
        icon={LayoutDashboard}
        title="Nada por aqui ainda"
        description="Quando vocês lançarem as primeiras transações, o resumo do mês aparece aqui."
      />
    </>
  );
}
