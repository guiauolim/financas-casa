import { CreditCard, FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton, Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { createClient } from "@/lib/supabase/server";
import { loadFormOptions } from "../form-options";
import { TransactionForm } from "../transaction-form";

export const metadata: Metadata = { title: "Novo lançamento" };

export default function NovaTransacaoPage() {
  return (
    <>
      <PageHeader
        title="Novo lançamento"
        description="Despesa, receita ou transferência entre contas — ou importe a fatura do cartão."
        actions={
          <Link href="/transacoes/importar" className={buttonVariants({ variant: "outline" })}>
            <FileUp aria-hidden />
            Importar fatura
          </Link>
        }
      />
      <Suspense fallback={<FormSkeleton fields={6} />}>
        <NewTransaction />
      </Suspense>
    </>
  );
}

async function NewTransaction() {
  const actor = await requireActor();
  const { accounts, categories, members } = await loadFormOptions(await createClient(), actor.householdId);
  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Cadastre uma conta primeiro"
        description="Todo lançamento sai de uma conta ou cartão. Cadastre pelo menos um para começar."
        action={
          <Link href="/configuracoes/contas/nova" className={buttonVariants()}>
            Cadastrar conta
          </Link>
        }
      />
    );
  }
  return (
    <Panel className="max-w-2xl">
      <TransactionForm
        accounts={accounts}
        categories={categories}
        members={members}
        currentUserId={actor.userId}
        today={todayInSaoPaulo()}
      />
    </Panel>
  );
}
