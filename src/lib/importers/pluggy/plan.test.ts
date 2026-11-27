import { describe, expect, it } from "vitest";
import type { PlanCategory } from "@/lib/importers/card-statement/plan";
import type { PluggyBill, PluggyInvestment, PluggyTransaction } from "@/lib/pluggy/client";
import {
  type ExistingExternal,
  type ExistingTx,
  planPluggySync,
  pluggyTxId,
  type SourceData,
  type SyncInput,
  type SyncLink,
  suggestClosingDay,
} from "./plan";

// SÓ dados inventados: comércios, CPFs, ids e valores fictícios.
const HH = "00000000-0000-4000-8000-000000000001";
const COFRE = "00000000-0000-4000-8000-0000000000c0";
const CARTAO = "00000000-0000-4000-8000-0000000000ca";
const ANA = "00000000-0000-4000-8000-0000000000a1";
const BIA = "00000000-0000-4000-8000-0000000000b1";
const DOC_ANA = "11122233344";
const DOC_BIA = "55566677788";

const cat = (id: string, name: string, type: "expense" | "income", aliases: string[] = [], householdDefault = false): PlanCategory => ({
  id,
  name,
  type,
  aliases,
  householdDefault,
});
const categories: PlanCategory[] = [
  cat("c-mercado", "Mercado", "expense", ["supermercado"], true),
  cat("c-outros", "Outros", "expense"),
  cat("c-taxas", "Impostos e taxas", "expense"),
  cat("c-salario", "Salário", "income"),
  cat("c-rend", "Rendimentos", "income"),
  cat("c-reemb", "Reembolso", "income"),
  cat("c-outras-rec", "Outras receitas", "income"),
];

const links: SyncLink[] = [
  { id: "l-corrente-ana", sourceKind: "bank_account", externalId: "acc-ana", role: "vault", accountId: COFRE, ownerUserId: ANA },
  { id: "l-corrente-bia", sourceKind: "bank_account", externalId: "acc-bia", role: "vault", accountId: COFRE, ownerUserId: BIA },
  { id: "l-caixinha", sourceKind: "investments", externalId: "item-bia", role: "reserve", accountId: COFRE, ownerUserId: BIA },
  { id: "l-tesouro", sourceKind: "investments", externalId: "item-ana", role: "investments", accountId: null, ownerUserId: ANA },
  { id: "l-cartao", sourceKind: "card", externalId: "card-1", role: "card", accountId: CARTAO, ownerUserId: ANA },
];

let seq = 0;
const tx = (over: Partial<PluggyTransaction> & { amount: number }): PluggyTransaction => ({
  id: over.id ?? `t${++seq}`,
  accountId: "x",
  date: "2026-11-10T12:00:00.000Z",
  description: "COMPRA FICTICIA",
  type: over.amount < 0 ? "DEBIT" : "CREDIT",
  status: "POSTED",
  ...over,
});
const cardTx = (over: Partial<PluggyTransaction> & { amount: number }) =>
  tx({ type: over.amount < 0 ? "CREDIT" : "DEBIT", ...over, creditCardMetadata: { cardNumber: "1234", ...over.creditCardMetadata } });

const card = { accountId: CARTAO, closingDay: 26, dueDay: 3, paymentAccountId: COFRE, holders: new Map([["1234", BIA]]) };

function input(data: SourceData[], over: Partial<SyncInput> = {}): SyncInput {
  return {
    householdId: HH,
    startDate: "2026-11-01",
    today: "2026-11-26",
    links,
    data,
    cards: new Map([[CARTAO, card]]),
    categories,
    rules: [],
    householdDocs: new Set([DOC_ANA, DOC_BIA]),
    institutions: new Map([["l-tesouro", "Banco Fictício"]]),
    existing: new Map(),
    existingTx: new Map(),
    openPayments: [],
    ...over,
  };
}

const bank = (linkId: string, transactions: PluggyTransaction[], balanceCents: number | null = 0): SourceData => ({
  linkId,
  kind: "bank_account",
  balanceCents,
  transactions,
});
const cardData = (transactions: PluggyTransaction[], bills: PluggyBill[] = []): SourceData => ({
  linkId: "l-cartao",
  kind: "card",
  transactions,
  bills,
});

