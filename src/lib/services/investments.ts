import "server-only";
import { createHash } from "node:crypto";
import {
  allocationByClass,
  type AssetClass,
  type ClassAllocation,
  type InvestedPoint,
  isB3ImportStale,
  monthlyInvestedSeries,
  type PortfolioInvestment,
  type Snapshot,
  snapshotsByInvestment,
  type Variation,
  variationSincePrevious,
} from "@/lib/finance/portfolio";
import { B3ImportError, type B3Diff, diffB3Import, parseB3Position } from "@/lib/importers/b3-excel";
import type {
  B3InvestmentInput,
  InvestmentCreateInput,
  InvestmentInput,
  InvestmentValueInput,
} from "@/lib/validation/investments";
import { ServiceError, throwIf } from "./errors";
import type { Actor, Db } from "./types";

export type ValueSource = "manual" | "b3";

export type Investment = {
  id: string;
  name: string;
  assetClass: AssetClass;
  institution: string | null;
  ownerUserId: string | null;
  ticker: string | null;
  quantity: number | null;
  avgPriceCents: number | null;
  currentValueCents: number;
  netValueCents: number | null; // líquido informado pela B3 (só exibição)
  valueAsOf: string | null;
  source: ValueSource;
  externalId: string | null;
  aliases: string[];
  archivedOn: string | null;
};

const COLUMNS =
  "id, name, asset_class, institution, owner_user_id, ticker, quantity, avg_price_cents, current_value_cents, net_value_cents, value_as_of, source, external_id, aliases, archived_on";

type Row = {
  id: string;
  name: string;
  asset_class: AssetClass;
  institution: string | null;
  owner_user_id: string | null;
  ticker: string | null;
  quantity: number | null;
  avg_price_cents: number | null;
  current_value_cents: number;
  net_value_cents: number | null;
  value_as_of: string | null;
  source: string;
  external_id: string | null;
  aliases: string[];
  archived_on: string | null;
};

const toInvestment = (row: Row): Investment => ({
  id: row.id,
  name: row.name,
  assetClass: row.asset_class,
  institution: row.institution,
  ownerUserId: row.owner_user_id,
  ticker: row.ticker,
  quantity: row.quantity,
  avgPriceCents: row.avg_price_cents,
  currentValueCents: row.current_value_cents,
  netValueCents: row.net_value_cents,
  valueAsOf: row.value_as_of,
  source: row.source === "b3" ? "b3" : "manual",
  externalId: row.external_id,
  aliases: row.aliases,
  archivedOn: row.archived_on,
});

export const toPortfolioInvestment = (i: Investment): PortfolioInvestment => ({
  id: i.id,
  assetClass: i.assetClass,
  currentValueCents: i.currentValueCents,
  archivedOn: i.archivedOn,
});

// ───────────────────────── Leitura ─────────────────────────

export async function listInvestments(
  db: Db,
  { householdId, includeArchived = false }: { householdId: string; includeArchived?: boolean },
): Promise<Investment[]> {
  let query = db.from("investments").select(COLUMNS).eq("household_id", householdId);
  if (!includeArchived) query = query.is("archived_on", null);
  const { data, error } = await query.order("current_value_cents", { ascending: false }).returns<Row[]>();
  throwIf(error);
  return (data ?? []).map(toInvestment);
}

export async function getInvestment(db: Db, { householdId, investmentId }: { householdId: string; investmentId: string }) {
  const { data, error } = await db
    .from("investments")
    .select(COLUMNS)
    .eq("household_id", householdId)
    .eq("id", investmentId)
    .returns<Row[]>()
    .maybeSingle();
  throwIf(error);
  return data ? toInvestment(data) : null;
}

const PAGE = 1000; // limite padrão de linhas por resposta do PostgREST

