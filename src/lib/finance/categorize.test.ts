import { describe, expect, it } from "vitest";
import { learnCategoryHistory, type CategorizeCategory, categorize, merchantPattern, normalizeMerchant } from "./categorize";

// Exemplos inventados no formato das faturas (cidade e país colados no fim).
const cat = (id: string, name: string, aliases: string[] = [], type: CategorizeCategory["type"] = "expense") => ({
  id,
  name,
  type,
  aliases,
});

const CATEGORIES: CategorizeCategory[] = [
  cat("mercado", "Mercado", ["mercado", "supermercado", "feira", "padaria"]),
  cat("rest", "Restaurantes e delivery", ["restaurante", "lanche", "ifood", "delivery"]),
  cat("transp", "Transporte", ["uber", "99", "estacionamento"]),
  cat("comb", "Combustível", ["gasolina", "posto"]),
  cat("farm", "Farmácia", ["farmácia", "drogaria"]),
  cat("assin", "Assinaturas", ["netflix", "streaming"]),
  cat("lazer", "Lazer", ["cinema", "bar"]),
  cat("taxas", "Impostos e taxas", ["imposto", "taxa", "juros"]),
  cat("pets", "Pets", ["pet", "ração"]),
  cat("outros", "Outros", ["outros"]),
  { ...cat("velha", "Arquivada", ["lojaficticia"]), archived: true },
  cat("reemb", "Reembolso", ["estorno"], "income"),
  cat("outras", "Outras receitas", [], "income"),
];

describe("normalizeMerchant", () => {
  it.each([
    ["Supermercado Exemplobrasiliabra", "supermercado exemplo"],
    ["Mp *Lojaficticiacuritibabra", "lojaficticia"],
    ["Ifd*Cantina Imaginariabrasiliabra", "ifood cantina imaginaria"],
    ["Drogaria Modelo 1234brasiliabra", "drogaria modelo"],
    ["Iof Internacional - Servicoxyznew Yorkusa", "servicoxyz"],
    ["Padaria Teste          Porto Alegre  Bra", "padaria teste"],
    ["Pg *Bazar Inventadocuritibabra", "bazar inventado"],
    ["Pix Fulano De Tal", "pix fulano de tal"],
    ["  Café   Ação  ", "cafe acao"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeMerchant(input)).toBe(expected);
  });

  it("merchantPattern limita o tamanho", () => {
    expect(merchantPattern(`Loja ${"x".repeat(100)}brasiliabra`).length).toBeLessThanOrEqual(60);
  });
});

