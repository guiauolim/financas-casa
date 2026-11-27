import { Landmark, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionButton, ConfirmAction } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { ListSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { formatDate, todayInSaoPaulo } from "@/lib/finance/dates";
import { PLUGGY_START_DATE, suggestLink } from "@/lib/finance/pluggy-links";
import { createPluggyClient, PluggyError, pluggyConfigFor } from "@/lib/pluggy/client";
import { listAccounts } from "@/lib/services/accounts";
import { listMembers } from "@/lib/services/households";
import { discoverPluggySources, listPluggyLinks, type PluggyLink } from "@/lib/services/pluggy";
import { type CutoverSummary, getCutoverSummary } from "@/lib/services/pluggy-cutover";
import { createClient } from "@/lib/supabase/server";
import { pluggyCutoverAction, syncPluggyAction } from "./actions";
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
  const config = pluggyConfigFor(actor.householdId);
  if (!config) {
    return (
      <EmptyState
        icon={Landmark}
        title="Pluggy não configurada para esta casa"
        description={`Defina PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_IDS (os itens do MeuPluggy) e PLUGGY_HOUSEHOLD_ID=${actor.householdId} (esta casa) nas variáveis de ambiente.`}
      />
    );
  }

  const db = await createClient();
  const [discovery, links, accounts, members, cutover] = await Promise.all([
    discoverPluggySources(createPluggyClient(config)).catch((error: unknown) => {
      if (error instanceof PluggyError) return error;
      throw error;
    }),
    listPluggyLinks(db, { householdId: actor.householdId }),
    listAccounts(db, { householdId: actor.householdId, includeArchived: false }),
    listMembers(db, { householdId: actor.householdId }),
    getCutoverSummary(db, { householdId: actor.householdId }),
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
    closingDay: a.closingDay,
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

  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  return (
    <div className="flex flex-col gap-4">
      <SyncPanel links={links} cutover={cutover} accountNames={accountNames} />
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
    </div>
  );
}

const SOURCE_LABEL = { bank_account: "Conta corrente", card: "Cartão", investments: "Caixinha" } as const;

// Sincronização: primeiro a virada (substituir novembro em diante), depois o botão. Mostra de onde
// vem o saldo de cada conta que soma várias origens (a Conta Conjunta).
function SyncPanel({
  links,
  cutover,
  accountNames,
}: {
  links: PluggyLink[];
  cutover: CutoverSummary;
  accountNames: Map<string, string>;
}) {
  const active = links.filter((l) => l.role !== "ignore");
  if (active.length === 0) return null;
  const start = formatDate(PLUGGY_START_DATE);

  if (cutover.total > 0) {
    return (
      <Panel
        title="Antes de sincronizar"
        description={`A partir de ${start} os lançamentos destas contas vêm do banco (nos cartões, desde a fatura que contém essa data — inclusive as compras do fim do mês anterior que o banco pôs nela). Os lançados à mão ou importados nesse período serão substituídos pelos do banco; o que é de antes fica como está.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[12px] text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-4 font-medium">Conta</th>
                <th className="py-1.5 pr-4 text-right font-medium">Despesas</th>
                <th className="py-1.5 pr-4 text-right font-medium">Receitas</th>
                <th className="py-1.5 text-right font-medium">Transferências</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {cutover.rows.map((row) => (
                <tr key={row.accountId}>
                  <td className="py-2 pr-4">{row.accountName}</td>
                  <td className="py-2 pr-4 text-right font-mono">{row.expense}</td>
                  <td className="py-2 pr-4 text-right font-mono">{row.income}</td>
                  <td className="py-2 text-right font-mono">{row.transfer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cutover.keptPayments > 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {cutover.keptPayments} pagamento{cutover.keptPayments === 1 ? "" : "s"} de fatura lançado
            {cutover.keptPayments === 1 ? "" : "s"} fica{cutover.keptPayments === 1 ? "" : "m"}: a sincronização liga ao pagamento
            que vier do banco.
          </p>
        ) : null}
        <div>
          <ConfirmAction
            action={pluggyCutoverAction}
            trigger={`Substituir ${cutover.total} lançamentos pelos do banco`}
            title={`Excluir ${cutover.total} lançamentos de ${start} em diante?`}
            description="Eles serão trocados pelos que vêm do banco na sincronização. Não dá para desfazer."
            options={[{ label: "Excluir e continuar", fields: {}, destructive: true }]}
          />
        </div>
      </Panel>
    );
  }

  const lastSync = active.map((l) => l.lastSyncedAt).filter((d): d is string => Boolean(d)).sort().at(-1);
  const byAccount = new Map<string, PluggyLink[]>();
  for (const link of active.filter((l) => (l.role === "vault" || l.role === "reserve") && l.accountId)) {
    byAccount.set(link.accountId!, [...(byAccount.get(link.accountId!) ?? []), link]);
  }

  return (
    <Panel
      title="Sincronização"
      description={
        lastSync
          ? `Última sincronização em ${formatDate(todayInSaoPaulo(new Date(lastSync)))}. O banco atualiza os dados a cada 24 horas; todo dia o site sincroniza sozinho.`
          : "Ainda não sincronizado. O banco atualiza os dados a cada 24 horas; depois da primeira vez, o site sincroniza sozinho todo dia."
      }
      actions={
        <ActionButton action={syncPluggyAction} fields={{}} pendingLabel="Sincronizando…" variant="default">
          <RefreshCw aria-hidden /> Sincronizar agora
        </ActionButton>
      }
    >
      {[...byAccount].map(([accountId, parts]) => {
        const total = parts.reduce((sum, l) => sum + (l.lastBalanceCents ?? 0), 0);
        return (
          <div key={accountId} className="flex flex-col gap-2">
            <p className="flex items-baseline justify-between gap-2 font-medium">
              {accountNames.get(accountId) ?? "Conta"}
              {lastSync ? <Money cents={total} /> : null}
            </p>
            {lastSync ? (
              <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground">
                {parts.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span>
                      {SOURCE_LABEL[l.sourceKind]} · {l.label}
                    </span>
                    <Money cents={l.lastBalanceCents ?? 0} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </Panel>
  );
}
