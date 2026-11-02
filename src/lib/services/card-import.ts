import "server-only";
import { createHash } from "node:crypto";
import { merchantPattern } from "@/lib/finance/categorize";
import type { SpentBy } from "@/lib/finance/spent-by";
import { CardImportError, type CardStatement, parseCardStatement } from "@/lib/importers/card-statement";
import {
  type CardImportPlan,
  type LineOverride,
  type PlanCategory,
  planCardImport,
  suggestHolders,
} from "@/lib/importers/card-statement/plan";
import { listCardHolders } from "./card-holders";
import { listCategories } from "./categories";
import { ServiceError, throwIf } from "./errors";
import { listMembers } from "./households";
import { listMerchantRules } from "./merchant-rules";
import type { Actor, Db } from "./types";

// Importação de faturas do cartão (site; o bot pode reaproveitar). Os arquivos só existem
// em memória durante a requisição: nada vai para storage nem para log. A prévia e a
// confirmação reprocessam os mesmos bytes (sha256 confere) e o plano é refeito no
// servidor — do cliente vêm só as decisões (incluir, categoria, de quem, regras).

export type StatementFile = { bytes: Uint8Array; fileName: string };

export type CardImportRequest = {
  accountId: string;
  files: StatementFile[];
  holders?: { last4: string; userId: string | null }[]; // mapeamento escolhido na tela
  paymentAccountId?: string;
};

export type CardImportPreview = CardImportPlan & {
  fingerprints: string[];
  card: { id: string; name: string; closingDay: number | null; dueDay: number | null };
  holders: { last4: string; userId: string | null; saved: boolean }[];
};

const fingerprintOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function parseFile(file: StatementFile): CardStatement[] {
  try {
    return parseCardStatement(file.bytes);
  } catch (error) {
    if (error instanceof CardImportError) throw new ServiceError(`${file.fileName}: ${error.message}`, "files");
    throw error;
  }
}

async function loadAccount(db: Db, householdId: string, accountId: string, field: string) {
  const { data, error } = await db
    .from("accounts")
    .select("id, name, kind, closing_day, due_day, archived")
    .eq("household_id", householdId)
    .eq("id", accountId)
    .maybeSingle();
  throwIf(error);
  if (!data) throw new ServiceError("Conta não encontrada.", field);
  if (data.archived) throw new ServiceError("Esta conta está arquivada.", field);
  return data;
}

// Hashes da importação que já estão no banco (inclusive na lixeira), em lotes para não
// estourar o tamanho da URL do PostgREST.
async function existingHashes(db: Db, householdId: string, hashes: string[]) {
  const found = new Map<string, { deleted: boolean }>();
  const unique = [...new Set(hashes)];
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await db
      .from("transactions")
      .select("import_hash, deleted_at")
      .eq("household_id", householdId)
      .in("import_hash", unique.slice(i, i + 100));
    throwIf(error);
    for (const row of data ?? []) if (row.import_hash) found.set(row.import_hash, { deleted: row.deleted_at !== null });
  }
  return found;
}

async function prepare(
  db: Db,
  actor: Actor,
  request: CardImportRequest,
  options: { overrides?: Map<string, LineOverride>; includeFuture?: boolean } = {},
) {
  const account = await loadAccount(db, actor.householdId, request.accountId, "accountId");
  if (account.kind !== "credit_card") throw new ServiceError("Escolha um cartão de crédito.", "accountId");
  if (request.paymentAccountId) {
    const source = await loadAccount(db, actor.householdId, request.paymentAccountId, "paymentAccountId");
    if (source.id === account.id || source.kind === "credit_card") {
      throw new ServiceError("O pagamento sai de uma conta (corrente, poupança...), não de um cartão.", "paymentAccountId");
    }
  }

  const files = request.files.map((file) => ({ statements: parseFile(file) }));
  const [categoryList, rules, savedHolders, members] = await Promise.all([
    listCategories(db, { householdId: actor.householdId, includeArchived: true }),
    listMerchantRules(db, { householdId: actor.householdId }),
    listCardHolders(db, { householdId: actor.householdId, accountId: account.id }),
    listMembers(db, { householdId: actor.householdId }),
  ]);
  const memberIds = new Set(members.map((m) => m.userId));
  const categories: PlanCategory[] = categoryList;
  const card = account.closing_day && account.due_day ? { closingDay: account.closing_day, dueDay: account.due_day } : null;

  const baseInput = {
    householdId: actor.householdId,
    accountId: account.id,
    card,
    files,
    categories,
    rules: rules.map((r) => ({ pattern: r.pattern, categoryId: r.categoryId })),
    paymentAccountId: request.paymentAccountId ?? null,
    includeFuture: options.includeFuture,
    overrides: options.overrides,
  };

  // Finais -> pessoa: o escolhido na tela; senão o salvo/sugerido.
  const known = new Map(savedHolders.map((h) => [h.lastDigits, h.userId]));
  const draft = planCardImport({ ...baseInput, holders: new Map(), existing: new Map() });
  const suggested = suggestHolders(draft.finals, members, known);
  const chosen = new Map<string, string | null>(suggested);
  for (const holder of request.holders ?? []) {
    if (holder.userId && !memberIds.has(holder.userId)) throw new ServiceError("Escolha um membro da casa para cada final.", "holders");
    if (suggested.has(holder.last4)) chosen.set(holder.last4, holder.userId);
  }
  const holders = new Map([...chosen].filter((entry): entry is [string, string] => Boolean(entry[1])));

  const draftWithHolders = planCardImport({ ...baseInput, holders, existing: new Map() });
  const existing = await existingHashes(db, actor.householdId, draftWithHolders.lines.map((l) => l.hash));
  const plan = planCardImport({ ...baseInput, holders, existing });

  return {
    plan,
    account,
    memberIds,
    categories,
    holders: [...chosen].map(([last4, userId]) => ({ last4, userId, saved: known.get(last4) === userId && userId !== null })),
  };
}