describe("conta corrente do cofre", () => {
  it("só a partir do corte; saída = despesa, entrada = receita, salário e rendimento reconhecidos", () => {
    const plan = planPluggySync(
      input([
        bank("l-corrente-ana", [
          tx({ id: "antes", amount: -10, date: "2026-10-31T10:00:00Z" }),
          tx({ id: "mercado", amount: -52.3, description: "SUPERMERCADO FICTICIO" }),
          tx({ id: "salario", amount: 5000, operationType: "FOLHA_PAGAMENTO", description: "EMPRESA FICTICIA" }),
          tx({ id: "rend", amount: 1.23, operationType: "RENDIMENTO_APLIC_FINANCEIRA" }),
        ]),
      ]),
    );
    expect(plan.inserts.map((t) => [t.type, t.amount_cents, t.category_id, t.spent_by])).toEqual([
      ["expense", 5230, "c-mercado", null], // categoria da casa → Casa
      ["income", 500000, "c-salario", ANA],
      ["income", 123, "c-rend", ANA],
    ]);
    expect(plan.inserts.every((t) => t.account_id === COFRE)).toBe(true);
    expect(plan.externals.some((e) => e.external_id === "antes")).toBe(false);
  });

  it("pix entre CPFs da casa, aplicação/resgate e débito de fatura são internos (absorvidos)", () => {
    const pixInterno = tx({
      id: "pix",
      amount: -300,
      operationType: "PIX",
      paymentData: { receiver: { documentNumber: { value: "555.666.777-88" } } },
    });
    const plan = planPluggySync(
      input([
        bank("l-corrente-bia", [
          pixInterno,
          tx({ id: "aplic", amount: -1000, operationType: "APLICACAO_FINANCEIRA" }),
          tx({ id: "resgate", amount: 800, operationType: "RESGATE_APLIC_FINANCEIRA" }),
          tx({ id: "deb-fatura", amount: -450, description: "PAGTO FATURA CARTAO FICTICIO" }),
          tx({ id: "deb-espelho", amount: -120, description: "DEBITO QUALQUER", date: "2026-11-12T10:00:00Z" }),
        ]),
        cardData([cardTx({ id: "pag", amount: -120, operationType: "PAGAMENTO_FATURA", date: "2026-11-13T10:00:00Z" })]),
      ]),
    );
    const absorbed = plan.externals.filter((e) => e.status === "absorbed").map((e) => e.external_id);
    expect(absorbed).toEqual(["pix", "aplic", "resgate", "deb-fatura", "deb-espelho"]);
    expect(plan.inserts.filter((t) => t.account_id === COFRE && t.type !== "transfer")).toHaveLength(0);
  });

  it("saldo do cofre = correntes + caixinha (só CDBs ativos)", () => {
    const caixinha: PluggyInvestment[] = [
      { id: "cdb1", name: "CDB FICTICIO", type: "FIXED_INCOME", subtype: "CDB", balance: 1000, status: "ACTIVE" },
      { id: "cdb2", name: "CDB FICTICIO", type: "FIXED_INCOME", subtype: "CDB", balance: 0, status: "TOTAL_WITHDRAWAL" },
    ];
    const plan = planPluggySync(
      input([
        bank("l-corrente-ana", [], 15000),
        bank("l-corrente-bia", [], 2500),
        { linkId: "l-caixinha", kind: "investments", investments: caixinha },
      ]),
    );
    expect(plan.accountBalances).toEqual([{ accountId: COFRE, cents: 117500 }]);
    expect(plan.linkBalances).toContainEqual({ linkId: "l-caixinha", cents: 100000 });
  });
});

