import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { monthFromParam } from "@/components/month-nav";
import { PageHeader } from "@/components/page-header";
import { ListSkeleton } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { listCategories } from "@/lib/services/categories";
import { listMembers } from "@/lib/services/households";
import { getTransactionsMonth } from "@/lib/services/month-transactions";
import { listAccounts } from "@/lib/services/accounts";
import { createClient } from "@/lib/supabase/server";
import { transactionFiltersSchema } from "@/lib/validation/transactions";
import { MonthBrowser } from "./month-browser";

export const metadata: Metadata = { title: "Transações" };

export default function TransacoesPage({ searchParams }: PageProps<"/transacoes">) {
  return (
    <>
      <PageHeader
        title="Transações"
        description="Faturas do cartão e o que foi fora do cartão, mês a mês."
        actions={
          <Link href="/transacoes/nova" className={buttonVariants()}>
            <Plus aria-hidden />
            Novo lançamento
          </Link>
        }
      />
      <Suspense fallback={<TransactionsSkeleton />}>
        <Transactions searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function TransactionsSkeleton() {
  return (
    <>
      <Skeleton className="h-36 w-full rounded-[14px]" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-[14px]" />
        ))}
      </div>
      <ListSkeleton rows={5} />
      <ListSkeleton rows={4} />
    </>
  );
}

// Só o primeiro mês é renderizado aqui; os outros (e os filtros) o MonthBrowser troca no
// navegador, sem renderizar a página de novo.
async function Transactions({ searchParams }: Pick<PageProps<"/transacoes">, "searchParams">) {
  const { mes } = transactionFiltersSchema.parse(await searchParams);
  const actor = await requireActor();
  const db = await createClient();
  const today = todayInSaoPaulo();
  const month = monthFromParam(mes, today);

  const [initial, accounts, categories, members] = await Promise.all([
    getTransactionsMonth(db, { householdId: actor.householdId, month, today }),
    listAccounts(db, { householdId: actor.householdId, includeArchived: true }),
    listCategories(db, { householdId: actor.householdId, includeArchived: true }),
    listMembers(db, { householdId: actor.householdId }),
  ]);

  return (
    <MonthBrowser
      initial={initial}
      options={{
        accounts: accounts.map((a) => ({ id: a.id, name: a.name, archived: a.archived })),
        categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type, archived: c.archived })),
        members: members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
      }}
    />
  );
}
