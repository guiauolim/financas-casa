import { addMonthsToRef, type CardCycle, type InvoiceNaming, refForNameMonth } from "./billing";
import { monthRange, parseYearMonth } from "./dates";

// Lançamentos de um mês separados como na tela Transações (e nas respostas do bot):
// - uma seção por cartão com ciclo: a fatura cujo NOME é o mês (pelo nome escolhido no cartão),
//   com tudo o que foi gravado nela — inclusive parcelas de compras antigas;
// - "Fora do cartão": o resto (pix, débito, dinheiro, transferências, pagamentos de fatura),
//   pela data do lançamento. Na tela, `splitOutside` separa em despesas, receitas e transferências.
// Mesma regra do gasto do mês (spending-view.ts): no cartão, a fatura; fora dele, a data.

export type MonthCard = CardCycle & { id: string; naming: InvoiceNaming };

// Formato mínimo de um lançamento (Transaction de lib/services/transactions satisfaz).
export type MonthEntry = {
  id: string;
  type: "expense" | "income" | "transfer";
  amountCents: number;
  occurredOn: string;
  invoiceRef: string | null;
  account: { id: string };
  transferAccount: { id: string } | null;
  category: { id: string } | null;
  spentBy: string | null;
  installment: { groupId: string; number: number; total: number } | null;
};

export type MonthFilters = {
  accountId?: string;
  categoryId?: string;
  // De quem é: id do membro, null = só Casa, undefined = todos.
  spentBy?: string | null;
};

// Fatura (chave, mês do fechamento) cujo nome é `month` ("YYYY-MM") neste cartão.
export const monthInvoiceRef = (month: string, card: MonthCard) => refForNameMonth(month, card.naming, card);

// Faturas que podem ter o nome do mês em algum cartão: pelo fechamento é o próprio mês; pelo
// vencimento, o mês ou o anterior. Serve para buscar no banco sem saber os cartões antes.
export const candidateInvoiceRefs = (month: string) => [addMonthsToRef(month, -1), month];

export function matchesFilters(entry: MonthEntry, filters: MonthFilters): boolean {
  if (filters.accountId && entry.account.id !== filters.accountId && entry.transferAccount?.id !== filters.accountId) {
    return false;
  }
  if (filters.categoryId && entry.category?.id !== filters.categoryId) return false;
  if (filters.spentBy === null && (entry.spentBy !== null || entry.type === "transfer")) return false;
  if (filters.spentBy && entry.spentBy !== filters.spentBy) return false;
  return true;
}

export type InvoiceSection<T> = { cardId: string; ref: string; transactions: T[] };
export type MonthGroups<T> = { invoices: InvoiceSection<T>[]; outside: T[] };

// Separa os lançamentos (na ordem recebida) em faturas do mês e "Fora do cartão". Lançamento no
// cartão que é de outra fatura, ou fora do cartão com data fora do mês, não entra.
// Cartão sem ciclo (sem melhor dia/vencimento) não está em `cards`: entra pela data em "Fora".
export function groupMonth<T extends MonthEntry>(
  entries: readonly T[],
  cards: readonly MonthCard[],
  month: string,
  filters: MonthFilters = {},
): MonthGroups<T> {
  const ym = parseYearMonth(month);
  if (!ym) throw new RangeError(`Mês inválido: ${month}`);
  const { from, to } = monthRange(ym);
  const sections = new Map(cards.map((card) => [card.id, { cardId: card.id, ref: monthInvoiceRef(month, card), transactions: [] as T[] }]));
  const outside: T[] = [];
  for (const entry of entries) {
    if (!matchesFilters(entry, filters)) continue;
    const section = sections.get(entry.account.id);
    if (section) {
      if (entry.invoiceRef === section.ref) section.transactions.push(entry);
    } else if (entry.occurredOn >= from && entry.occurredOn <= to) {
      outside.push(entry);
    }
  }
  return { invoices: [...sections.values()], outside };
}

