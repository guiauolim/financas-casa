import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ConfirmAction } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { getTransaction } from "@/lib/services/transactions";
import { createClient } from "@/lib/supabase/server";
import { deleteTransactionAction } from "../actions";
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
  if (!transaction || transaction.deletedAt) notFound();
  const { accounts, categories } = await loadFormOptions(db, actor.householdId, {
    accountIds: [transaction.account.id, transaction.transferAccount?.id],
    categoryId: transaction.category?.id,
  });

  const fields = { id: transaction.id, month: transaction.occurredOn.slice(0, 7) };
  const installment = transaction.installment;
  const hasFollowing = installment && installment.number < installment.total;

  return (
    <Panel
      className="max-w-2xl"
      actions={
        <ConfirmAction
          action={deleteTransactionAction}
          variant="destructive"
          trigger={
            <>
              <Trash2 aria-hidden />
              Excluir
            </>
          }
          title={installment ? `Excluir parcela ${installment.number} de ${installment.total}?` : "Excluir lançamento?"}
          description="O lançamento vai para a lixeira e pode ser restaurado depois."
          options={
            hasFollowing
              ? [
                  { label: "Só esta", fields: { ...fields, scope: "one" }, destructive: true },
                  { label: "Esta e as próximas", fields: { ...fields, scope: "following" }, destructive: true },
                ]
              : [{ label: "Excluir", fields: { ...fields, scope: "one" }, destructive: true }]
          }
        />
      }
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
          installment,
        }}
        accounts={accounts}
        categories={categories}
        today={todayInSaoPaulo()}
      />
    </Panel>
  );
}
