import { describe, expect, it } from "vitest";
import {
  addMonthsToRef,
  bestPurchaseDate,
  installmentRefs,
  invoiceByDueMonth,
  invoiceByRef,
  invoiceFor,
  invoiceLabel,
  invoiceNameMonth,
  paymentInvoiceRef,
  refForNameMonth,
  transactionInvoiceRefs,
} from "./billing";
import { addMonthsToDate } from "./dates";

// Cartão do tipo Itaú: melhor dia de compra 26 (fecha dia 25), vence dia 5 do mês seguinte.
// "Fatura de novembro" (pelo fechamento) = compras de 26/10 a 25/11.
const itau = { closingDay: 26, dueDay: 5 };
const nubank = { closingDay: 3, dueDay: 10 }; // fecha dia 2, vence no mesmo mês

describe("bestPurchaseDate", () => {
  it("limita o dia ao fim do mês", () => {
    expect(bestPurchaseDate({ year: 2026, month: 2 }, 31)).toBe("2026-02-28");
    expect(bestPurchaseDate({ year: 2028, month: 2 }, 31)).toBe("2028-02-29");
    expect(bestPurchaseDate({ year: 2026, month: 4 }, 31)).toBe("2026-04-30");
    expect(bestPurchaseDate({ year: 2026, month: 5 }, 31)).toBe("2026-05-31");
  });

  it("rejeita dia inválido", () => {
    expect(() => bestPurchaseDate({ year: 2026, month: 1 }, 0)).toThrow();
    expect(() => bestPurchaseDate({ year: 2026, month: 1 }, 32)).toThrow();
  });
});

describe("invoiceFor", () => {
  it("compra no dia 25 entra na fatura que fecha no dia 25", () => {
    expect(invoiceFor("2026-11-25", itau)).toEqual({
      ref: "2026-11",
      dueMonth: "2026-12",
      closingDate: "2026-11-25",
      dueDate: "2026-12-05",
      periodStart: "2026-10-26",
      periodEnd: "2026-11-25",
    });
  });

  it("compra no dia 26 (melhor dia) vai para a fatura seguinte", () => {
    expect(invoiceFor("2026-11-26", itau)).toMatchObject({
      ref: "2026-12",
      closingDate: "2026-12-25",
      dueDate: "2027-01-05",
      periodStart: "2026-11-26",
    });
    expect(invoiceFor("2026-10-26", itau).ref).toBe("2026-11");
  });

  it("vira o ano", () => {
    expect(invoiceFor("2026-12-25", itau)).toMatchObject({ ref: "2026-12", dueDate: "2027-01-05" });
    expect(invoiceFor("2026-12-26", itau)).toMatchObject({
      ref: "2027-01",
      dueMonth: "2027-02",
      closingDate: "2027-01-25",
      dueDate: "2027-02-05",
    });
    expect(invoiceFor("2026-12-28", nubank)).toMatchObject({ ref: "2027-01", closingDate: "2027-01-02", dueDate: "2027-01-10" });
  });

  it("vencimento no mesmo mês quando o dia do vencimento vem depois do melhor dia", () => {
    expect(invoiceFor("2026-11-02", nubank)).toMatchObject({ ref: "2026-11", dueMonth: "2026-11", dueDate: "2026-11-10" });
    expect(invoiceFor("2026-11-03", nubank)).toMatchObject({ ref: "2026-12", closingDate: "2026-12-02" });
  });

  it("mês curto: melhor dia 31 em fevereiro é o último dia", () => {
    const card = { closingDay: 31, dueDay: 8 };
    expect(invoiceFor("2026-02-27", card)).toMatchObject({ ref: "2026-02", closingDate: "2026-02-27", dueDate: "2026-03-08" });
    // 28/02 já é o melhor dia: vai para a fatura que fecha em 30/03.
    expect(invoiceFor("2026-02-28", card)).toMatchObject({ ref: "2026-03", closingDate: "2026-03-30", periodStart: "2026-02-28" });
    // Ano bissexto: o melhor dia é 29/02.
    expect(invoiceFor("2028-02-28", card)).toMatchObject({ ref: "2028-02", closingDate: "2028-02-28" });
    expect(invoiceFor("2028-02-29", card).ref).toBe("2028-03");
    // Mês de 30 dias.
    expect(invoiceFor("2026-04-29", card).closingDate).toBe("2026-04-29");
    expect(invoiceFor("2026-04-30", card).closingDate).toBe("2026-05-30");
  });

  it("mês curto: melhor dia 30 em fevereiro", () => {
    const card = { closingDay: 30, dueDay: 7 };
    expect(invoiceFor("2026-02-27", card)).toMatchObject({ ref: "2026-02", closingDate: "2026-02-27" });
    expect(invoiceFor("2026-02-28", card)).toMatchObject({ ref: "2026-03", periodStart: "2026-02-28", closingDate: "2026-03-29" });
  });

  it("melhor dia 1: a fatura fecha no último dia do mês anterior", () => {
    const card = { closingDay: 1, dueDay: 10 };
    expect(invoiceFor("2026-10-31", card)).toMatchObject({
      ref: "2026-10",
      closingDate: "2026-10-31",
      dueDate: "2026-11-10",
      periodStart: "2026-10-01",
    });
    expect(invoiceFor("2026-11-01", card).ref).toBe("2026-11");
  });

  it("vencimento dia 31 em fevereiro vence no último dia", () => {
    expect(invoiceFor("2026-02-10", { closingDay: 20, dueDay: 31 })).toMatchObject({ dueDate: "2026-02-28" });
  });

  it("rejeita data inválida", () => {
    expect(() => invoiceFor("2026-02-30", itau)).toThrow();
  });
});

