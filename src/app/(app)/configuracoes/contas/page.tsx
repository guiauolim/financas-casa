import { Archive, ArchiveRestore, CreditCard, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccountKindIcon } from "@/components/account-kind-icon";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { MemberAvatar } from "@/components/member-avatar";
import { Money } from "@/components/money";
import { ListSkeleton, Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import { formatDate } from "@/lib/finance/dates";
import { type Account, listAccounts } from "@/lib/services/accounts";
import { listMembers, type Member } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_KIND_LABELS } from "@/lib/validation/accounts";
import { archiveAccountAction } from "../actions";

export const metadata: Metadata = { title: "Contas e cartões" };

export default function ContasPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <AccountList />
    </Suspense>
  );
}

const newAccountLink = (
  <Link href="/configuracoes/contas/nova" className={buttonVariants()}>
    <Plus aria-hidden />
    Nova conta ou cartão
  </Link>
);

async function AccountList() {
  const actor = await requireActor();
  const db = await createClient();
  const [accounts, members] = await Promise.all([
    listAccounts(db, { householdId: actor.householdId, includeArchived: true }),
    listMembers(db, { householdId: actor.householdId }),
  ]);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Nenhuma conta cadastrada"
        description="Cadastre as contas, cartões, vale-refeição e a carteira de dinheiro da casa para começar a lançar."
        action={newAccountLink}
      />
    );
  }

  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <>
      <Panel title="Contas e cartões" description="Apelidos ajudam o bot do WhatsApp a reconhecer a conta." actions={newAccountLink}>
        {active.length ? (
          <AccountRows accounts={active} members={members} />
        ) : (
          <p className="text-sm text-muted-foreground">Todas as contas estão arquivadas.</p>
        )}
      </Panel>
      {archived.length ? (
        <Panel title="Arquivadas" description="Não aparecem nos formulários, mas o histórico continua.">
          <AccountRows accounts={archived} members={members} />
        </Panel>
      ) : null}
    </>
  );
}

function AccountRows({ accounts, members }: { accounts: Account[]; members: Member[] }) {
  return (
    <ul className="flex flex-col divide-y divide-divider">
      {accounts.map((account) => {
        const ownerIndex = members.findIndex((m) => m.userId === account.ownerUserId);
        const owner = members[ownerIndex];
        return (
          <li key={account.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <AccountKindIcon kind={account.kind} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate font-medium">{account.name}</p>
              <p className="text-[13px] text-muted-foreground">
                {ACCOUNT_KIND_LABELS[account.kind]}
                {account.kind === "credit_card" ? (
                  <>
                    {" · "}melhor dia de compra {account.closingDay} · vence dia {account.dueDay} · fatura pelo{" "}
                    {account.invoiceNaming === "due" ? "vencimento" : "fechamento"}
                    {account.creditLimitCents ? (
                      <>
                        {" · "}limite <Money cents={account.creditLimitCents} />
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    {" · "}saldo inicial <Money cents={account.openingBalanceCents} />
                    {account.openingBalanceDate ? ` em ${formatDate(account.openingBalanceDate)}` : null}
                  </>
                )}
              </p>
              {account.aliases.length ? (
                <p className="text-[13px] text-muted-foreground">Apelidos: {account.aliases.join(", ")}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {owner ? (
                <MemberAvatar name={owner.displayName} index={ownerIndex} size="sm" />
              ) : (
                <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Conjunta</span>
              )}
              <Link
                href={`/configuracoes/contas/${account.id}`}
                className={buttonVariants({ variant: "ghost", size: "icon" })}
                aria-label={`Editar ${account.name}`}
              >
                <Pencil aria-hidden />
              </Link>
              <ActionButton
                action={archiveAccountAction}
                fields={{ id: account.id, archived: String(!account.archived) }}
                variant="ghost"
                size="icon"
                aria-label={account.archived ? `Reativar ${account.name}` : `Arquivar ${account.name}`}
              >
                {account.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              </ActionButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