describe("cartão", () => {
  it("fatura do banco quando fechada; estimada pelo melhor dia quando aberta", () => {
    const bills = [{ id: "b-dez", dueDate: "2026-12-03T00:00:00Z" }];
    const plan = planPluggySync(
      input([
        cardData(
          [
            // Dia 26 = melhor dia: a estimativa poria na fatura seguinte, mas o banco fechou nela.
            cardTx({ id: "borda", amount: 80, date: "2026-11-26T03:00:00Z", creditCardMetadata: { billId: "b-dez" } }),
            cardTx({ id: "aberta", amount: 40, date: "2026-11-27T10:00:00Z", status: "PENDING" }),
            cardTx({ id: "iof", amount: 2.5, description: "IOF COMPRA EXTERIOR" }),
          ],
          bills,
        ),
      ]),
    );
    const byId = new Map(plan.inserts.map((t) => [t.id, t]));
    expect(byId.get(pluggyTxId(HH, "borda"))?.invoice_ref).toBe("2026-11");
    expect(byId.get(pluggyTxId(HH, "aberta"))?.invoice_ref).toBe("2026-12");
    expect(byId.get(pluggyTxId(HH, "iof"))?.category_id).toBe("c-taxas");
    expect(byId.get(pluggyTxId(HH, "borda"))?.spent_by).toBe(BIA); // dono do final
    expect(plan.externals.find((e) => e.external_id === "borda")?.bill_id).toBe("b-dez");
  });

  it("corte pela fatura: fim de outubro que é da fatura de novembro entra; o resto de outubro não", () => {
    // Melhor dia 26: a fatura de novembro vai de 26/10 a 25/11.
    const bills = [
      { id: "b-out", dueDate: "2026-11-03T00:00:00Z" },
      { id: "b-nov", dueDate: "2026-12-03T00:00:00Z" },
    ];
    const plan = planPluggySync(
      input([
        cardData(
          [
            cardTx({ id: "out-20", amount: 10, date: "2026-10-20T12:00:00Z", creditCardMetadata: { billId: "b-out" } }),
            cardTx({ id: "out-28-banco", amount: 20, date: "2026-10-28T12:00:00Z", creditCardMetadata: { billId: "b-nov" } }),
            cardTx({ id: "pag-out", amount: -500, operationType: "PAGAMENTO_FATURA", date: "2026-10-28T12:00:00Z" }),
            cardTx({ id: "nov-27", amount: 40, date: "2026-11-27T12:00:00Z" }),
          ],
          bills,
        ),
      ]),
    );
    const refs = new Map(plan.inserts.map((t) => [t.id, t.invoice_ref]));
    expect(refs.get(pluggyTxId(HH, "out-28-banco"))).toBe("2026-11");
    expect(refs.get(pluggyTxId(HH, "nov-27"))).toBe("2026-12"); // 26/11 em diante: dezembro
    expect(refs.has(pluggyTxId(HH, "out-20"))).toBe(false); // fatura de outubro: já estava no sistema
    expect(refs.has(pluggyTxId(HH, "pag-out"))).toBe(false); // pagamento de antes do corte

    // Enquanto o banco não fechou novembro, a compra do fim de outubro sem fatura é estimada nela.
    const aberta = planPluggySync(
      input([
        cardData(
          [cardTx({ id: "out-30-estimada", amount: 30, date: "2026-10-30T12:00:00Z", status: "PENDING" })],
          [{ id: "b-out", dueDate: "2026-11-03T00:00:00Z", billClosingDate: "2026-10-25T00:00:00Z" }],
        ),
      ]),
    );
    expect(aberta.inserts[0]?.invoice_ref).toBe("2026-11");
  });

  it("fechamento pelo banco: sem fatura do banco nunca cai numa fatura já fechada", () => {
    // O banco fechou novembro em 26/11 (fatura que vence 03/12). Compras de 25 e 26/11 ainda
    // pendentes, sem fatura: vão para dezembro, não para novembro.
    const bills = [
      { id: "b-out", dueDate: "2026-11-03T00:00:00Z", billClosingDate: "2026-10-27T00:00:00Z" },
      { id: "b-nov", dueDate: "2026-12-03T00:00:00Z", billClosingDate: "2026-11-26T00:00:00Z" },
    ];
    const plan = planPluggySync(
      input([
        cardData(
          [
            cardTx({ id: "na-fatura", amount: 50, date: "2026-11-26T10:00:00Z", creditCardMetadata: { billId: "b-nov" } }),
            cardTx({ id: "pend-25", amount: 62, date: "2026-11-25T10:00:00Z", status: "PENDING" }),
            cardTx({ id: "pend-26", amount: 96.79, date: "2026-11-26T10:00:00Z", status: "PENDING" }),
            cardTx({ id: "dez-28", amount: 10, date: "2026-11-28T10:00:00Z", status: "PENDING" }),
          ],
          bills,
        ),
      ]),
    );
    const refs = new Map(plan.inserts.map((t) => [t.id, t.invoice_ref]));
    expect(refs.get(pluggyTxId(HH, "na-fatura"))).toBe("2026-11");
    expect(refs.get(pluggyTxId(HH, "pend-25"))).toBe("2026-12");
    expect(refs.get(pluggyTxId(HH, "pend-26"))).toBe("2026-12");
    expect(refs.get(pluggyTxId(HH, "dez-28"))).toBe("2026-12");
    // Melhor dia aprendido: dia seguinte ao último fechamento (26/11 → 27).
    expect(plan.cardClosingDays).toEqual([{ accountId: CARTAO, closingDay: 27 }]);
  });

  it("parcelas da mesma compra no mesmo grupo; estorno vira receita", () => {
    const meta = (n: number) => ({ installmentNumber: n, totalInstallments: 3, purchaseDate: "2026-10-20T00:00:00Z" });
    const plan = planPluggySync(
      input([
        cardData([
          cardTx({ id: "p2", amount: 100, date: "2026-11-20T00:00:00Z", description: "LOJA FICTICIA 02/03", creditCardMetadata: meta(2) }),
          cardTx({ id: "p3", amount: 100, date: "2026-12-20T00:00:00Z", description: "LOJA FICTICIA 03/03", creditCardMetadata: meta(3), status: "PENDING" }),
          cardTx({ id: "est", amount: -30, description: "ESTORNO LOJA FICTICIA" }),
        ]),
      ]),
    );
    const [p2, p3, est] = plan.inserts;
    expect(p2!.installment_group_id).toBeTruthy();
    expect(p2!.installment_group_id).toBe(p3!.installment_group_id);
    expect([p2!.installment_number, p3!.installment_number, p3!.installment_total]).toEqual([2, 3, 3]);
    expect([est!.type, est!.category_id]).toEqual(["income", "c-reemb"]);
  });

  it("pagamento: concilia com o 'Pagar fatura' já lançado (opção A); sem par, cria a transferência", () => {
    const manual: ExistingTx = {
      id: "manual-1",
      source: "web",
      type: "transfer",
      amountCents: 45000,
      occurredOn: "2026-11-03",
      accountId: COFRE,
      transferAccountId: CARTAO,
      invoiceRef: "2026-10",
    };
    const plan = planPluggySync(
      input(
        [
          cardData([
            cardTx({ id: "pag1", amount: -450, operationType: "PAGAMENTO_FATURA", date: "2026-11-05T00:00:00Z" }),
            cardTx({ id: "pag2", amount: -99, description: "PAGAMENTO EFETUADO", date: "2026-11-20T00:00:00Z" }),
          ]),
        ],
        { openPayments: [manual] },
      ),
    );
    expect(plan.externals.find((e) => e.external_id === "pag1")).toMatchObject({ transaction_id: "manual-1", status: "linked" });
    expect(plan.counts.reconciled).toBe(1);
    expect(plan.inserts).toEqual([
      expect.objectContaining({ type: "transfer", account_id: COFRE, transfer_account_id: CARTAO, amount_cents: 9900 }),
    ]);
  });
});

