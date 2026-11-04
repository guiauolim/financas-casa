import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { getTransaction } from "@/lib/services/transactions";
import { createClient } from "@/lib/supabase/server";
import { DeleteTransactionButton } from "../delete-transaction-button";
import { loadFormOptions } from "../form-options";
import { TransactionForm } from "../transaction-form";

export const metadata: Metadata = { title: "Editar lançamento" };

export default function EditarTransacaoPage({ params }: PageProps<"/transacoes/[id]">) {
  return (
    <>
      <PageHeader title="Editar lançamento" />
      <Suspense fallback={<FormSkeleton fields={6} />}>
        <EditTransaction params={params} />
      </Suspense>
    </>
  );
}

async function EditTransaction({ params }: Pick<PageProps<"/transacoes/[id]">, "params">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await requireActor();
  const db = await createClient();
  const transaction = await getTransaction(db, { householdId: actor.householdId, transactionId: id.data });
  if (!transaction) notFound();
  const { accounts, categories, members } = await loadFormOptions(db, actor.householdId, {
    accountIds: [transaction.account.id, transaction.transferAccount?.id],
    categoryId: transaction.category?.id,
  });

  return (
    <Panel
      className="max-w-2xl"
      actions={<DeleteTransactionButton tx={transaction} />}
    >
      <TransactionForm
        transaction={{
          id: transaction.id,
          type: transaction.type,
          amountCents: transaction.amountCents,
          occurredOn: transaction.occurredOn,
          description: transaction.description,
          accountId: transaction.account.id,
          transferAccountId: transaction.transferAccount?.id ?? null,
          categoryId: transaction.category?.id ?? null,
          installment: transaction.installment,
          spentBy: transaction.spentBy,
          invoiceRef: transaction.invoiceRef,
        }}
        accounts={accounts}
        categories={categories}
        members={members}
        currentUserId={actor.userId}
        today={todayInSaoPaulo()}
      />
    </Panel>
  );
}
