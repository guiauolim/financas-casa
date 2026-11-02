import { MailX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/action-button";
import { MemberAvatar } from "@/components/member-avatar";
import { ListSkeleton, Panel } from "@/components/panel";
import { InviteMemberForm } from "@/app/onboarding/forms";
import { requireActor } from "@/lib/auth/session";
import { formatDate } from "@/lib/finance/dates";
import { formatPhone } from "@/lib/finance/phone";
import { listMembers, listPendingInvites } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";
import { cancelInviteAction } from "../actions";
import { MemberForm } from "./member-form";

export const metadata: Metadata = { title: "Membros da casa" };

export default function MembrosPage() {
  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex min-w-[min(100%,360px)] flex-[3] flex-col gap-4">
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <Members />
        </Suspense>
      </div>
      <div className="flex min-w-[min(100%,300px)] flex-[2] flex-col gap-4">
        <Panel title="Convidar por e-mail" description="A pessoa recebe um link e entra direto nesta casa.">
          <InviteMemberForm />
        </Panel>
        <Suspense fallback={<ListSkeleton rows={1} />}>
          <PendingInvites />
        </Suspense>
      </div>
    </div>
  );
}

async function Members() {
  const actor = await requireActor();
  const members = await listMembers(await createClient(), { householdId: actor.householdId });
  return (
    <Panel title="Membros" description="Nome que aparece nos lançamentos e telefone do WhatsApp de cada pessoa.">
      <ul className="flex flex-col divide-y divide-divider">
        {members.map((member, index) => (
          <li key={member.userId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <MemberAvatar name={member.displayName} index={index} />
              <p className="font-medium">
                {member.displayName}
                {member.userId === actor.userId ? <span className="text-muted-foreground"> (você)</span> : null}
              </p>
            </div>
            <MemberForm
              member={{
                userId: member.userId,
                displayName: member.displayName,
                phoneDisplay: member.phoneE164 ? formatPhone(member.phoneE164) : "",
              }}
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

async function PendingInvites() {
  const actor = await requireActor();
  const invites = await listPendingInvites(await createClient(), { householdId: actor.householdId });
  return (
    <Panel title="Convites pendentes">
      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum convite aguardando resposta.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate font-medium">{invite.email}</p>
                <p className="text-[13px] text-muted-foreground">
                  Enviado em {formatDate(invite.createdAt.slice(0, 10))}
                </p>
              </div>
              <ConfirmAction
                action={cancelInviteAction}
                variant="ghost"
                size="icon"
                aria-label={`Cancelar convite de ${invite.email}`}
                trigger={<MailX aria-hidden />}
                title="Cancelar convite?"
                description={`${invite.email} não vai mais conseguir entrar nesta casa pelo convite.`}
                options={[{ label: "Cancelar convite", fields: { id: invite.id }, destructive: true }]}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
