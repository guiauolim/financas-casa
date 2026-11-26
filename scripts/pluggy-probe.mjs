// Teste SÓ DE LEITURA da Pluggy (MeuPluggy): mostra o FORMATO dos dados que chegam, sem gravar nada.
// Não imprime descrições, nomes de comércio, números de conta nem valores: só tipos, contagens,
// datas e quais campos vêm preenchidos.
//
// Uso: node --env-file=.env.local scripts/pluggy-probe.mjs
// Env: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_IDS (ids separados por vírgula)

const BASE = "https://api.pluggy.ai";
const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_IDS } = process.env;
if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET || !PLUGGY_ITEM_IDS) {
  console.error("Faltam PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET ou PLUGGY_ITEM_IDS no .env.local");
  process.exit(1);
}

async function api(path, apiKey, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(apiKey ? { "X-API-KEY": apiKey } : {}), ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} -> HTTP ${res.status}`);
  return res.json();
}

const filled = (rows, keys) =>
  Object.fromEntries(keys.map((k) => [k, rows.filter((r) => r[k] !== null && r[k] !== undefined).length]));
const countBy = (rows, fn) => rows.reduce((acc, r) => ((acc[fn(r)] = (acc[fn(r)] ?? 0) + 1), acc), {});
const range = (dates) => (dates.length ? `${dates.sort()[0].slice(0, 10)} a ${dates.at(-1).slice(0, 10)}` : "—");

async function allTransactions(apiKey, accountId, dateFrom) {
  const rows = [];
  // `next` é o resto do caminho (GET /v2/transactions{next}), não só o valor do cursor.
  let path = `/v2/transactions?${new URLSearchParams({ accountId, dateFrom })}`;
  while (path) {
    const page = await api(path, apiKey);
    rows.push(...page.results);
    path = page.next ? (page.next.startsWith("/v2/") ? page.next : `/v2/transactions${page.next}`) : null;
  }
  return rows;
}

const { apiKey } = await api("/auth", null, {
  method: "POST",
  body: JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
});
const dateFrom = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);

for (const itemId of PLUGGY_ITEM_IDS.split(",").map((s) => s.trim()).filter(Boolean)) {
  const item = await api(`/items/${itemId}`, apiKey);
  console.log(`\n=== Item: ${item.connector?.name ?? "?"} · status ${item.status} · atualizado ${item.lastUpdatedAt?.slice(0, 10) ?? "?"} · consentimento até ${item.consentExpiresAt?.slice(0, 10) ?? "?"}`);

  const accounts = (await api(`/accounts?itemId=${itemId}`, apiKey)).results ?? [];
  for (const acc of accounts) {
    console.log(`\n  Conta ${acc.type}/${acc.subtype} · nome "${acc.name}" · saldo ${acc.balance == null ? "não vem" : "vem"}`);
    if (acc.creditData) {
      console.log(`    cartão: fechamento ${acc.creditData.balanceCloseDate?.slice(0, 10) ?? "—"} · vencimento ${acc.creditData.balanceDueDate?.slice(0, 10) ?? "—"} · limite ${acc.creditData.creditLimit == null ? "não vem" : "vem"}`);
    }
    const tx = await allTransactions(apiKey, acc.id, dateFrom);
    console.log(`    transações desde ${dateFrom}: ${tx.length} (${range(tx.map((t) => t.date))})`);
    if (tx.length) {
      console.log("    tipo:", countBy(tx, (t) => t.type), "· status:", countBy(tx, (t) => t.status));
      console.log("    operationType:", countBy(tx, (t) => t.operationType ?? "—"));
      console.log("    categorias (Pluggy):", Object.keys(countBy(tx, (t) => t.category ?? "—")).length, "distintas");
      console.log("    campos preenchidos:", filled(tx, ["category", "merchant", "paymentData", "creditCardMetadata", "operationType"]));
      const cc = tx.filter((t) => t.creditCardMetadata);
      if (cc.length) {
        console.log("    cartão: parcelas", cc.filter((t) => t.creditCardMetadata.totalInstallments > 1).length,
          "· com billId", cc.filter((t) => t.creditCardMetadata.billId).length,
          "· com final do cartão", cc.filter((t) => t.creditCardMetadata.cardNumber).length,
          "· valores negativos (pagamento/estorno)", tx.filter((t) => t.amount < 0).length);
      }
    }
    if (acc.type === "CREDIT") {
      try {
        const bills = await api(`/bills?accountId=${acc.id}`, apiKey);
        const list = bills.results ?? [];
        console.log(`    faturas: ${list.length} (vencimentos ${range(list.map((b) => b.dueDate))}) · com pagamentos ${list.filter((b) => b.payments?.length).length}`);
      } catch (e) {
        console.log(`    faturas: indisponível (${e.message})`);
      }
    }
  }

  try {
    const inv = await api(`/investments?itemId=${itemId}&pageSize=500`, apiKey);
    const list = inv.results ?? [];
    console.log(`\n  Investimentos: ${list.length}`);
    if (list.length) {
      console.log("    tipo/subtipo:", countBy(list, (i) => `${i.type}/${i.subtype ?? "—"}`));
      console.log("    status:", countBy(list, (i) => i.status ?? "—"), "· data de referência:", range(list.map((i) => i.date).filter(Boolean)));
      console.log("    campos preenchidos:", filled(list, ["balance", "amount", "amountProfit", "amountWithdrawal", "value", "quantity", "dueDate", "code"]));
    }
  } catch (e) {
    console.log(`\n  Investimentos: indisponível (${e.message})`);
  }
}