describe("idempotência e estado existente", () => {
  const compra = cardTx({ id: "c1", amount: 25, date: "2026-11-27T10:00:00Z", status: "PENDING" });

  it("segunda sincronização com os mesmos dados não cria nada", () => {
    const first = planPluggySync(input([cardData([compra])]));
    const created = first.inserts[0]!;
    const existing = new Map<string, ExistingExternal>([
      ["c1", { externalId: "c1", status: "linked", transactionId: created.id, providerStatus: "PENDING", billId: null, linkId: "l-cartao" }],
    ]);
    const existingTx = new Map<string, ExistingTx>([
      [
        created.id,
        {
          id: created.id,
          source: "pluggy",
          type: "expense",
          amountCents: created.amount_cents,
          occurredOn: created.occurred_on,
          accountId: CARTAO,
          transferAccountId: null,
          invoiceRef: created.invoice_ref,
        },
      ],
    ]);
    const second = planPluggySync(input([cardData([compra])], { existing, existingTx }));
    expect(second.inserts).toHaveLength(0);
    expect(second.updates).toHaveLength(0);
    expect(second.deletes).toHaveLength(0);

    // O banco fechou a fatura: o lançamento passa para a fatura do banco.
    const closed = cardTx({ ...compra, status: "POSTED", creditCardMetadata: { billId: "b-nov" } });
    const third = planPluggySync(
      input([cardData([closed], [{ id: "b-nov", dueDate: "2026-12-03T00:00:00Z" }])], { existing, existingTx }),
    );
    expect(third.updates).toEqual([{ id: created.id, invoice_ref: "2026-11" }]);
  });

  it("lançamento excluído pelo usuário não volta", () => {
    const existing = new Map<string, ExistingExternal>([
      ["c1", { externalId: "c1", status: "linked", transactionId: null, providerStatus: "PENDING", billId: null, linkId: "l-cartao" }],
    ]);
    const plan = planPluggySync(input([cardData([compra])], { existing }));
    expect(plan.inserts).toHaveLength(0);
  });

  it("PENDING que sumiu da Pluggy sai do sistema (só se veio da Pluggy)", () => {
    const existing = new Map<string, ExistingExternal>([
      ["sumiu", { externalId: "sumiu", status: "linked", transactionId: "tx-sumiu", providerStatus: "PENDING", billId: null, linkId: "l-cartao" }],
      ["postada", { externalId: "postada", status: "linked", transactionId: "tx-postada", providerStatus: "POSTED", billId: "b", linkId: "l-cartao" }],
    ]);
    const existingTx = new Map<string, ExistingTx>([
      ["tx-sumiu", { id: "tx-sumiu", source: "pluggy", type: "expense", amountCents: 1, occurredOn: "2026-11-20", accountId: CARTAO, transferAccountId: null, invoiceRef: "2026-11" }],
    ]);
    const plan = planPluggySync(input([cardData([])], { existing, existingTx }));
    expect(plan.deletes).toEqual(["tx-sumiu"]);
    expect(plan.externalDeletes).toEqual(["sumiu"]);
  });
});

