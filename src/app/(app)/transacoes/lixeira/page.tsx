import { RotateCcw, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton, ConfirmAction } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ListSkeleton, Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import { listMembers } from "@/lib/services/households";
import { listDeletedTransactions, type Transaction } from "@/lib/services/transactions";
import { createClient } from "@/lib/supabase/server";
import { restoreTransactionAction } from "../actions";
import { TransactionRows } from "../transaction-rows";

export const metadata: Metadata = { title: "Lixeira" };

export default function LixeiraPage() {
  return (
    <>
      <PageHeader
        title="Lixeira"
        description="Lançamentos excluídos. Restaure para que voltem a contar nos totais."
        actions={
          <Link href="/transacoes" className={buttonVariants({ variant: "outline" })}>
            Voltar para transações
          </Link>
        }
      />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <Trash />
      </Suspense>
    </>
  );
}

function RestoreButton({ tx }: { tx: Transaction }) {
  const installment = tx.installment;
  const label = <RotateCcw aria-hidden />;
  if (installment && installment.number < installment.total) {
    return (
      <ConfirmAction
        action={restoreTransactionAction}
        variant="ghost"
        size="icon"
        aria-label={`Restaurar parcela ${installment.number} de ${installment.total}`}
        trigger={label}
        title={`Restaurar parcela ${installment.number} de ${installment.total}?`}
        description="Você pode restaurar só esta parcela ou também as próximas que estiverem na lixeira."
        options={[
          { label: "Só esta", fields: { id: tx.id, scope: "one" } },
          { label: "Esta e as próximas", fields: { id: tx.id, scope: "following" } },
        ]}
      />
    );
  }
  return (
    <ActionButton
      action={restoreTransactionAction}
      fields={{ id: tx.id, scope: "one" }}
      variant="ghost"
      size="icon"
      aria-label="Restaurar lançamento"
    >
      {label}
    </ActionButton>
  );
}

async function Trash() {
  const actor = await requireActor();
  const db = await createClient();
  const [transactions, members] = await Promise.all([
    listDeletedTransactions(db, { householdId: actor.householdId }),
    listMembers(db, { householdId: actor.householdId }),
  ]);
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={Trash2}
        title="A lixeira está vazia"
        description="Quando você excluir um lançamento, ele aparece aqui e pode ser restaurado."
      />
    );
  }
  return (
    <Panel title="Excluídos" description="Mostrando os 200 mais recentes.">
      <TransactionRows
        transactions={transactions}
        memberIndex={(userId) => members.findIndex((m) => m.userId === userId)}
        href={null}
        actions={(tx) => <RestoreButton tx={tx} />}
      />
    </Panel>
  );
}
