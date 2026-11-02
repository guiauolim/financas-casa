export type SummaryInput = { type: "expense" | "income" | "transfer"; amountCents: number };

export type Summary = { incomeCents: number; expenseCents: number; balanceCents: number; count: number };

// Totais de uma lista de lançamentos. Transferências (inclusive pagamento de fatura,
// que é transferência da conta para o cartão) não são entrada nem saída: o gasto já
// foi contado na compra.
export function summarize(items: readonly SummaryInput[]): Summary {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const item of items) {
    if (item.type === "income") incomeCents += item.amountCents;
    else if (item.type === "expense") expenseCents += item.amountCents;
  }
  return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents, count: items.length };
}
