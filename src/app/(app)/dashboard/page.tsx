import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  CategorySpending,
  IncomeExpense,
  Insights,
  ByPerson,
  Kpis,
  KpisSkeleton,
  MonthSelector,
  MonthSelectorSkeleton,
  OpenInvoices,
  PanelSkeleton,
  RecentTransactions,
} from "./sections";

export const metadata: Metadata = { title: "Visão geral" };

// Linha de dois cards na proporção 3:2 (quebra no celular).
const wide = "min-w-[min(100%,340px)] flex-[3]";
const narrow = "min-w-[min(100%,280px)] flex-[2]";

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Resumo do mês da casa."
        actions={
          <Link href="/transacoes/nova" className={buttonVariants()}>
            <Plus aria-hidden />
            Novo lançamento
          </Link>
        }
      />
      <Suspense fallback={<MonthSelectorSkeleton />}>
        <MonthSelector searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<KpisSkeleton />}>
        <Kpis searchParams={searchParams} />
      </Suspense>
      <div className="flex flex-wrap gap-4">
        <div className={wide}>
          <Suspense fallback={<PanelSkeleton rows={6} className="h-full" />}>
            <CategorySpending searchParams={searchParams} />
          </Suspense>
        </div>
        <div className={`${narrow} flex flex-col gap-4`}>
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <ByPerson searchParams={searchParams} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton rows={3} className="flex-1" />}>
            <Insights searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className={wide}>
          <Suspense fallback={<PanelSkeleton rows={5} className="h-full" />}>
            <IncomeExpense searchParams={searchParams} />
          </Suspense>
        </div>
        <div className={narrow}>
          <Suspense fallback={<PanelSkeleton rows={3} className="h-full" />}>
            <OpenInvoices searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<PanelSkeleton rows={8} />}>
        <RecentTransactions searchParams={searchParams} />
      </Suspense>
    </>
  );
}
