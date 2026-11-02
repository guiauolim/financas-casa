import { describe, expect, it } from "vitest";
import { closingDateFor, invoiceByReference, invoiceFor } from "./billing";

const nubank = { closingDay: 3, dueDay: 10 }; // vence no mesmo mês do fechamento
const itau = { closingDay: 25, dueDay: 5 }; // vence no mês seguinte

describe("closingDateFor", () => {
  it("limita o dia ao fim do mês", () => {
    expect(closingDateFor({ year: 2026, month: 2 }, 31)).toBe("2026-02-28");
    expect(closingDateFor({ year: 2028, month: 2 }, 31)).toBe("2028-02-29");
    expect(closingDateFor({ year: 2026, month: 4 }, 31)).toBe("2026-04-30");
    expect(closingDateFor({ year: 2026, month: 4 }, 30)).toBe("2026-04-30");
    expect(closingDateFor({ year: 2026, month: 5 }, 31)).toBe("2026-05-31");
  });

  it("rejeita dia inválido", () => {
    expect(() => closingDateFor({ year: 2026, month: 1 }, 0)).toThrow();
    expect(() => closingDateFor({ year: 2026, month: 1 }, 32)).toThrow();
  });
});

describe("invoiceFor", () => {
  it("compra antes do fechamento entra na fatura do mês", () => {
    expect(invoiceFor("2026-11-02", nubank)).toMatchObject({
      reference: "2026-11",
      closingDate: "2026-11-03",
      dueDate: "2026-11-10",
    });
  });

  it("compra no dia do fechamento vai para a fatura seguinte", () => {
    expect(invoiceFor("2026-11-03", nubank)).toMatchObject({
      reference: "2026-12",
      closingDate: "2026-12-03",
      dueDate: "2026-12-10",
    });
  });

  it("compra depois do fechamento vai para a fatura seguinte", () => {
    expect(invoiceFor("2026-11-20", nubank).reference).toBe("2026-12");
  });

  it("vencimento no mês seguinte quando due_day <= closing_day", () => {
    expect(invoiceFor("2026-11-10", itau)).toMatchObject({
      reference: "2026-12",
      closingDate: "2026-11-25",
      dueDate: "2026-12-05",
    });
    expect(invoiceFor("2026-11-25", itau)).toMatchObject({
      reference: "2027-01",
      closingDate: "2026-12-25",
      dueDate: "2027-01-05",
    });
  });

  it("vira o ano", () => {
    expect(invoiceFor("2026-12-28", nubank)).toMatchObject({
      reference: "2027-01",
      closingDate: "2027-01-03",
      dueDate: "2027-01-10",
    });
  });

  it("closing_day 31 em fevereiro fecha no último dia", () => {
    const card = { closingDay: 31, dueDay: 8 };
    expect(invoiceFor("2026-02-27", card)).toMatchObject({ closingDate: "2026-02-28", dueDate: "2026-03-08" });
    // 28/02 já é o dia do fechamento: vai para a fatura que fecha em 31/03.
    expect(invoiceFor("2026-02-28", card)).toMatchObject({ closingDate: "2026-03-31", dueDate: "2026-04-08" });
    // Ano bissexto: fecha em 29/02.
    expect(invoiceFor("2028-02-28", card)).toMatchObject({ closingDate: "2028-02-29" });
    expect(invoiceFor("2028-02-29", card)).toMatchObject({ closingDate: "2028-03-31" });
  });

  it("closing_day 31 em mês de 30 dias", () => {
    const card = { closingDay: 31, dueDay: 10 };
    expect(invoiceFor("2026-04-29", card).closingDate).toBe("2026-04-30");
    expect(invoiceFor("2026-04-30", card).closingDate).toBe("2026-05-31");
  });

  it("due_day 31 em fevereiro vence no último dia", () => {
    const card = { closingDay: 20, dueDay: 31 };
    expect(invoiceFor("2026-02-10", card)).toMatchObject({ closingDate: "2026-02-20", dueDate: "2026-02-28" });
  });

  it("informa o período de compras da fatura", () => {
    expect(invoiceFor("2026-03-10", { closingDay: 31, dueDay: 8 })).toMatchObject({
      periodStart: "2026-02-28",
      periodEnd: "2026-03-30",
    });
    expect(invoiceFor("2026-11-10", itau)).toMatchObject({ periodStart: "2026-10-25", periodEnd: "2026-11-24" });
  });

  it("rejeita data inválida", () => {
    expect(() => invoiceFor("2026-02-30", nubank)).toThrow();
  });
});

describe("invoiceByReference", () => {
  it("é o inverso de invoiceFor", () => {
    for (const card of [nubank, itau, { closingDay: 31, dueDay: 31 }]) {
      for (const date of ["2026-01-15", "2026-02-28", "2026-12-31", "2028-02-29"]) {
        const invoice = invoiceFor(date, card);
        const [year, month] = invoice.reference.split("-").map(Number);
        expect(invoiceByReference({ year: year!, month: month! }, card)).toEqual(invoice);
      }
    }
  });
});