// "Fora do cartão" em três listas (na ordem recebida): despesas, receitas e transferências
// (inclusive pagamento de fatura, que não entra nos totais).
export function splitOutside<T extends Pick<MonthEntry, "type">>(outside: readonly T[]) {
  const expenses: T[] = [];
  const incomes: T[] = [];
  const transfers: T[] = [];
  for (const entry of outside) {
    if (entry.type === "expense") expenses.push(entry);
    else if (entry.type === "income") incomes.push(entry);
    else transfers.push(entry);
  }
  return { expenses, incomes, transfers };
}

// Valor de um lançamento na fatura: compra e saque somam, estorno abate (como no banco).
export const invoiceAmount = (entry: Pick<MonthEntry, "type" | "amountCents">) =>
  entry.type === "income" ? -entry.amountCents : entry.amountCents;

export const sumInvoice = (entries: readonly Pick<MonthEntry, "type" | "amountCents">[]) =>
  entries.reduce((sum, entry) => sum + invoiceAmount(entry), 0);

export type MonthTotals = {
  cardCents: number; // soma das faturas do mês (compras − estornos)
  outsideCents: number; // despesas fora do cartão
  totalCents: number; // saídas do mês = cartão + fora do cartão
  incomeCents: number; // entradas fora do cartão (estorno no cartão já abate a fatura)
  balanceCents: number; // entradas − saídas
};

// Resumo do topo. Transferências fora do cartão (inclusive pagamento de fatura) não entram: o
// gasto do cartão já está nas faturas.
export function monthTotals(groups: MonthGroups<MonthEntry>): MonthTotals {
  const cardCents = groups.invoices.reduce((sum, section) => sum + sumInvoice(section.transactions), 0);
  let outsideCents = 0;
  let incomeCents = 0;
  for (const entry of groups.outside) {
    if (entry.type === "expense") outsideCents += entry.amountCents;
    else if (entry.type === "income") incomeCents += entry.amountCents;
  }
  const totalCents = cardCents + outsideCents;
  return { cardCents, outsideCents, totalCents, incomeCents, balanceCents: incomeCents - totalCents };
}

// ───────────────────────── Exclusão em lote ─────────────────────────

export type DeleteScope = "one" | "following";
type DeleteTarget = Pick<MonthEntry, "id" | "installment">;

// Há parcela com próximas entre as escolhidas? (para oferecer "esta e as próximas")
export const hasFollowingInstallments = (targets: readonly DeleteTarget[]) =>
  targets.some((t) => t.installment !== null && t.installment.number < t.installment.total);

export type DeletePlan = {
  ids: string[]; // lançamentos apagados pelo id
  groups: { groupId: string; fromNumber: number }[]; // parcelas fromNumber..total do grupo
};

// O que apagar. "one": só os escolhidos. "following": parcelas escolhidas levam as próximas do
// mesmo grupo (a partir da menor escolhida); o resto, só pelo id.
export function planBatchDelete(targets: readonly DeleteTarget[], scope: DeleteScope): DeletePlan {
  const ids = new Set<string>();
  const groups = new Map<string, number>();
  for (const target of targets) {
    if (scope === "following" && target.installment) {
      const current = groups.get(target.installment.groupId);
      if (current === undefined || target.installment.number < current) groups.set(target.installment.groupId, target.installment.number);
    } else {
      ids.add(target.id);
    }
  }
  // Escolhido que já cai num grupo apagado "daqui para frente" não precisa do id.
  for (const target of targets) {
    const from = target.installment ? groups.get(target.installment.groupId) : undefined;
    if (from !== undefined && target.installment!.number >= from) ids.delete(target.id);
  }
  return { ids: [...ids], groups: [...groups].map(([groupId, fromNumber]) => ({ groupId, fromNumber })) };
}

// Resumo para a confirmação: quantos e quanto (no sinal de cada lançamento; transferências à parte).
export function selectionSummary(entries: readonly Pick<MonthEntry, "type" | "amountCents">[]) {
  let expenseCents = 0;
  let incomeCents = 0;
  let transferCents = 0;
  for (const entry of entries) {
    if (entry.type === "expense") expenseCents += entry.amountCents;
    else if (entry.type === "income") incomeCents += entry.amountCents;
    else transferCents += entry.amountCents;
  }
  return { count: entries.length, expenseCents, incomeCents, transferCents };
}
