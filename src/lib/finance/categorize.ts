// Classificação automática de lançamentos pela descrição (fatura do cartão, bot).
// Pura e testável. Prioridade:
//   1. regras aprendidas da casa (merchant_rules) — o trecho mais longo vence;
//   2. palavras-chave padrão de comércios brasileiros comuns;
//   3. apelidos (aliases) das categorias da casa;
//   4. "Outros" (para revisar).

export type CategorizeCategory = {
  id: string;
  name: string;
  type: "expense" | "income" | "transfer";
  aliases: readonly string[];
  archived?: boolean;
};

export type MerchantRule = { pattern: string; categoryId: string };

export type Categorization = {
  categoryId: string | null;
  via: "rule" | "keyword" | "alias" | "fallback";
};

const stripAccents = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "");

// Prefixos de adquirentes/intermediadores que vêm antes do nome do comércio ("MP *LOJA").
const ACQUIRER_PREFIX = /^(?:mp|pg|pagamento|pag|pp|ec|sumup|pagseguro|ps|dl|ebanx|eb)\s*\*\s*/;

// Cidades que os bancos colam no fim da descrição (lista genérica de capitais e polos).
const CITY_SUFFIX = new RegExp(
  ` ?(?:${[
    "sao paulo",
    "rio de janeiro",
    "brasilia",
    "curitiba",
    "porto alegre",
    "salvador",
    "recife",
    "fortaleza",
    "goiania",
    "campinas",
    "barueri",
    "florianopolis",
    "manaus",
    "belem",
    "san francisco",
    "new york",
    "dublin",
    "london",
    "amsterdam",
  ].join("|")})$`,
);

// Descrição -> forma canônica para comparar comércios: minúsculas, sem acento, sem
// prefixo de adquirente, sem país/cidade colados no fim e sem números soltos.
//   "Supermercado Exemplobrasiliabra"      -> "supermercado exemplo"
//   "Mp *Lojaficticiacuritibabra"         -> "lojaficticia"
//   "Ifd*Cantina Imaginariabrasiliabra"    -> "ifood cantina imaginaria"
export function normalizeMerchant(description: string): string {
  let value = stripAccents(description).toLowerCase().trim();
  value = value.replace(/^iof (?:internacional|compra internacional)?\s*-\s*/, "");
  value = value.replace(/^ifd\s*\*\s*/, "ifood ");
  value = value.replace(ACQUIRER_PREFIX, "");
  value = value.replace(/[^a-z0-9]+/g, " ").trim();
  if (value.length > 3) value = value.replace(/ ?(?:bra|usa)$/, "").trim();
  value = value.replace(CITY_SUFFIX, "").trim();
  const words = value.split(" ").filter((word) => word && !/^\d+$/.test(word));
  return words.join(" ");
}

// Trecho que vira regra ao "lembrar para próximas": o comércio normalizado (até 60 caracteres).
export const merchantPattern = (description: string) => normalizeMerchant(description).slice(0, 60).trim();

