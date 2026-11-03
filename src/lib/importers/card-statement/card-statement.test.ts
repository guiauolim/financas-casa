import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { CardImportError, classifyLine, parseCardStatement, parseInstallment } from ".";
import { isPaidStatement, keyDescription, type PlanCategory, type PlanInput, planCardImport, suggestHolders, uuidFromKey } from "./plan";

// Fixtures FICTÍCIAS (scripts/make-itau-fixture.mjs): nomes, finais e comércios inventados.
const fixture = (name: string) => readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url));
const FATURA_1 = fixture("itau-fatura-ficticia-1.xlsx");
const FATURA_2 = fixture("itau-fatura-ficticia-2.xlsx");
const FATURA_1_XLS = fixture("itau-fatura-ficticia.xls");

describe("parseCardStatement (Itaú)", () => {
  it("lê resumo e lançamentos da fatura", () => {
    const [statement] = parseCardStatement(FATURA_1);
    expect(statement).toMatchObject({
      bank: "itau",
      sheet: "Fatura 03-26",
      title: "Fatura Paga - Março/2026",
      dueDate: "2026-03-10",
      totalCents: 71103,
      cardFinal: "1111",
    });
    expect(statement!.lines).toHaveLength(12);
    expect(statement!.lines[1]).toMatchObject({
      date: "2026-03-01",
      description: "Supermercado Exemplobrasiliabra",
      amountCents: 15230,
      installment: null,
      cardLast4: "1111",
      holderKind: "titular",
      holderName: "Ana Exemplo",
      kind: "purchase",
    });
  });

  it("parcela, estorno, encargo, pagamento e cartão virtual/adicional", () => {
    const lines = parseCardStatement(FATURA_1)[0]!.lines;
    const byDesc = (d: string) => lines.find((l) => l.description === d)!;
    expect(byDesc("Pagamento Com Saldo")).toMatchObject({ kind: "payment", amountCents: -150000 });
    expect(byDesc("Estorno Loja Ficticia")).toMatchObject({ kind: "credit", amountCents: -3000, holderKind: "adicional" });
    expect(byDesc("Anuidade Diferenciada").kind).toBe("fee");
    expect(byDesc("Iof Internacional - Servicoxyznew Yorkusa")).toMatchObject({ kind: "fee", cardLast4: "3333" });
    expect(byDesc("Mp *Lojaficticiacuritibabra")).toMatchObject({
      installment: { number: 1, total: 3 },
      cardLast4: "2222",
      date: "2026-02-15",
    });
  });

  it("a soma das linhas (sem o pagamento) bate com o total do arquivo", () => {
    for (const file of [FATURA_1, FATURA_2]) {
      const [s] = parseCardStatement(file);
      const sum = s!.lines.filter((l) => l.kind !== "payment").reduce((a, l) => a + l.amountCents, 0);
      expect(sum).toBe(s!.totalCents);
    }
  });

  it("lê .xls (BIFF) igual ao .xlsx", () => {
    expect(parseCardStatement(FATURA_1_XLS)).toEqual(parseCardStatement(FATURA_1));
  });

  it("recusa o que não é planilha", () => {
    expect(() => parseCardStatement(new TextEncoder().encode("Data;Valor\n"))).toThrow(/não é uma planilha/);
  });

  it("explica layout não reconhecido e coluna faltando", () => {
    const book = (rows: unknown[][]) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Fatura 01-26");
      return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    };
    expect(() => parseCardStatement(book([["Outra", "Coisa"]]))).toThrow(/Layout de fatura não reconhecido/);
    const missing = book([
      ["Cartão", "Valor", "Vencimento"],
      ["Cartao - final 9999", 10, 46100],
      ["Data", "Lançamento", "Valor"],
      [46090, "Loja Ficticia", 10],
    ]);
    expect(() => parseCardStatement(missing)).toThrow(CardImportError);
    expect(() => parseCardStatement(missing)).toThrow('Aba "Fatura 01-26": coluna "Número do cartão" não encontrada.');
    const badValue = book([
      ["Cartão", "Valor", "Vencimento"],
      ["Cartao - final 9999", 10, 46100],
      ["Data", "Lançamento", "Valor", "Número do cartão"],
      [46090, "Loja Ficticia", "abc", "****9999"],
    ]);
    expect(() => parseCardStatement(badValue)).toThrow(/linha 4 \(Loja Ficticia\): valor não reconhecido/);
  });
});