// Snapshots da casa (ou de um ativo), paginados para não serem cortados em 1000 linhas.
export async function listSnapshots(
  db: Db,
  { householdId, investmentId }: { householdId: string; investmentId?: string },
): Promise<Snapshot[]> {
  const snapshots: Snapshot[] = [];
  for (let page = 0; ; page++) {
    let query = db
      .from("investment_snapshots")
      .select("id, investment_id, taken_on, value_cents")
      .eq("household_id", householdId);
    if (investmentId) query = query.eq("investment_id", investmentId);
    const { data, error } = await query
      .order("taken_on")
      .order("id")
      .range(page * PAGE, (page + 1) * PAGE - 1);
    throwIf(error);
    for (const row of data ?? []) {
      snapshots.push({ investmentId: row.investment_id, takenOn: row.taken_on, valueCents: row.value_cents });
    }
    if ((data?.length ?? 0) < PAGE) return snapshots;
  }
}

export type B3ImportInfo = { ownerUserId: string; referenceDate: string; importedAt: string; stale: boolean };

// Última importação da B3 de cada pessoa da casa.
export async function latestB3Imports(
  db: Db,
  { householdId, today }: { householdId: string; today: string },
): Promise<B3ImportInfo[]> {
  const { data, error } = await db
    .from("b3_imports")
    .select("owner_user_id, reference_date, imported_at")
    .eq("household_id", householdId)
    .order("reference_date", { ascending: false })
    .order("imported_at", { ascending: false })
    .limit(200);
  throwIf(error);
  const byOwner = new Map<string, B3ImportInfo>();
  for (const row of data ?? []) {
    if (byOwner.has(row.owner_user_id)) continue;
    byOwner.set(row.owner_user_id, {
      ownerUserId: row.owner_user_id,
      referenceDate: row.reference_date,
      importedAt: row.imported_at,
      stale: isB3ImportStale(row.reference_date, today),
    });
  }
  return [...byOwner.values()];
}

export type PortfolioItem = Investment & { variation: Variation | null };

export type Portfolio = {
  items: PortfolioItem[]; // ativos (inclui arquivados só se pedido)
  totalCents: number; // ativos não arquivados
  changeCents: number; // soma das variações desde o snapshot anterior
  allocation: ClassAllocation[];
  series: InvestedPoint[]; // 12 meses
  b3Imports: B3ImportInfo[];
};

export async function getPortfolio(
  db: Db,
  { householdId, today, includeArchived = false }: { householdId: string; today: string; includeArchived?: boolean },
): Promise<Portfolio> {
  const [investments, snapshots, b3Imports] = await Promise.all([
    listInvestments(db, { householdId, includeArchived: true }),
    listSnapshots(db, { householdId }),
    latestB3Imports(db, { householdId, today }),
  ]);
  const byInvestment = snapshotsByInvestment(snapshots);
  const active = investments.filter((i) => i.archivedOn === null);
  const items = (includeArchived ? investments : active).map((i) => ({
    ...i,
    variation: variationSincePrevious(byInvestment.get(i.id)),
  }));
  const portfolio = investments.map(toPortfolioInvestment);
  return {
    items,
    totalCents: active.reduce((sum, i) => sum + i.currentValueCents, 0),
    changeCents: items
      .filter((i) => i.archivedOn === null)
      .reduce((sum, i) => sum + (i.variation?.changeCents ?? 0), 0),
    allocation: allocationByClass(portfolio),
    series: monthlyInvestedSeries(today, portfolio, snapshots, 12),
    b3Imports,
  };
}

// ───────────────────────── Escrita (ativos manuais) ─────────────────────────

async function assertOwnerInHousehold(db: Db, householdId: string, ownerUserId: string | null) {
  if (!ownerUserId) return;
  const { data, error } = await db
    .from("profiles")
    .select("user_id")
    .eq("household_id", householdId)
    .eq("user_id", ownerUserId)
    .maybeSingle();
  throwIf(error);
  if (!data) throw new ServiceError("Escolha um membro da casa como dono.", "ownerUserId");
}

const manualColumns = (input: InvestmentInput) => ({
  name: input.name,
  asset_class: input.assetClass,
  institution: input.institution ?? null,
  owner_user_id: input.ownerUserId,
  ticker: input.ticker ?? null,
  quantity: input.quantity === undefined ? null : Number(input.quantity),
  avg_price_cents: input.avgPriceCents ?? null,
  aliases: input.aliases,
});