// ───────────────────────── Palavras-chave padrão ─────────────────────────
// Nome da categoria padrão (seed_default_categories) -> palavras. Casam no início de uma
// palavra da descrição normalizada ("combust" casa "combustiveis"); as de até 4 letras
// precisam ser a palavra inteira ("vivo", "sky").
const DEFAULT_KEYWORDS: Record<string, readonly string[]> = {
  Transporte: ["uber", "99app", "99 pop", "99 taxi", "cabify", "taxi", "estacionamento", "estapar", "pedagio", "sem parar", "conectcar", "veloe", "metro", "onibus"],
  "Restaurantes e delivery": ["ifood", "rappi", "ze delivery", "restaurante", "lanchonete", "lanches", "pizzaria", "pizza", "burger", "hamburgueria", "sushi", "churrascaria", "espetinho", "cafeteria", "mcdonalds", "mc donalds", "subway", "starbucks", "outback"],
  "Combustível": ["posto", "postos", "auto posto", "combustive", "shell", "ipiranga", "petrobras"],
  Mercado: ["supermercado", "supermerc", "mercado", "mercearia", "atacadao", "atacadista", "assai", "pao de acucar", "hortifruti", "sacolao", "padaria", "panificadora", "acougue", "emporio"],
  "Farmácia": ["drogaria", "farmacia", "farma", "droga raia", "pague menos", "panvel"],
  Assinaturas: ["netflix", "spotify", "disney", "hbo", "globoplay", "youtube", "prime video", "deezer", "paramount", "google one", "icloud", "microsoft"],
  Viagem: ["airbnb", "booking", "decolar", "hotel", "pousada", "smiles", "gol linhas", "azul linhas"],
  "Contas da casa": ["vivo", "sky", "enel", "cemig", "copel", "sabesp", "cedae", "comgas", "energia", "telecom", "internet"],
  "Saúde": ["hospital", "laboratorio", "odonto", "dentista", "unimed", "amil", "smart fit", "smartfit", "academia", "consultorio"],
  Pets: ["petz", "cobasi", "petshop", "pet shop", "veterinari"],
  "Educação": ["escola", "faculdade", "udemy", "alura", "coursera", "livraria"],
  Lazer: ["cinema", "cinemark", "ingresso", "sympla", "eventim", "teatro", "steam", "playstation", "xbox"],
  "Vestuário": ["renner", "riachuelo", "zara", "centauro", "netshoes", "hering"],
  "Impostos e taxas": ["iof", "anuidade", "juros", "multa", "encargo", "tarifa", "imposto"],
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wordMatcher = (keyword: string, wholeWord: boolean) =>
  new RegExp(`(?:^| )${escape(keyword)}${wholeWord ? "(?: |$)" : ""}`);

const KEYWORD_MATCHERS: { category: string; keyword: string; regex: RegExp }[] = Object.entries(
  DEFAULT_KEYWORDS,
).flatMap(([category, keywords]) =>
  keywords.map((keyword) => ({ category, keyword, regex: wordMatcher(keyword, keyword.length <= 4) })),
);

const normalizeName = (value: string) => stripAccents(value).toLowerCase().replace(/\s+/g, " ").trim();

export const FALLBACK_CATEGORY = "Outros";

// Categoria pelo nome padrão, ignorando acento/maiúsculas (a casa pode ter renomeado: aí não acha).
export function findCategoryByName<T extends CategorizeCategory>(categories: readonly T[], name: string): T | undefined {
  const target = normalizeName(name);
  return categories.find((c) => !c.archived && normalizeName(c.name) === target);
}

export function categorize(
  description: string,
  {
    categories,
    rules = [],
    type = "expense",
  }: { categories: readonly CategorizeCategory[]; rules?: readonly MerchantRule[]; type?: "expense" | "income" },
): Categorization {
  const usable = categories.filter((c) => c.type === type && !c.archived);
  const usableIds = new Set(usable.map((c) => c.id));
  const merchant = normalizeMerchant(description);
  const raw = normalizeName(description).replace(/[^a-z0-9]+/g, " ");

  // 1. Regras aprendidas (só as que apontam para categoria utilizável deste tipo).
  const rule = rules
    .filter((r) => usableIds.has(r.categoryId) && r.pattern.trim().length >= 2)
    .filter((r) => merchant.includes(normalizeMerchant(r.pattern) || r.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (rule) return { categoryId: rule.categoryId, via: "rule" };

  // 2. Palavras-chave padrão (procura no comércio normalizado e na descrição crua).
  if (type === "expense") {
    for (const { category, keyword, regex } of KEYWORD_MATCHERS) {
      if (!regex.test(merchant) && !regex.test(raw)) continue;
      const byName = findCategoryByName(usable, category);
      const byAlias = usable.find((c) => c.aliases.some((alias) => normalizeName(alias) === keyword));
      const found = byName ?? byAlias;
      if (found) return { categoryId: found.id, via: "keyword" };
    }
  }

  // 3. Apelidos das categorias (palavra inteira).
  for (const category of usable) {
    for (const alias of category.aliases) {
      const normalized = normalizeName(alias).replace(/[^a-z0-9]+/g, " ").trim();
      if (normalized.length >= 2 && wordMatcher(normalized, true).test(merchant)) {
        return { categoryId: category.id, via: "alias" };
      }
    }
  }

  // 4. Outros (ou a categoria genérica de receitas).
  const fallback = findCategoryByName(usable, type === "income" ? "Outras receitas" : FALLBACK_CATEGORY);
  return { categoryId: fallback?.id ?? null, via: "fallback" };
}
