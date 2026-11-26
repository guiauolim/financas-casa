import { Landmark } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { suggestLink } from "@/lib/finance/pluggy-links";
import { createPluggyClient, PluggyError, pluggyConfig } from "@/lib/pluggy/client";
import { listAccounts } from "@/lib/services/accounts";
import { listMembers } from "@/lib/services/households";
import { discoverPluggySources, listPluggyLinks } from "@/lib/services/pluggy";
import { createClient } from "@/lib/supabase/server";
import { type ItemGroup, PluggyLinksForm } from "./pluggy-links-form";

export const metadata: Metadata = { title: "Bancos (Pluggy)" };

export default function PluggyPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <PluggySettings />
    </Suspense>
  );
}

async function PluggySettings() {
  const actor = await requireActor();
  const config = pluggyConfig();
  if (!config) {
    return (
      <EmptyState
        icon={Landmark}
        title="Pluggy não configurada"
        description="Defina PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_ITEM_IDS (os itens do MeuPluggy) nas variáveis de ambiente."
      />
    );
  }

  const db = await createClient();
  const [discovery, links, accounts, members] = await Promise.all([
    discoverPluggySources(createPluggyClient(config)).catch((error: unknown) => {
      if (error instanceof PluggyError) return error;
      throw error;
    }),
    listPluggyLinks(db, { householdId: actor.householdId }),
    listAccounts(db, { householdId: actor.householdId, includeArchived: false }),
    listMembers(db, { householdId: actor.householdId }),
  ]);

  if (discovery instanceof PluggyError) {
    return (
      <EmptyState
        icon={Landmark}
        title="Não foi possível falar com a Pluggy"
        description={`${discovery.message}. Confira as credenciais e os itens do MeuPluggy.`}
      />
    );
  }

  const linkByKey = new Map(links.map((l) => [l.key, l]));
  const linkAccounts = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    ownerUserId: a.ownerUserId,
    archived: a.archived,
  }));

  const groups: ItemGroup[] = discovery.items.map((item) => {
    const sources = discovery.sources.filter((s) => s.itemId === item.itemId);
    const bankName = sources.find((s) => s.sourceKind === "bank_account")?.label ?? item.connectorName;
    const ownerUserId = sources.map((s) => linkByKey.get(s.key)?.ownerUserId).find(Boolean) ?? null;
    return {
      ...item,
      title: bankName,
      ownerUserId,
      sources: sources.map((source) => {
        const saved = linkByKey.get(source.key);
        return {
          source,
          saved: Boolean(saved),
          choice: saved ? { role: saved.role, accountId: saved.accountId } : suggestLink(source, linkAccounts),
        };
      }),
    };
  });

  return (
    <Panel
      title="Bancos (Pluggy)"
      description="Diga o que cada conta do banco é no sistema. As contas correntes e a caixinha somam na Conta Conjunta; o Tesouro vai para Investimentos. Os lançamentos vêm da Pluggy a partir de 01/11/2026."
    >
      <PluggyLinksForm
        groups={groups}
        accounts={linkAccounts}
        members={members.map((m) => ({ id: m.userId, name: m.displayName }))}
      />
    </Panel>
  );
}
