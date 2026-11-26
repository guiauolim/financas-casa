import "server-only";
import { z } from "zod";

// Cliente da API da Pluggy (MeuPluggy, uso pessoal). Só leitura. Toda resposta passa por Zod
// (entrada externa). Nada de log do conteúdo: são dados financeiros reais.
// Docs: https://docs.pluggy.ai (auth: POST /auth → apiKey de 2h no header X-API-KEY).

const BASE_URL = "https://api.pluggy.ai";

export type PluggyConfig = { clientId: string; clientSecret: string; itemIds: string[] };

// null = Pluggy não configurada (a tela explica o que falta).
export function pluggyConfig(): PluggyConfig | null {
  const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
  const itemIds = (process.env.PLUGGY_ITEM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!clientId || !clientSecret || itemIds.length === 0) return null;
  return { clientId, clientSecret, itemIds };
}

export class PluggyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PluggyError";
  }
}

const nullish = <T extends z.ZodType>(schema: T) => schema.nullish();

export const itemSchema = z.object({
  id: z.string(),
  status: z.string(),
  lastUpdatedAt: nullish(z.string()),
  consentExpiresAt: nullish(z.string()),
  connector: nullish(z.object({ name: z.string() })),
});

export const accountSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  type: z.enum(["BANK", "CREDIT"]),
  subtype: nullish(z.string()),
  name: z.string(),
  balance: nullish(z.number()),
  taxNumber: nullish(z.string()),
  creditData: nullish(
    z.object({
      balanceCloseDate: nullish(z.string()),
      balanceDueDate: nullish(z.string()),
      creditLimit: nullish(z.number()),
    }),
  ),
});

export const transactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  type: z.enum(["DEBIT", "CREDIT"]),
  status: nullish(z.enum(["PENDING", "POSTED"])),
  category: nullish(z.string()),
  operationType: nullish(z.string()),
  paymentData: nullish(
    z.object({
      payer: nullish(z.object({ documentNumber: nullish(z.object({ value: nullish(z.string()) })) })),
      receiver: nullish(z.object({ documentNumber: nullish(z.object({ value: nullish(z.string()) })) })),
    }),
  ),
  creditCardMetadata: nullish(
    z.object({
      installmentNumber: nullish(z.number()),
      totalInstallments: nullish(z.number()),
      totalAmount: nullish(z.number()),
      purchaseDate: nullish(z.string()),
      cardNumber: nullish(z.string()),
      billId: nullish(z.string()),
    }),
  ),
});

export const billSchema = z.object({
  id: z.string(),
  dueDate: z.string(),
  totalAmount: nullish(z.number()),
});

export const investmentSchema = z.object({
  id: z.string(),
  itemId: nullish(z.string()),
  name: z.string(),
  code: nullish(z.string()),
  type: z.string(),
  subtype: nullish(z.string()),
  balance: nullish(z.number()),
  amount: nullish(z.number()),
  quantity: nullish(z.number()),
  date: nullish(z.string()),
  dueDate: nullish(z.string()),
  status: nullish(z.string()),
});

export type PluggyItem = z.infer<typeof itemSchema>;
export type PluggyAccount = z.infer<typeof accountSchema>;
export type PluggyTransaction = z.infer<typeof transactionSchema>;
export type PluggyBill = z.infer<typeof billSchema>;
export type PluggyInvestment = z.infer<typeof investmentSchema>;

const pageOf = <T extends z.ZodType>(schema: T) => z.object({ results: z.array(schema) });
const cursorPageOf = <T extends z.ZodType>(schema: T) =>
  z.object({ results: z.array(schema), next: nullish(z.string()) });
const numberedPageOf = <T extends z.ZodType>(schema: T) =>
  z.object({ results: z.array(schema), totalPages: nullish(z.number()) });

export type PluggyClient = ReturnType<typeof createPluggyClient>;

export function createPluggyClient(config: PluggyConfig, fetchImpl: typeof fetch = fetch) {
  let apiKey: { value: string; expiresAt: number } | null = null;

  async function request<T extends z.ZodType>(path: string, schema: T, init: RequestInit = {}): Promise<z.infer<T>> {
    const res = await fetchImpl(BASE_URL + path, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", ...init.headers },
    });
    // Mensagem sem query string nem corpo: nada de dado financeiro nos logs.
    if (!res.ok) throw new PluggyError(`Pluggy ${path.split("?")[0]} respondeu ${res.status}`, res.status);
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new PluggyError(`Resposta inesperada da Pluggy em ${path.split("?")[0]}`);
    return parsed.data;
  }

  async function key(): Promise<string> {
    if (apiKey && apiKey.expiresAt > Date.now()) return apiKey.value;
    const { apiKey: value } = await request("/auth", z.object({ apiKey: z.string() }), {
      method: "POST",
      body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret }),
    });
    apiKey = { value, expiresAt: Date.now() + 100 * 60_000 }; // vale 2h; renova antes
    return value;
  }

  const get = async <T extends z.ZodType>(path: string, schema: T) =>
    request(path, schema, { headers: { "X-API-KEY": await key() } });

  return {
    itemIds: config.itemIds,

    getItem: (itemId: string) => get(`/items/${encodeURIComponent(itemId)}`, itemSchema),

    async listAccounts(itemId: string): Promise<PluggyAccount[]> {
      return (await get(`/accounts?itemId=${encodeURIComponent(itemId)}`, pageOf(accountSchema))).results;
    },

    // /v2/transactions: paginação por cursor (`next`); a /transactions por página foi descontinuada.
    async listTransactions(accountId: string, { from, to }: { from: string; to?: string }): Promise<PluggyTransaction[]> {
      const rows: PluggyTransaction[] = [];
      let after: string | null = null;
      do {
        const q = new URLSearchParams({ accountId, dateFrom: from, ...(to ? { dateTo: to } : {}), ...(after ? { after } : {}) });
        const page: { results: PluggyTransaction[]; next?: string | null } = await get(
          `/v2/transactions?${q}`,
          cursorPageOf(transactionSchema),
        );
        rows.push(...page.results);
        after = page.next ?? null;
      } while (after);
      return rows;
    },

    async listBills(accountId: string): Promise<PluggyBill[]> {
      return paged((page) => get(`/bills?accountId=${encodeURIComponent(accountId)}&page=${page}&pageSize=100`, numberedPageOf(billSchema)));
    },

    async listInvestments(itemId: string): Promise<PluggyInvestment[]> {
      return paged((page) =>
        get(`/investments?itemId=${encodeURIComponent(itemId)}&page=${page}&pageSize=500`, numberedPageOf(investmentSchema)),
      );
    },
  };
}

async function paged<T>(fetchPage: (page: number) => Promise<{ results: T[]; totalPages?: number | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const { results, totalPages } = await fetchPage(page);
    rows.push(...results);
    if (!totalPages || page >= totalPages || results.length === 0) return rows;
  }
}

// Reais (float da API) → centavos. Só aqui, na borda: daqui para dentro é tudo inteiro.
export const toCents = (value: number) => Math.round(value * 100);
