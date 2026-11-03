import { createHash } from "node:crypto";
import { addMonthsToRef, type CardCycle, invoiceByDueMonth, invoiceFor } from "@/lib/finance/billing";
import { type CategorizeCategory, categorize, findCategoryByName, merchantPattern, type MerchantRule } from "@/lib/finance/categorize";
import { addMonthsToDate } from "@/lib/finance/dates";
import { defaultSpentBy, type SpentBy } from "@/lib/finance/spent-by";
import type { CardStatement, StatementLine, StatementLineKind } from "./types";

// Planejamento da importação de faturas: decide tipo, data, categoria, de quem, grupo de
// parcelas, chave de deduplicação e status de cada linha. Puro (sem banco): o serviço
// busca categorias/regras/hashes existentes e chama esta função tanto na prévia quanto na
// confirmação — o cliente só manda decisões (incluir, categoria, de quem), nunca valores.
//
// Chave de deduplicação (import_hash, sha256):
//   compra/estorno/encargo: casa|conta|final|dataCompra|descrição|valor|ordinal
//   parcela:                casa|conta|final|dataCompra|descrição|k/n|ordinal  (sem o valor:
//                           o resto dos centavos fica na 1ª parcela, então os valores variam)
//   pagamento:              casa|conta|pagamento|data|valor|ordinal
// `ordinal` = n-ésima linha idêntica na mesma fatura (duas compras iguais no mesmo dia).
// O installment_group_id é um UUID derivado da mesma compra (sem k), então a mesma compra
// em faturas e importações diferentes cai sempre no mesmo grupo.
//
// Fatura (invoice_ref): cada linha fica na fatura do ARQUIVO (não recalcula pela data — parcela de
// compra antiga aparece com a data original); parcelas futuras geradas vão para as faturas
// seguintes em sequência; o pagamento lançado como transferência paga a fatura anterior à do arquivo.

export type PlanCategory = CategorizeCategory & { householdDefault: boolean };

export type LineStatus = "new" | "duplicate" | "ignored";

export type PlannedLine = {
  hash: string;
  statementIndex: number;
  row: number | null; // null = parcela futura gerada
  kind: StatementLineKind;
  type: "expense" | "income" | "transfer";
  description: string;
  purchaseDate: string;
  occurredOn: string;
  invoiceRef: string; // fatura ("YYYY-MM" do fechamento): a do arquivo; futuras = as seguintes
  amountCents: number; // sempre positivo
  cardLast4: string | null;
  holderKind: StatementLine["holderKind"];
  holderName: string | null;
  installment: { number: number; total: number; groupId: string } | null;
  categoryId: string | null;
  categoryVia: "rule" | "keyword" | "alias" | "fallback" | "fee" | "user" | null;
  isOther: boolean; // caiu em "Outros" (revisar)
  pattern: string; // trecho para "lembrar para próximas"
  spentBy: SpentBy;
  status: LineStatus;
  duplicateOf: "batch" | "existing" | "trash" | null;
  future: boolean; // parcela futura (opção "criar parcelas futuras")
  include: boolean;
  transferFromAccountId: string | null; // pagamento criado como transferência
};

export type StatementSummary = {
  index: number;
  fileIndex: number;
  sheet: string;
  title: string | null;
  dueDate: string;
  invoiceRef: string; // fatura do arquivo ("YYYY-MM" do fechamento), pelo vencimento e o ciclo do cartão
  closingDate: string | null; // pelo melhor dia de compra do cartão
  fileTotalCents: number | null;
  linesTotalCents: number; // compras + encargos − créditos (sem o pagamento)
  differenceCents: number | null; // total do arquivo − soma das linhas
  otherInvoiceCount: number; // linhas que o cálculo pelo melhor dia de compra poria em outra fatura
  paidDetected: boolean; // arquivo de "Fatura Paga" (ou, sem título, já vencida)
  counts: Record<LineStatus, number>;
};

export type PersonTotal = { spentBy: SpentBy; expenseCents: number; incomeCents: number };

export type CardImportPlan = {
  lines: PlannedLine[];
  statements: StatementSummary[];
  byPerson: PersonTotal[];
  otherCount: number;
  finals: { last4: string; holderKind: StatementLine["holderKind"]; holderName: string | null; lines: number }[];
};