describe("classifyLine / parseInstallment", () => {
  it.each([
    ["Pagamento Com Saldo", -100, "payment"],
    ["Pagamento Efetuado", -100, "payment"],
    ["Iof Internacional - Loja", 10, "fee"],
    ["Juros De Mora", 10, "fee"],
    ["Encargos Refinanciamento", 10, "fee"],
    ["Multa", 10, "fee"],
    ["Estorno Juros", -10, "credit"],
    ["Loja Ficticia", -10, "credit"],
    ["Loja Ficticia", 10, "purchase"],
  ] as const)("%s (%d) → %s", (description, amount, kind) => {
    expect(classifyLine(description, amount)).toBe(kind);
  });

  it("parcelas", () => {
    expect(parseInstallment("Parcela 2 de 10")).toEqual({ number: 2, total: 10 });
    expect(parseInstallment("03/12")).toEqual({ number: 3, total: 12 });
    expect(parseInstallment("Parcela 1 de 1")).toBeNull();
    expect(parseInstallment(null)).toBeNull();
    expect(parseInstallment("Parcela 5 de 3")).toBeNull();
  });
});

// ───────────────────────── Planejamento ─────────────────────────

const HH = "00000000-0000-0000-0000-0000000000h1".replace("h", "0");
const CARD = "00000000-0000-0000-0000-00000000c001";
const CHECKING = "00000000-0000-0000-0000-00000000c002";
const ANA = "00000000-0000-0000-0000-0000000000a1";
const BRUNO = "00000000-0000-0000-0000-0000000000b1";

const c = (id: string, name: string, type: PlanCategory["type"], aliases: string[] = [], householdDefault = false) => ({
  id,
  name,
  type,
  aliases,
  householdDefault,
});
const CATEGORIES: PlanCategory[] = [
  c("mercado", "Mercado", "expense", ["mercado", "supermercado"], true),
  c("pets", "Pets", "expense", ["pet"], true),
  c("rest", "Restaurantes e delivery", "expense", ["ifood"]),
  c("transp", "Transporte", "expense", ["uber"]),
  c("comb", "Combustível", "expense", ["posto"]),
  c("farm", "Farmácia", "expense", ["drogaria"]),
  c("casa", "Moradia", "expense", ["aluguel"], true),
  c("taxas", "Impostos e taxas", "expense", ["taxa"]),
  c("outros", "Outros", "expense", ["outros"]),
  c("reemb", "Reembolso", "income", ["reembolso"]),
];

const parseAll = (...files: Buffer[]) => files.map((f) => ({ statements: parseCardStatement(f) }));

const input = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  householdId: HH,
  accountId: CARD,
  card: { closingDay: 3, dueDay: 10 },
  files: parseAll(FATURA_1),
  holders: new Map([
    ["1111", ANA],
    ["3333", ANA],
    ["2222", BRUNO],
  ]),
  categories: CATEGORIES,
  rules: [],
  existing: new Set<string>(),
  ...overrides,
});

const find = (plan: ReturnType<typeof planCardImport>, description: string, n?: number) =>
  plan.lines.filter((l) => l.description === description && (n === undefined || l.installment?.number === n));

