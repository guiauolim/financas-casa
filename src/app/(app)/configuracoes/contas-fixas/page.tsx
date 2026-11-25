import { CalendarClock, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton, ConfirmAction } from "@/components/action-button";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { ListSkeleton, Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import { listRecurringBills, type RecurringBillRow } from "@/lib/services/recurring-bills";
import { createClient } from "@/lib/supabase/server";
import { deleteRecurringBillAction, setRecurringBillActiveAction } from "../actions";

export const metadata: Metadata = { title: "Contas fixas" };

export default function ContasFixasPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <BillList />
    </Suspense>
  );
}

const newBillLink = (
  <Link href="/configuracoes/contas-fixas/nova" className={buttonVariants()}>
    <Plus aria-hidden />
    Nova conta fixa
  </Link>
);

async function BillList() {
  const actor = await requireActor();
  const bills = await listRecurringBills(await createClient(), { householdId: actor.householdId });

  if (bills.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nenhuma conta fixa"
        description="Cadastre aluguel, luz, internet e assinaturas. Em Orçamentos elas aparecem a cada mês como previstas, com o botão “Lançar”. Nada é lançado sozinho."
        action={newBillLink}
      />
    );
  }

  const active = bills.filter((b) => b.active);
  const paused = bills.filter((b) => !b.active);
  const total = active.reduce((sum, b) => sum + b.amountCents, 0);

  return (
    <>
      <Panel
        title="Contas fixas"
        description="Previstas todo mês. Em Orçamentos, cada uma tem o botão “Lançar” (o valor pode ser ajustado)."
        actions={newBillLink}
      >
        {active.length ? (
          <>
            <BillRows bills={active} />
            <p className="flex justify-between border-t border-divider pt-3 text-sm">
              <span className="text-muted-foreground">Total previsto por mês</span>
              <Money cents={total} className="font-medium" />
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Todas as contas fixas estão pausadas.</p>
        )}
      </Panel>
      {paused.length ? (
        <Panel title="Pausadas" description="Não entram no previsto do mês. Os lançamentos já feitos continuam.">
          <BillRows bills={paused} />
        </Panel>
      ) : null}
    </>
  );
}

function BillRows({ bills }: { bills: RecurringBillRow[] }) {
  return (
    <ul className="flex flex-col divide-y divide-divider">
      {bills.map((bill) => (
        <li key={bill.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <CategoryIcon icon={bill.category?.icon} className="size-9" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="truncate font-medium">{bill.name}</p>
            <p className="truncate text-[13px] text-muted-foreground">
              Dia {bill.dueDay} · {bill.account?.name ?? "Conta"} · {bill.category?.name ?? "Categoria"}
            </p>
          </div>
          <Money cents={bill.amountCents} className="text-sm" />
          <Link
            href={`/configuracoes/contas-fixas/${bill.id}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label={`Editar ${bill.name}`}
          >
            <Pencil aria-hidden />
          </Link>
          <ActionButton
            action={setRecurringBillActiveAction}
            fields={{ id: bill.id, active: String(!bill.active) }}
            variant="ghost"
            size="icon"
            aria-label={bill.active ? `Pausar ${bill.name}` : `Reativar ${bill.name}`}
          >
            {bill.active ? <Pause aria-hidden /> : <Play aria-hidden />}
          </ActionButton>
          <ConfirmAction
            action={deleteRecurringBillAction}
            variant="ghost"
            size="icon"
            aria-label={`Excluir ${bill.name}`}
            trigger={<Trash2 aria-hidden />}
            title="Excluir conta fixa?"
            description={`"${bill.name}" deixa de ser prevista. Os lançamentos já feitos continuam, só perdem o vínculo. Para parar só por um tempo, use pausar.`}
            options={[{ label: "Excluir", fields: { id: bill.id }, destructive: true }]}
          />
        </li>
      ))}
    </ul>
  );
}