export type LineOverride = { include?: boolean; categoryId?: string | null; spentBy?: SpentBy };

export type PlanInput = {
  householdId: string;
  accountId: string;
  card: CardCycle | null;
  files: { statements: CardStatement[] }[];
  holders: ReadonlyMap<string, string>; // final -> user_id
  categories: readonly PlanCategory[];
  rules: readonly MerchantRule[];
  existing: ReadonlyMap<string, { deleted: boolean }>; // import_hash já no banco
  overrides?: ReadonlyMap<string, LineOverride>;
  paymentAccountId?: string | null; // cria pagamentos como transferência desta conta
  includeFuture?: boolean; // inclui as parcelas futuras geradas
  today?: string; // para detectar fatura já vencida (paga) quando o arquivo não diz
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// Descrição para a chave: sem acento, minúsculas, espaços únicos (sem cortar números).
export const keyDescription = (description: string) =>
  description.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

// sha256 -> UUID (formato v4/variante RFC 4122, para caber na coluna uuid).
export function uuidFromKey(key: string): string {
  const hex = sha256(key).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

type Base = { householdId: string; accountId: string };

const baseParts = ({ householdId, accountId }: Base, line: Pick<StatementLine, "cardLast4" | "date" | "description">) => [
  householdId,
  accountId,
  line.cardLast4 ?? "",
  line.date,
  keyDescription(line.description),
];

export function lineIdentity(base: Base, line: StatementLine) {
  if (line.kind === "payment") {
    return { key: [base.householdId, base.accountId, "pagamento", line.date, Math.abs(line.amountCents)].join("|"), groupKey: null };
  }
  const parts = baseParts(base, line);
  if (line.installment) {
    const { number, total } = line.installment;
    return { key: [...parts, `${number}/${total}`].join("|"), groupKey: [...parts, `n${total}`].join("|") };
  }
  return { key: [...parts, line.amountCents].join("|"), groupKey: null };
}

export function planCardImport(input: PlanInput): CardImportPlan {
  const { categories, rules, holders, existing, overrides = new Map(), card } = input;
  const base = { householdId: input.householdId, accountId: input.accountId };
  const byId = new Map(categories.map((c) => [c.id, c]));
  const usable = categories.filter((c) => !c.archived);
  const feeCategory = findCategoryByName(usable.filter((c) => c.type === "expense"), "Impostos e taxas");
  const refundCategory = findCategoryByName(usable.filter((c) => c.type === "income"), "Reembolso");
  const otherCategory = findCategoryByName(usable.filter((c) => c.type === "expense"), "Outros");

  const statements = input.files.flatMap((file, fileIndex) => file.statements.map((s) => ({ s, fileIndex })));
  const lines: PlannedLine[] = [];
  const seen = new Set<string>();
  const summaries: StatementSummary[] = [];
  const groupLast = new Map<string, PlannedLine>(); // maior parcela vista de cada compra
  const groupOrdinal = new Map<string, number>();

  const categorizeLine = (line: Pick<StatementLine, "kind" | "description">) => {
    if (line.kind === "fee" && feeCategory) return { categoryId: feeCategory.id, via: "fee" as const };
    if (line.kind === "credit") {
      const result = categorize(line.description, { categories, rules, type: "income" });
      if (result.via === "fallback" && refundCategory) return { categoryId: refundCategory.id, via: "fallback" as const };
      return result;
    }
    if (line.kind === "payment") return { categoryId: null, via: null };
    return categorize(line.description, { categories, rules, type: "expense" });
  };

  const finalize = (line: PlannedLine): PlannedLine => {
    const override = overrides.get(line.hash);
    if (override && line.type !== "transfer") {
      if (override.categoryId !== undefined) {
        const category = override.categoryId ? byId.get(override.categoryId) : undefined;
        if (category && category.type === line.type && !category.archived) {
          line.categoryId = category.id;
          line.categoryVia = "user";
        }
      }
      if (override.spentBy !== undefined) line.spentBy = override.spentBy;
    }
    line.isOther = line.type === "expense" && (!line.categoryId || line.categoryId === otherCategory?.id);

    const found = existing.get(line.hash);
    if (line.status !== "ignored") {
      if (found) {
        line.status = "duplicate";
        line.duplicateOf = found.deleted ? "trash" : "existing";
      } else if (seen.has(line.hash)) {
        line.status = "duplicate";
        line.duplicateOf = "batch";
      }
    }
    seen.add(line.hash);
    line.include = line.status === "new" && (line.future ? Boolean(input.includeFuture) : true);
    if (override?.include === false) line.include = false;
    return line;
  };

  statements.forEach(({ s, fileIndex }, index) => {
    // Sem ciclo cadastrado: a fatura que vence num mês costuma fechar no mês anterior.
    const dueMonth = s.dueDate.slice(0, 7);
    const statementInvoice = card ? invoiceByDueMonth(dueMonth, card) : null;
    const statementRef = statementInvoice?.ref ?? addMonthsToRef(dueMonth, -1);
    const ordinals = new Map<string, number>();
    const counts: Record<LineStatus, number> = { new: 0, duplicate: 0, ignored: 0 };
    let linesTotalCents = 0;
    let otherInvoiceCount = 0;

    for (const raw of s.lines) {
      const { key, groupKey } = lineIdentity(base, raw);
      const ordinal = (ordinals.get(key) ?? 0) + 1;
      ordinals.set(key, ordinal);
      const hash = sha256(`${key}|${ordinal}`);
      const groupId = groupKey ? uuidFromKey(`${groupKey}|${ordinal}`) : null;
      if (groupId) groupOrdinal.set(groupId, ordinal);

      const isPayment = raw.kind === "payment";
      const asTransfer = isPayment && Boolean(input.paymentAccountId);
      const type = isPayment ? "transfer" : raw.kind === "credit" ? "income" : "expense";
      const occurredOn = raw.installment ? addMonthsToDate(raw.date, raw.installment.number - 1) : raw.date;
      const { categoryId, via } = categorizeLine(raw);
      const holderUserId = raw.cardLast4 ? holders.get(raw.cardLast4) : undefined;
      const householdDefault = categoryId ? byId.get(categoryId)?.householdDefault : false;

      if (!isPayment) {
        linesTotalCents += raw.amountCents;
        if (card) {
          const calculated = invoiceFor(raw.date, card).ref;
          const expected = raw.installment ? addMonthsToRef(calculated, raw.installment.number - 1) : calculated;
          if (expected !== statementRef) otherInvoiceCount++;
        }
      }

      const line = finalize({
        hash,
        statementIndex: index,
        row: raw.row,
        kind: raw.kind,
        type,
        description: raw.description,
        purchaseDate: raw.date,
        occurredOn,
        invoiceRef: isPayment ? addMonthsToRef(statementRef, -1) : statementRef,
        amountCents: Math.abs(raw.amountCents),
        cardLast4: raw.cardLast4,
        holderKind: raw.holderKind,
        holderName: raw.holderName,
        installment: raw.installment && groupId ? { ...raw.installment, groupId } : null,
        categoryId,
        categoryVia: via,
        isOther: false,
        pattern: merchantPattern(raw.description),
        spentBy: isPayment ? null : defaultSpentBy({ categoryHouseholdDefault: householdDefault, personUserId: holderUserId }),
        status: isPayment && !asTransfer ? "ignored" : "new",
        duplicateOf: null,
        future: false,
        include: false,
        transferFromAccountId: asTransfer ? input.paymentAccountId! : null,
      });
      counts[line.status]++;
      lines.push(line);

      if (line.installment) {
        const current = groupLast.get(line.installment.groupId);
        if (!current || current.installment!.number < line.installment.number) groupLast.set(line.installment.groupId, line);
      }
    }

    summaries.push({
      index,
      fileIndex,
      sheet: s.sheet,
      title: s.title,
      dueDate: s.dueDate,
      invoiceRef: statementRef,
      closingDate: statementInvoice?.closingDate ?? null,
      fileTotalCents: s.totalCents,
      linesTotalCents,
      differenceCents: s.totalCents === null ? null : s.totalCents - linesTotalCents,
      otherInvoiceCount,
      paidDetected: isPaidStatement(s, input.today),
      counts,
    });
  });

  // Parcelas futuras: depois da maior parcela vista de cada compra, até a última.
  for (const last of groupLast.values()) {
    const { number, total, groupId } = last.installment!;
    const ordinal = groupOrdinal.get(groupId) ?? 1;
    for (let k = number + 1; k <= total; k++) {
      const key = [...baseParts(base, { cardLast4: last.cardLast4, date: last.purchaseDate, description: last.description }), `${k}/${total}`].join("|");
      lines.push(
        finalize({
          ...last,
          hash: sha256(`${key}|${ordinal}`),
          row: null,
          occurredOn: addMonthsToDate(last.purchaseDate, k - 1),
          invoiceRef: addMonthsToRef(last.invoiceRef, k - number),
          installment: { number: k, total, groupId },
          status: "new",
          duplicateOf: null,
          future: true,
          include: false,
        }),
      );
    }
  }

  const byPersonMap = new Map<SpentBy, PersonTotal>();
  for (const line of lines) {
    if (!line.include && line.status !== "duplicate") continue;
    if (line.type === "transfer" || line.future) continue;
    const total = byPersonMap.get(line.spentBy) ?? { spentBy: line.spentBy, expenseCents: 0, incomeCents: 0 };
    if (line.type === "expense") total.expenseCents += line.amountCents;
    else total.incomeCents += line.amountCents;
    byPersonMap.set(line.spentBy, total);
  }

  const finals = new Map<string, CardImportPlan["finals"][number]>();
  for (const { s } of statements) {
    for (const line of s.lines) {
      if (!line.cardLast4) continue;
      const current = finals.get(line.cardLast4);
      if (current) current.lines++;
      else finals.set(line.cardLast4, { last4: line.cardLast4, holderKind: line.holderKind, holderName: line.holderName, lines: 1 });
    }
  }

  return {
    lines,
    statements: summaries,
    byPerson: [...byPersonMap.values()].sort((a, b) => b.expenseCents - a.expenseCents),
    otherCount: lines.filter((l) => l.include && l.isOther).length,
    finals: [...finals.values()].sort((a, b) => b.lines - a.lines),
  };
}

// Sugestão de dono para cada final, na ordem: o que já está salvo (card_holders) →
// membro com o mesmo primeiro nome do portador no arquivo → outro final "titular" já
// resolvido no mesmo envio (ex.: cartão virtual do titular). Sem pista: null (Casa).
export function suggestHolders(
  finals: CardImportPlan["finals"],
  members: readonly { userId: string; displayName: string }[],
  known: ReadonlyMap<string, string>,
): Map<string, string | null> {
  const firstName = (value: string | null) => keyDescription(value ?? "").split(" ")[0] ?? "";
  const result = new Map<string, string | null>();
  for (const final of finals) {
    const saved = known.get(final.last4);
    if (saved && members.some((m) => m.userId === saved)) {
      result.set(final.last4, saved);
      continue;
    }
    const name = firstName(final.holderName);
    const byName = name ? members.filter((m) => firstName(m.displayName) === name) : [];
    result.set(final.last4, byName.length === 1 ? byName[0]!.userId : null);
  }
  const titularOwners = new Set(
    finals.filter((f) => f.holderKind === "titular" && result.get(f.last4)).map((f) => result.get(f.last4)!),
  );
  if (titularOwners.size === 1) {
    const [owner] = titularOwners;
    for (const f of finals) if (f.holderKind === "titular" && !result.get(f.last4)) result.set(f.last4, owner!);
  }
  return result;
}

// Fatura já paga? O título do arquivo manda ("Fatura Paga" sim; "aberta"/"fechada"/"atual"
// não); sem pista no título, vale o vencimento já passado.
export function isPaidStatement(statement: Pick<CardStatement, "title" | "dueDate">, today?: string): boolean {
  const title = keyDescription(statement.title ?? "");
  if (/\bpaga\b/.test(title)) return true;
  if (/\b(aberta|fechada|atual|em aberto)\b/.test(title)) return false;
  return Boolean(today && statement.dueDate < today);
}