describe("planCardImport", () => {
  it("tipo, categoria e de quem de cada linha", () => {
    const plan = planCardImport(input());
    const one = (d: string) => find(plan, d)[0]!;
    expect(one("Supermercado Exemplobrasiliabra")).toMatchObject({
      type: "expense",
      categoryId: "mercado",
      spentBy: null, // categoria da casa → Casa
      status: "new",
      include: true,
    });
    expect(one("Ifd*Cantina Imaginariabrasiliabra")).toMatchObject({ categoryId: "rest", spentBy: BRUNO });
    expect(one("Servicoxyznew Yorkusa")).toMatchObject({ spentBy: ANA, cardLast4: "3333" });
    expect(one("Iof Internacional - Servicoxyznew Yorkusa")).toMatchObject({ categoryId: "taxas", categoryVia: "fee" });
    expect(one("Estorno Loja Ficticia")).toMatchObject({ type: "income", categoryId: "reemb", amountCents: 3000, spentBy: BRUNO });
    expect(one("Pagamento Com Saldo")).toMatchObject({ type: "transfer", status: "ignored", include: false });
    expect(one("Xpto Comercio Ficticiobrasiliabra")).toMatchObject({ categoryId: "outros", isOther: true });
    expect(plan.otherCount).toBe(4); // Xpto, serviço no exterior, loja e móveis
  });

  it("final sem dono conhecido → Casa", () => {
    const plan = planCardImport(input({ holders: new Map() }));
    expect(find(plan, "Ifd*Cantina Imaginariabrasiliabra")[0]!.spentBy).toBeNull();
  });

  it("parcela: data = compra + (k−1) meses, grupo determinístico", () => {
    const plan = planCardImport(input({ files: parseAll(FATURA_1, FATURA_2) }));
    const [p1] = find(plan, "Mp *Lojaficticiacuritibabra", 1);
    const [p2] = find(plan, "Mp *Lojaficticiacuritibabra", 2).filter((l) => !l.future);
    expect(p1).toMatchObject({ occurredOn: "2026-02-15", amountCents: 10002 });
    expect(p2).toMatchObject({ occurredOn: "2026-03-15", amountCents: 10000, status: "new" });
    expect(p1!.installment!.groupId).toBe(p2!.installment!.groupId);
    expect(p1!.installment!.groupId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const [m3] = find(plan, "Moveis Inventadoscuritibabra", 3).filter((l) => !l.future);
    expect(m3!.occurredOn).toBe("2026-03-12");
  });

  it("duas compras idênticas no mesmo dia viram duas linhas (ordinal)", () => {
    const uber = find(planCardImport(input()), "Uber Uber *Trip Exemplocuritibabra");
    expect(uber).toHaveLength(2);
    expect(uber[0]!.hash).not.toBe(uber[1]!.hash);
    expect(uber.every((l) => l.status === "new")).toBe(true);
  });

  it("reimportar a mesma fatura marca tudo como duplicado", () => {
    const first = planCardImport(input());
    const existing = new Set(first.lines.filter((l) => l.include).map((l) => l.hash));
    const again = planCardImport(input({ existing }));
    const real = again.lines.filter((l) => !l.future && l.kind !== "payment");
    expect(real.every((l) => l.status === "duplicate" && l.duplicateOf === "existing" && !l.include)).toBe(true);
    expect(again.statements[0]!.counts).toMatchObject({ new: 0, duplicate: 11, ignored: 1 });
  });

  it("a mesma fatura duas vezes no mesmo envio: a segunda é duplicada", () => {
    const plan = planCardImport(input({ files: parseAll(FATURA_1, FATURA_1_XLS) }));
    expect(plan.statements[1]!.counts).toMatchObject({ new: 0, duplicate: 11 });
    expect(plan.lines.filter((l) => l.statementIndex === 1 && l.kind !== "payment").every((l) => l.duplicateOf === "batch")).toBe(true);
  });

  it("sem lixeira: linha excluída volta ao reimportar a mesma fatura", () => {
    const first = planCardImport(input());
    const target = find(first, "Supermercado Exemplobrasiliabra")[0]!;
    // Gravou tudo e depois excluiu o mercado: ele não está mais entre os existentes.
    const existing = new Set(first.lines.filter((l) => l.include && l.hash !== target.hash).map((l) => l.hash));
    const plan = planCardImport(input({ existing }));
    expect(find(plan, "Supermercado Exemplobrasiliabra")[0]).toMatchObject({ status: "new", include: true });
    expect(plan.lines.filter((l) => l.status === "new" && !l.future).map((l) => l.hash)).toEqual([target.hash]);
  });

  it("parcelas futuras: geradas depois da última vista e deduplicadas na próxima fatura", () => {
    const first = planCardImport(input({ includeFuture: true }));
    const future = first.lines.filter((l) => l.future);
    // Loja (1/3 → 2/3, 3/3) e Móveis (2/4 → 3/4, 4/4)
    expect(future.map((l) => `${l.description.slice(0, 4)} ${l.installment!.number}/${l.installment!.total} ${l.occurredOn}`)).toEqual([
      "Mp * 2/3 2026-03-15",
      "Mp * 3/3 2026-04-15",
      "Move 3/4 2026-03-12",
      "Move 4/4 2026-04-12",
    ]);
    expect(future.every((l) => l.include && l.status === "new")).toBe(true);
    expect(planCardImport(input()).lines.filter((l) => l.future).every((l) => !l.include)).toBe(true);

    // Gravou fatura 1 + futuras; a fatura 2 traz 2/3 e 3/4 reais → duplicadas.
    const existing = new Set(first.lines.filter((l) => l.include).map((l) => l.hash));
    const second = planCardImport(input({ files: parseAll(FATURA_2), existing }));
    expect(find(second, "Mp *Lojaficticiacuritibabra", 2)[0]).toMatchObject({ status: "duplicate", future: false });
    expect(find(second, "Moveis Inventadoscuritibabra", 3)[0]).toMatchObject({ status: "duplicate" });
    expect(find(second, "Drogaria Modelo 1234brasiliabra")[0]!.status).toBe("new");
  });

  it("faturas sobrepostas: futuras do envio não duplicam as reais do mesmo envio", () => {
    const plan = planCardImport(input({ files: parseAll(FATURA_1, FATURA_2), includeFuture: true }));
    const loja2 = find(plan, "Mp *Lojaficticiacuritibabra", 2);
    expect(loja2.filter((l) => l.include)).toHaveLength(1);
    expect(loja2.find((l) => l.include)!.future).toBe(false);
    expect(find(plan, "Mp *Lojaficticiacuritibabra", 3).filter((l) => l.include)).toHaveLength(1);
  });

  it("totais por fatura e diferença com o arquivo", () => {
    const plan = planCardImport(input({ files: parseAll(FATURA_1, FATURA_2) }));
    expect(plan.statements.map((s) => [s.dueDate, s.fileTotalCents, s.linesTotalCents, s.differenceCents])).toEqual([
      ["2026-03-10", 71103, 71103, 0],
      ["2026-04-10", 77240, 77240, 0],
    ]);
    // Melhor dia 3 → fecha na véspera; a fatura que vence 10/03 é a "2026-03".
    expect(plan.statements[0]).toMatchObject({ closingDate: "2026-03-02", invoiceRef: "2026-03" });

    const [statement] = parseCardStatement(FATURA_1);
    const tampered = { statements: [{ ...statement!, totalCents: 80000 }] };
    expect(planCardImport(input({ files: [tampered] })).statements[0]!.differenceCents).toBe(80000 - 71103);
  });

  it("cada linha fica na fatura do ARQUIVO; parcelas futuras nas faturas seguintes", () => {
    const plan = planCardImport(input({ files: parseAll(FATURA_1, FATURA_2) }));
    const fileLines = plan.lines.filter((l) => !l.future && l.kind !== "payment");
    expect(new Set(fileLines.filter((l) => l.statementIndex === 0).map((l) => l.invoiceRef))).toEqual(new Set(["2026-03"]));
    expect(new Set(fileLines.filter((l) => l.statementIndex === 1).map((l) => l.invoiceRef))).toEqual(new Set(["2026-04"]));
    // Parcela de compra antiga (data original em janeiro) fica na fatura em que apareceu.
    const [m3] = find(plan, "Moveis Inventadoscuritibabra", 3).filter((l) => !l.future);
    expect(m3).toMatchObject({ purchaseDate: "2026-01-12", invoiceRef: "2026-04" });

    // Só a fatura de março: Loja 1/3 está nela; 2/3 e 3/3 são geradas em abril e maio.
    const single = planCardImport(input());
    expect(find(single, "Mp *Lojaficticiacuritibabra").map((l) => [l.installment!.number, l.future, l.invoiceRef])).toEqual([
      [1, false, "2026-03"],
      [2, true, "2026-04"],
      [3, true, "2026-05"],
    ]);
  });

  it("fatura do arquivo mesmo quando o melhor dia cadastrado diria outra", () => {
    // Melhor dia 25, vence dia 10: o arquivo que vence 10/03 é a fatura de fevereiro (fecha 24/02);
    // pelo cálculo, compras de 25/02 em diante iriam para março — mas ficam na do arquivo.
    const plan = planCardImport(input({ card: { closingDay: 25, dueDay: 10 } }));
    expect(plan.statements[0]!.invoiceRef).toBe("2026-02");
    const fileLines = plan.lines.filter((l) => !l.future && l.kind !== "payment");
    expect(fileLines.every((l) => l.invoiceRef === "2026-02")).toBe(true);
    expect(plan.statements[0]!.otherInvoiceCount).toBeGreaterThan(0);
  });

  it("pagamento lançado como transferência paga a fatura anterior à do arquivo", () => {
    const plan = planCardImport(input({ paymentAccountId: "00000000-0000-4000-8000-0000000000aa" }));
    expect(find(plan, "Pagamento Com Saldo")[0]).toMatchObject({ type: "transfer", invoiceRef: "2026-02", include: true });
  });

  it("sem ciclo cadastrado, a fatura é o mês anterior ao vencimento", () => {
    const plan = planCardImport(input({ card: null }));
    expect(plan.statements[0]).toMatchObject({ invoiceRef: "2026-02", closingDate: null });
  });

  it("avisa linhas que o fechamento cadastrado põe em outra fatura", () => {
    const plan = planCardImport(input({ card: { closingDay: 25, dueDay: 10 } }));
    expect(plan.statements[0]!.otherInvoiceCount).toBeGreaterThan(0);
    expect(planCardImport(input()).statements[0]!.otherInvoiceCount).toBe(0);
  });

  it("totais por pessoa (Casa e membros) só do que entra", () => {
    const plan = planCardImport(input());
    const total = (spentBy: string | null) => plan.byPerson.find((p) => p.spentBy === spentBy);
    expect(total(null)).toMatchObject({ expenseCents: 15230, incomeCents: 0 }); // mercado
    expect(total(BRUNO)).toMatchObject({ expenseCents: 6450 + 10002, incomeCents: 3000 });
    expect(plan.finals.map((f) => f.last4).sort()).toEqual(["1111", "2222", "3333"]);
  });

  it("aplica correções da prévia (categoria, de quem, desmarcar)", () => {
    const base = planCardImport(input());
    const xpto = find(base, "Xpto Comercio Ficticiobrasiliabra")[0]!;
    const uber = find(base, "Uber Uber *Trip Exemplocuritibabra")[0]!;
    const plan = planCardImport(
      input({
        overrides: new Map([
          [xpto.hash, { categoryId: "casa", spentBy: null }],
          [uber.hash, { include: false }],
        ]),
      }),
    );
    expect(find(plan, "Xpto Comercio Ficticiobrasiliabra")[0]).toMatchObject({ categoryId: "casa", categoryVia: "user", spentBy: null, isOther: false });
    expect(find(plan, "Uber Uber *Trip Exemplocuritibabra")[0]!.include).toBe(false);
    // categoria de outro tipo é ignorada
    const wrong = planCardImport(input({ overrides: new Map([[xpto.hash, { categoryId: "reemb" }]]) }));
    expect(find(wrong, "Xpto Comercio Ficticiobrasiliabra")[0]!.categoryId).toBe("outros");
  });

  it("pagamento como transferência de uma conta escolhida", () => {
    const plan = planCardImport(input({ paymentAccountId: CHECKING }));
    expect(find(plan, "Pagamento Com Saldo")[0]).toMatchObject({
      type: "transfer",
      status: "new",
      include: true,
      transferFromAccountId: CHECKING,
      amountCents: 150000,
      spentBy: null,
      categoryId: null,
    });
  });

  it("regras aprendidas valem na importação", () => {
    const plan = planCardImport(input({ rules: [{ pattern: "xpto comercio", categoryId: "farm" }] }));
    expect(find(plan, "Xpto Comercio Ficticiobrasiliabra")[0]).toMatchObject({ categoryId: "farm", categoryVia: "rule" });
  });

  it("hash muda com conta e casa (sem colisão entre cartões)", () => {
    const a = planCardImport(input()).lines[1]!.hash;
    const b = planCardImport(input({ accountId: CHECKING })).lines[1]!.hash;
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("helpers de chave", () => {
    expect(keyDescription("  Café  ÁGUA ")).toBe("cafe agua");
    expect(uuidFromKey("x")).toBe(uuidFromKey("x"));
    expect(uuidFromKey("x")).not.toBe(uuidFromKey("y"));
  });
});

describe("suggestHolders", () => {
  const finals = [
    { last4: "1111", holderKind: "titular" as const, holderName: "Ana Exemplo", lines: 9 },
    { last4: "3333", holderKind: "titular" as const, holderName: "Outro Nome", lines: 2 },
    { last4: "2222", holderKind: "adicional" as const, holderName: "Bruno Teste", lines: 4 },
    { last4: "4444", holderKind: "adicional" as const, holderName: "Sem Cadastro", lines: 1 },
  ];
  const members = [
    { userId: ANA, displayName: "Ana" },
    { userId: BRUNO, displayName: "bruno" },
  ];

  it("salvo > primeiro nome > outro final do titular > Casa", () => {
    const result = suggestHolders(finals, members, new Map([["2222", ANA]]));
    expect(Object.fromEntries(result)).toEqual({ "1111": ANA, "3333": ANA, "2222": ANA, "4444": null });
  });

  it("ignora dono salvo que não é mais da casa", () => {
    const result = suggestHolders(finals, members, new Map([["2222", "fora-da-casa"]]));
    expect(result.get("2222")).toBe(BRUNO);
  });
});

describe("isPaidStatement", () => {
  it("título do arquivo manda; sem pista, vencimento passado", () => {
    expect(isPaidStatement({ title: "Fatura Paga - Março/2026", dueDate: "2026-03-10" })).toBe(true);
    expect(isPaidStatement({ title: "Fatura Aberta - Março/2026", dueDate: "2026-03-10" }, "2026-05-01")).toBe(false);
    expect(isPaidStatement({ title: "Fatura fechada", dueDate: "2026-03-10" }, "2026-05-01")).toBe(false);
    expect(isPaidStatement({ title: null, dueDate: "2026-03-10" }, "2026-05-01")).toBe(true);
    expect(isPaidStatement({ title: null, dueDate: "2026-03-10" }, "2026-03-01")).toBe(false);
  });

  it("vem na prévia de cada fatura", () => {
    expect(planCardImport(input()).statements[0]!.paidDetected).toBe(true);
  });
});
