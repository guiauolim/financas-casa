// Ligações da Pluggy: cada origem (conta corrente, cartão, investimentos de um login) tem um papel.
// Regras puras: papéis válidos por tipo de origem e a sugestão inicial para a tela de Configurações.
//
// Conta Conjunta = o "cofre": as contas correntes (vault) e a caixinha (reserve: os investimentos
// ATIVOS de um login somam no saldo da conta) apontam para ela. Investimentos de verdade (Tesouro…)
// vão para o módulo Investimentos. Cartão sem uso fica ignorado.

// A partir desta data os lançamentos vêm da Pluggy; antes dela fica o que já estava no sistema.
export const PLUGGY_START_DATE = "2026-11-01";

export type PluggySourceKind = "bank_account" | "card" | "investments";
export type PluggyRole = "vault" | "reserve" | "card" | "investments" | "ignore";

export const ROLES_BY_KIND: Record<PluggySourceKind, readonly PluggyRole[]> = {
  bank_account: ["vault", "ignore"],
  card: ["card", "ignore"],
  investments: ["reserve", "investments", "ignore"],
};

export const ROLE_LABELS: Record<PluggyRole, string> = {
  vault: "Somar na conta",
  reserve: "Caixinha: somar na conta",
  card: "Cartão",
  investments: "Investimentos",
  ignore: "Não sincronizar",
};

export const roleNeedsAccount = (role: PluggyRole) => role === "vault" || role === "reserve" || role === "card";

export const sourceKey = (kind: PluggySourceKind, externalId: string) => `${kind}:${externalId}`;

export type DiscoveredSource = {
  key: string;
  itemId: string;
  sourceKind: PluggySourceKind;
  externalId: string;
  label: string;
  balanceCents: number | null; // corrente: saldo; investimentos: soma dos ativos; cartão: null
  activity: number; // cartão: lançamentos desde o corte; investimentos: quantos ativos
  investmentKinds: string[]; // "FIXED_INCOME/CDB", "FIXED_INCOME/TREASURY"…
};

export type LinkAccount = { id: string; name: string; kind: string; ownerUserId: string | null; archived: boolean };

export type LinkChoice = { role: PluggyRole; accountId: string | null };

const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Sugestão para uma origem ainda sem ligação.
// - corrente → soma no cofre (conta corrente conjunta);
// - cartão com uso → o cartão do sistema cujo nome contém o da Pluggy (ou vice-versa); sem uso → ignorar;
// - investimentos só de CDB → caixinha no cofre; outros (Tesouro, ações…) → Investimentos.
export function suggestLink(source: DiscoveredSource, accounts: readonly LinkAccount[]): LinkChoice {
  const active = accounts.filter((a) => !a.archived);
  const vault =
    active.find((a) => a.kind === "checking" && a.ownerUserId === null) ?? active.find((a) => a.kind === "checking");

  if (source.sourceKind === "bank_account") {
    return vault ? { role: "vault", accountId: vault.id } : { role: "ignore", accountId: null };
  }
  if (source.sourceKind === "card") {
    if (source.activity === 0) return { role: "ignore", accountId: null };
    const label = normalize(source.label);
    const card = active.find((a) => {
      if (a.kind !== "credit_card") return false;
      const name = normalize(a.name);
      return label.length > 0 && (name.includes(label) || label.includes(name));
    });
    return card ? { role: "card", accountId: card.id } : { role: "ignore", accountId: null };
  }
  if (source.activity === 0) return { role: "ignore", accountId: null };
  const onlyCdb = source.investmentKinds.length > 0 && source.investmentKinds.every((k) => k.endsWith("/CDB"));
  if (onlyCdb && vault) return { role: "reserve", accountId: vault.id };
  return { role: "investments", accountId: null };
}

// Erro (PT-BR) de uma escolha, ou null.
export function linkChoiceError(
  source: Pick<DiscoveredSource, "sourceKind">,
  choice: LinkChoice,
  accounts: readonly LinkAccount[],
): string | null {
  if (!ROLES_BY_KIND[source.sourceKind].includes(choice.role)) return "Papel inválido para esta origem.";
  if (!roleNeedsAccount(choice.role)) return null;
  const account = accounts.find((a) => a.id === choice.accountId);
  if (!account) return choice.role === "card" ? "Escolha o cartão do sistema." : "Escolha a conta do sistema.";
  if (account.archived) return "Essa conta está arquivada.";
  if ((choice.role === "card") !== (account.kind === "credit_card")) {
    return choice.role === "card" ? "Escolha um cartão de crédito." : "Escolha uma conta (não um cartão).";
  }
  return null;
}