async function upsertSnapshot(db: Db, householdId: string, investmentId: string, takenOn: string, valueCents: number) {
  const { error } = await db
    .from("investment_snapshots")
    .upsert(
      { investment_id: investmentId, household_id: householdId, taken_on: takenOn, value_cents: valueCents },
      { onConflict: "investment_id,taken_on" },
    );
  throwIf(error);
}

export async function createInvestment(db: Db, actor: Actor, input: InvestmentCreateInput): Promise<string> {
  await assertOwnerInHousehold(db, actor.householdId, input.ownerUserId);
  const { data, error } = await db
    .from("investments")
    .insert({
      ...manualColumns(input),
      household_id: actor.householdId,
      source: "manual",
      current_value_cents: input.valueCents,
      value_as_of: input.valueDate,
    })
    .select("id")
    .single();
  throwIf(error);
  const id = data!.id;
  try {
    await upsertSnapshot(db, actor.householdId, id, input.valueDate, input.valueCents);
  } catch (snapshotError) {
    // Sem snapshot o ativo ficaria fora do histórico: desfaz o cadastro.
    await db.from("investments").delete().eq("household_id", actor.householdId).eq("id", id);
    throw snapshotError;
  }
  return id;
}

export async function updateInvestment(
  db: Db,
  actor: Actor,
  investmentId: string,
  input: InvestmentInput | B3InvestmentInput,
): Promise<void> {
  const current = await getInvestment(db, { householdId: actor.householdId, investmentId });
  if (!current) throw new ServiceError("Investimento não encontrado.");
  let columns;
  if (current.source === "b3") {
    // Da B3 só se editam nome, classe e apelidos; o resto vem da importação.
    columns = { name: input.name, asset_class: input.assetClass, aliases: input.aliases };
  } else {
    if (!("ownerUserId" in input)) throw new ServiceError("Dados incompletos.");
    await assertOwnerInHousehold(db, actor.householdId, input.ownerUserId);
    columns = manualColumns(input);
  }
  const { error } = await db
    .from("investments")
    .update(columns)
    .eq("household_id", actor.householdId)
    .eq("id", investmentId);
  throwIf(error);
}

// Novo valor de um ativo manual numa data (grava snapshot). O valor atual passa a ser o do
// snapshot mais recente — lançar um valor antigo só preenche o histórico.
// Base da tool `update_investment_position` do bot.
export async function updateInvestmentValue(
  db: Db,
  actor: Actor,
  input: Omit<InvestmentValueInput, "id"> & { investmentId: string },
  today: string,
): Promise<Investment> {
  const current = await getInvestment(db, { householdId: actor.householdId, investmentId: input.investmentId });
  if (!current) throw new ServiceError("Investimento não encontrado.");
  if (current.source === "b3") {
    throw new ServiceError("Este ativo é atualizado pela importação da B3.");
  }
  if (current.archivedOn) throw new ServiceError("Este ativo está arquivado. Reative para atualizar o valor.");
  if (input.date > today) throw new ServiceError("A data não pode ser no futuro.", "date");

  await upsertSnapshot(db, actor.householdId, current.id, input.date, input.valueCents);

  const { data: latest, error: latestError } = await db
    .from("investment_snapshots")
    .select("taken_on, value_cents")
    .eq("household_id", actor.householdId)
    .eq("investment_id", current.id)
    .order("taken_on", { ascending: false })
    .limit(1)
    .single();
  throwIf(latestError);

  const isLatest = latest!.taken_on === input.date;
  const { error } = await db
    .from("investments")
    .update({
      current_value_cents: latest!.value_cents,
      value_as_of: latest!.taken_on,
      ...(isLatest && input.quantity !== undefined ? { quantity: Number(input.quantity) } : {}),
    })
    .eq("household_id", actor.householdId)
    .eq("id", current.id);
  throwIf(error);
  return (await getInvestment(db, { householdId: actor.householdId, investmentId: current.id }))!;
}