describe("invoiceByRef / invoiceByDueMonth", () => {
  it("invoiceByRef é o inverso de invoiceFor", () => {
    for (const card of [nubank, itau, { closingDay: 31, dueDay: 31 }, { closingDay: 1, dueDay: 5 }]) {
      for (const date of ["2026-01-15", "2026-02-28", "2026-12-31", "2028-02-29", "2026-10-26"]) {
        const invoice = invoiceFor(date, card);
        expect(invoiceByRef(invoice.ref, card)).toEqual(invoice);
        expect(invoiceByDueMonth(invoice.dueMonth, card)).toEqual(invoice);
      }
    }
  });

  it("fatura do arquivo pelo vencimento: vence 05/12 → fatura de novembro", () => {
    expect(invoiceByDueMonth("2026-12", itau).ref).toBe("2026-11");
    expect(invoiceByDueMonth("2027-01", itau).ref).toBe("2026-12");
    expect(invoiceByDueMonth("2026-11", nubank).ref).toBe("2026-11");
  });
});

describe("nome da fatura", () => {
  it("pelo fechamento (padrão) ou pelo vencimento", () => {
    const invoice = invoiceFor("2026-11-10", itau);
    expect(invoiceNameMonth(invoice, "closing")).toBe("2026-11");
    expect(invoiceNameMonth(invoice, "due")).toBe("2026-12");
    expect(invoiceLabel(invoice, "closing")).toBe("fatura de novembro de 2026");
    expect(invoiceLabel(invoice, "due")).toBe("fatura de dezembro de 2026");
  });

  it("de nome para chave (\"fatura de novembro\")", () => {
    expect(refForNameMonth("2026-11", "closing", itau)).toBe("2026-11");
    expect(refForNameMonth("2026-12", "due", itau)).toBe("2026-11");
    expect(refForNameMonth("2027-01", "due", itau)).toBe("2026-12");
  });
});

describe("parcelas e pagamentos", () => {
  it("parcelas em faturas consecutivas, virando o ano", () => {
    expect(installmentRefs("2026-11", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(addMonthsToRef("2026-01", -1)).toBe("2025-12");
  });

  it("parcela de compra de julho na fatura de novembro", () => {
    // Compra em 20/07 em 6×: 1ª na fatura de julho (26/06–25/07); a 5ª cai na de novembro.
    const refs = installmentRefs(invoiceFor("2026-07-20", itau).ref, 6);
    expect(refs[4]).toBe("2026-11");
    // Compra em 28/07 (depois do melhor dia): 1ª em agosto; a 4ª é a de novembro.
    expect(installmentRefs(invoiceFor("2026-07-28", itau).ref, 6)[3]).toBe("2026-11");
  });

  it("parcela consecutiva não pula fatura quando a data da parcela é limitada ao fim do mês", () => {
    // Melhor dia 31. Compra em 30/01: fatura de janeiro. A data da 2ª parcela vira 28/02, que já é
    // o melhor dia de fevereiro: pelo cálculo isolado pularia para março — a sequência garante fevereiro.
    const card = { closingDay: 31, dueDay: 8 };
    const first = invoiceFor("2026-01-30", card).ref;
    expect(first).toBe("2026-01");
    expect(invoiceFor(addMonthsToDate("2026-01-30", 1), card).ref).toBe("2026-03");
    expect(installmentRefs(first, 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("pagamento paga a última fatura fechada na data", () => {
    expect(paymentInvoiceRef("2026-12-02", itau)).toBe("2026-11"); // paga a de novembro, que vence 05/12
    expect(paymentInvoiceRef("2026-11-26", itau)).toBe("2026-11"); // logo depois do fechamento
    expect(paymentInvoiceRef("2026-11-25", itau)).toBe("2026-10"); // novembro ainda aberta
  });

  it("transactionInvoiceRefs: cartão, parcelas, pagamento e conta comum", () => {
    expect(transactionInvoiceRefs({ type: "expense", occurredOn: "2026-11-26", account: itau })).toEqual(["2026-12"]);
    expect(transactionInvoiceRefs({ type: "expense", occurredOn: "2026-11-25", count: 3, account: itau })).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
    expect(transactionInvoiceRefs({ type: "income", occurredOn: "2026-11-10", account: itau })).toEqual(["2026-11"]);
    expect(transactionInvoiceRefs({ type: "transfer", occurredOn: "2026-12-02", account: null, transferTo: itau })).toEqual([
      "2026-11",
    ]);
    expect(transactionInvoiceRefs({ type: "expense", occurredOn: "2026-11-10", count: 2, account: null })).toEqual([null, null]);
  });
});