describe("investimentos", () => {
  it("agrupa as aplicações por título; resgatado por inteiro fica arquivado", () => {
    const inv = (id: string, name: string, due: string, balance: number, status = "ACTIVE"): PluggyInvestment => ({
      id,
      name,
      type: "FIXED_INCOME",
      subtype: "TREASURY",
      balance,
      quantity: 1,
      dueDate: `${due}T00:00:00Z`,
      date: "2026-11-25T00:00:00Z",
      status,
    });
    const plan = planPluggySync(
      input([
        {
          linkId: "l-tesouro",
          kind: "investments",
          investments: [
            inv("a", "Tesouro Ficticio 2030", "2030-01-01", 100),
            inv("b", "Tesouro Ficticio 2030", "2030-01-01", 50.5),
            inv("c", "Tesouro Ficticio 2027", "2027-01-01", 0, "TOTAL_WITHDRAWAL"),
          ],
        },
      ]),
    );
    expect(plan.investments).toEqual([
      expect.objectContaining({ name: "Tesouro Ficticio 2030", value_cents: 15050, quantity: 2, asset_class: "treasury", owner_user_id: ANA, archived_on: null, institution: "Banco Fictício" }),
      expect.objectContaining({ name: "Tesouro Ficticio 2027", value_cents: 0, archived_on: "2026-11-25" }),
    ]);
  });
});

describe("suggestClosingDay", () => {
  const purchase = (date: string, billId: string) => cardTx({ amount: 10, date: `${date}T12:00:00Z`, creditCardMetadata: { billId } });
  it("meio do intervalo quando as faturas concordam", () => {
    const bills = [
      { id: "b1", dueDate: "2026-09-26" },
      { id: "b2", dueDate: "2026-10-26" },
      { id: "b3", dueDate: "2026-11-26" },
    ];
    const txs = [
      purchase("2026-08-21", "b1"), purchase("2026-09-14", "b1"),
      purchase("2026-09-21", "b2"), purchase("2026-10-14", "b2"),
      purchase("2026-10-21", "b3"), purchase("2026-11-14", "b3"),
    ];
    expect(suggestClosingDay(txs, bills)).toBe(18); // depois de 15, até 21
  });

  it("sem faturas suficientes, sem sugestão", () => {
    expect(suggestClosingDay([], [])).toBeNull();
  });
});