describe("categorize", () => {
  const run = (description: string, rules: { pattern: string; categoryId: string }[] = []) =>
    categorize(description, { categories: CATEGORIES, rules });

  it("palavras-chave de comércios comuns", () => {
    expect(run("Uber Uber *Trip Exemplocuritibabra")).toEqual({ categoryId: "transp", via: "keyword" });
    expect(run("Ifd*Cantina Imaginariabrasiliabra")).toEqual({ categoryId: "rest", via: "keyword" });
    expect(run("Auto Posto Fictiociobrasiliabra").categoryId).toBe("comb");
    expect(run("Fictio Combustiveiscuritibabra").categoryId).toBe("comb");
    expect(run("Supermercado Exemplobrasiliabra").categoryId).toBe("mercado");
    expect(run("Drogaria Modelo 1234brasiliabra").categoryId).toBe("farm");
    expect(run("Netflix.comcuritibabra").categoryId).toBe("assin");
    expect(run("Juros De Mora").categoryId).toBe("taxas");
  });

  it("regra aprendida tem prioridade sobre palavra-chave", () => {
    const rules = [{ pattern: "supermercado exemplo", categoryId: "pets" }];
    expect(run("Supermercado Exemplobrasiliabra", rules)).toEqual({ categoryId: "pets", via: "rule" });
  });

  it("entre regras, o trecho mais longo vence", () => {
    const rules = [
      { pattern: "loja", categoryId: "lazer" },
      { pattern: "lojaficticia", categoryId: "pets" },
    ];
    expect(run("Mp *Lojaficticiacuritibabra", rules).categoryId).toBe("pets");
  });

  it("ignora regra de categoria arquivada ou de outro tipo", () => {
    expect(run("Mp *Lojaficticiacuritibabra", [{ pattern: "lojaficticia", categoryId: "velha" }]).via).toBe(
      "fallback",
    );
    expect(run("Mp *Lojaficticiacuritibabra", [{ pattern: "lojaficticia", categoryId: "reemb" }]).via).toBe(
      "fallback",
    );
  });

  it("usa os apelidos das categorias da casa", () => {
    expect(run("Bar Do Inventadobrasiliabra")).toEqual({ categoryId: "lazer", via: "alias" });
  });

  it("sem regra → Outros", () => {
    expect(run("Pix Fulano De Tal")).toEqual({ categoryId: "outros", via: "fallback" });
    expect(run("Xpto Comercio Ficticiobrasiliabra")).toEqual({ categoryId: "outros", via: "fallback" });
  });

  it("palavra-chave curta só casa a palavra inteira", () => {
    expect(run("Vivofictiobrasiliabra").via).toBe("fallback");
  });

  it("receita cai em Outras receitas se nada casar", () => {
    expect(categorize("Estorno Loja Ficticia", { categories: CATEGORIES, type: "income" }).categoryId).toBe("reemb");
    expect(categorize("Credito Ficticio", { categories: CATEGORIES, type: "income" }).categoryId).toBe("outras");
  });

  it("acha a categoria pelo apelido quando a padrão foi renomeada", () => {
    const renamed = CATEGORIES.map((c) => (c.id === "transp" ? { ...c, name: "Locomoção" } : c));
    expect(categorize("Uber Uber *Trip Exemplocuritibabra", { categories: renamed }).categoryId).toBe("transp");
  });
});

describe("histórico de categorias", () => {
  // Dados inventados.
  const cats = [
    { id: "lazer", name: "Lazer", type: "expense" as const, aliases: [] },
    { id: "mercado", name: "Mercado", type: "expense" as const, aliases: ["supermercado"] },
    { id: "outros", name: "Outros", type: "expense" as const, aliases: [] },
    { id: "freela", name: "Freelance", type: "income" as const, aliases: [] },
    { id: "outras-rec", name: "Outras receitas", type: "income" as const, aliases: [] },
  ];
  const entry = (description: string, categoryId: string, type: "expense" | "income", updatedAt: string) => ({
    description,
    categoryId,
    type,
    updatedAt,
  });

  it("a correção mais recente vence; Outros não ensina", () => {
    const history = learnCategoryHistory(
      [
        entry("SUPERMERCADO FICTICIO SAO PAULO", "mercado", "expense", "2026-10-01T10:00:00Z"),
        entry("Supermercado Ficticio Sao Paulo", "lazer", "expense", "2026-11-20T10:00:00Z"), // corrigido depois
        entry("LOJA IMAGINARIA", "outros", "expense", "2026-11-21T10:00:00Z"),
        entry("PIX RECEBIDO CLIENTE FICTICIO", "freela", "income", "2026-11-05T10:00:00Z"),
      ],
      cats,
    );
    expect(categorize("SUPERMERCADO FICTICIO SAO PAULO", { categories: cats, history })).toEqual({ categoryId: "lazer", via: "history" });
    expect(categorize("LOJA IMAGINARIA", { categories: cats, history }).via).toBe("fallback");
    expect(categorize("PIX RECEBIDO CLIENTE FICTICIO", { categories: cats, history, type: "income" })).toEqual({
      categoryId: "freela",
      via: "history",
    });
  });

  it("regra aprendida tem prioridade sobre o histórico", () => {
    const history = learnCategoryHistory([entry("CINEMA FICTICIO", "lazer", "expense", "2026-11-01T00:00:00Z")], cats);
    const result = categorize("CINEMA FICTICIO", { categories: cats, history, rules: [{ pattern: "cinema ficticio", categoryId: "mercado" }] });
    expect(result).toEqual({ categoryId: "mercado", via: "rule" });
  });
});
