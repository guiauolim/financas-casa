import { CreditCard, FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton, Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import { z } from "zod";
import { clampedDate, parseYearMonth, todayInSaoPaulo } from "@/lib/finance/dates";
import { getRecurringBill } from "@/lib/services/recurring-bills";
import type { Db } from "@/lib/services/types";
import { createClient } from "@/lib/supabase/server";
import { loadFormOptions } from "../form-options";
import { type BillPrefill, TransactionForm } from "../transaction-form";

export const metadata: Metadata = { title: "Novo lançamento" };

export default function NovaTransacaoPage({ searchParams }: PageProps<"/transacoes/nova">) {
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
        <NewTransaction searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// "Lançar" de uma conta fixa (?conta-fixa=<id>&mes=YYYY-MM): despesa já preenchida. Data: no
// cartão, o dia da cobrança (define a fatura); fora dele, hoje no mês atual ou o vencimento.
async function billPrefill(db: Db, householdId: string, params: Record<string, string | string[] | undefined>, today: string) {
  const id = z.uuid().safeParse(params["conta-fixa"]);
  if (!id.success) return undefined;
  const bill = await getRecurringBill(db, { householdId, billId: id.data });
  if (!bill) return undefined;
  const mes = typeof params.mes === "string" ? params.mes : "";
  const month = parseYearMonth(mes) ?? parseYearMonth(today.slice(0, 7))!;
  const dueDate = clampedDate(month, bill.dueDay);
  const isCard = bill.account?.kind === "credit_card";
  const occurredOn = !isCard && today.slice(0, 7) === dueDate.slice(0, 7) ? today : dueDate;
  return {
    id: bill.id,
    name: bill.name,
    amountCents: bill.amountCents,
    occurredOn,
    accountId: bill.accountId,
    categoryId: bill.categoryId,
    spentBy: bill.spentBy,
    month: dueDate.slice(0, 7),
  } satisfies BillPrefill;
}

async function NewTransaction({ searchParams }: Pick<PageProps<"/transacoes/nova">, "searchParams">) {
  const actor = await requireActor();
  const db = await createClient();
  const today = todayInSaoPaulo();
  const [{ accounts, categories, members, defaultIncomeAccountId }, fromBill] = await Promise.all([
    loadFormOptions(db, actor.householdId),
    searchParams.then((params) => billPrefill(db, actor.householdId, params, today)),
  ]);
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
        defaultIncomeAccountId={defaultIncomeAccountId}
        fromBill={fromBill}
        today={today}
      />
    </Panel>
  );
}