// Vendido/resgatado: sai dos totais a partir de hoje, mas o histórico fica.
export async function setInvestmentArchived(
  db: Db,
  actor: Actor,
  investmentId: string,
  archived: boolean,
  today: string,
): Promise<void> {
  const { data, error } = await db
    .from("investments")
    .update({ archived_on: archived ? today : null })
    .eq("household_id", actor.householdId)
    .eq("id", investmentId)
    .select("id");
  throwIf(error);
  if (!data?.length) throw new ServiceError("Investimento não encontrado.");
}

// ───────────────────────── Importação da B3 ─────────────────────────
// O arquivo só existe em memória durante a requisição: nada vai para storage nem para log.

export type B3Preview = {
  referenceDate: string | null;
  sheets: string[];
  ignoredSheets: string[];
  fingerprint: string;
} & B3Diff;

const fingerprintOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function parseOrExplain(bytes: Uint8Array, fileName: string) {
  try {
    return parseB3Position(bytes, fileName);
  } catch (error) {
    if (error instanceof B3ImportError) throw new ServiceError(error.message, "file");
    throw error;
  }
}

async function existingB3OfOwner(db: Db, householdId: string, ownerUserId: string) {
  const { data, error } = await db
    .from("investments")
    .select("id, external_id, name, current_value_cents, quantity, archived_on")
    .eq("household_id", householdId)
    .eq("owner_user_id", ownerUserId)
    .eq("source", "b3");
  throwIf(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    externalId: row.external_id ?? "",
    name: row.name,
    currentValueCents: row.current_value_cents,
    quantity: row.quantity === null ? null : String(row.quantity),
    archived: row.archived_on !== null,
  }));
}

type B3Request = { ownerUserId: string; bytes: Uint8Array; fileName: string };

async function prepare(db: Db, actor: Actor, { ownerUserId, bytes, fileName }: B3Request) {
  await assertOwnerInHousehold(db, actor.householdId, ownerUserId);
  const position = parseOrExplain(bytes, fileName);
  const diff = diffB3Import(position.assets, await existingB3OfOwner(db, actor.householdId, ownerUserId));
  return { position, diff };
}

export async function previewB3Import(db: Db, actor: Actor, request: B3Request): Promise<B3Preview> {
  const { position, diff } = await prepare(db, actor, request);
  return {
    referenceDate: position.referenceDate,
    sheets: position.sheets,
    ignoredSheets: position.ignoredSheets,
    fingerprint: fingerprintOf(request.bytes),
    ...diff,
  };
}

export type B3ImportResult = { created: number; updated: number; archived: number };

export async function applyB3Import(
  db: Db,
  actor: Actor,
  request: B3Request & { referenceDate: string; archiveIds: string[]; fingerprint: string },
  today: string,
): Promise<B3ImportResult> {
  if (fingerprintOf(request.bytes) !== request.fingerprint) {
    throw new ServiceError("O arquivo mudou desde a pré-visualização. Envie de novo.", "file");
  }
  if (request.referenceDate > today) throw new ServiceError("A data da posição não pode ser no futuro.", "referenceDate");

  const { position, diff } = await prepare(db, actor, request);
  if (position.assets.length === 0) throw new ServiceError("O arquivo não tem nenhum ativo para importar.", "file");
  const missing = new Set(diff.missing.map((m) => m.id));

  const items = position.assets.map((a) => ({
    external_id: a.externalId,
    name: a.name,
    ticker: a.code,
    asset_class: a.assetClass,
    institution: a.institution,
    quantity: a.quantity,
    avg_price_cents: a.avgPriceCents,
    value_cents: a.valueCents,
    net_value_cents: a.netValueCents,
  }));

  const { data, error } = await db.rpc("apply_b3_import", {
    p_household_id: actor.householdId,
    p_owner_user_id: request.ownerUserId,
    p_reference_date: request.referenceDate,
    p_items: items,
    p_archive_ids: request.archiveIds.filter((id) => missing.has(id)),
  });
  throwIf(error);
  const result = data as Partial<B3ImportResult> | null;
  return { created: result?.created ?? 0, updated: result?.updated ?? 0, archived: result?.archived ?? 0 };
}
