import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Transações" };

export default function TransacoesPage() {
  return (
    <>
      <PageHeader title="Transações" description="Entradas, saídas e transferências." />
      <EmptyState
        icon={Receipt}
        title="Nenhuma transação ainda"
        description="Os lançamentos feitos pelo site (e, em breve, pelo WhatsApp) aparecem aqui."
      />
    </>
  );
}