export async function previewCardImport(db: Db, actor: Actor, request: CardImportRequest): Promise<CardImportPreview> {
  const { plan, account, holders } = await prepare(db, actor, request, { includeFuture: true });
  return {
    ...plan,
    fingerprints: request.files.map((f) => fingerprintOf(f.bytes)),
    card: { id: account.id, name: account.name, closingDay: account.closing_day, dueDay: account.due_day },
    holders,
  };
}

export type CardImportDecisions = {
  overrides: { hash: string; include?: boolean; categoryId?: string; spentBy?: SpentBy }[];
  rules: { pattern: string; categoryId: string }[]; // "lembrar para próximas"
};

export type CardImportResult = { created: number; duplicates: number; months: string[] };

export async function applyCardImport(
  db: Db,
  actor: Actor,
  request: CardImportRequest & { fingerprints: string[]; includeFuture: boolean; decisions: CardImportDecisions },
): Promise<CardImportResult> {
  if (
    request.fingerprints.length !== request.files.length ||
    request.files.some((file, i) => fingerprintOf(file.bytes) !== request.fingerprints[i])
  ) {
    throw new ServiceError("Os arquivos mudaram desde a pré-visualização. Envie de novo.", "files");
  }

  const overrides = new Map<string, LineOverride>();
  for (const o of request.decisions.overrides) {
    overrides.set(o.hash, { include: o.include, categoryId: o.categoryId, spentBy: o.spentBy });
  }
  const { plan, account, memberIds, categories, holders } = await prepare(db, actor, request, {
    overrides,
    includeFuture: request.includeFuture,
  });
  for (const o of request.decisions.overrides) {
    if (o.spentBy && !memberIds.has(o.spentBy)) throw new ServiceError("Escolha um membro da casa.", "decisions");
  }

  const items = plan.lines.filter((l) => l.include);
  if (items.length === 0) throw new ServiceError("Nenhum lançamento novo para importar.");

  const usableCategory = new Map(categories.filter((c) => !c.archived && c.type !== "transfer").map((c) => [c.id, c]));
  const rules = new Map<string, string>();
  for (const rule of request.decisions.rules) {
    const pattern = merchantPattern(rule.pattern);
    if (pattern.length >= 2 && usableCategory.has(rule.categoryId)) rules.set(pattern, rule.categoryId);
  }

  const { data, error } = await db.rpc("apply_card_import", {
    p_household_id: actor.householdId,
    p_account_id: account.id,
    p_items: items.map((line) => ({
      import_hash: line.hash,
      type: line.type,
      amount_cents: line.amountCents,
      description: line.description.slice(0, 200),
      occurred_on: line.occurredOn,
      category_id: line.type === "transfer" ? null : line.categoryId,
      spent_by: line.type === "transfer" ? null : line.spentBy,
      card_last_digits: line.type === "transfer" ? null : line.cardLast4,
      installment_group_id: line.installment?.groupId ?? null,
      installment_number: line.installment?.number ?? null,
      installment_total: line.installment?.total ?? null,
      ...(line.transferFromAccountId
        ? { account_id: line.transferFromAccountId, transfer_account_id: account.id }
        : {}),
    })),
    p_holders: holders.filter((h) => h.userId).map((h) => ({ last_digits: h.last4, user_id: h.userId })),
    p_rules: [...rules].map(([pattern, categoryId]) => ({ pattern, category_id: categoryId })),
    p_statements: plan.statements.map((s) => ({
      due_date: s.dueDate,
      total_cents: s.fileTotalCents,
      hashes: items.filter((l) => l.statementIndex === s.index && !l.future).map((l) => l.hash),
    })),
  });
  throwIf(error);
  const result = data as { created?: number; duplicates?: number } | null;
  const months = [...new Set(items.filter((l) => !l.future).map((l) => l.occurredOn.slice(0, 7)))].sort();
  return { created: result?.created ?? 0, duplicates: result?.duplicates ?? 0, months };
}
