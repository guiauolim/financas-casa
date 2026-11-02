import { z } from "zod";
import { parseYearMonth } from "@/lib/finance/dates";
import { MAX_INSTALLMENTS } from "@/lib/finance/installments";
import { HOUSE } from "@/lib/finance/spent-by";
import { amountCents, isoDate, optionalText, uuid } from "./form";

const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v : undefined))
  .pipe(uuid.optional());

// De quem é: "casa" (Casa) ou o id do membro. Ausente = regra padrão (defaultSpentBy) no serviço.
export const spentByField = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined))
  .pipe(z.union([z.literal(HOUSE), uuid], { error: "Escolha de quem é o lançamento." }).optional())
  .transform((v) => (v === undefined ? undefined : v === HOUSE ? null : v));

const common = {
  amountCents: amountCents(),
  occurredOn: isoDate,
  description: optionalText(200),
  accountId: z.uuid({ error: "Escolha a conta." }),
};

const installments = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v : "1"))
  .pipe(
    z.coerce
      .number<string>()
      .int({ error: "Número de parcelas inválido." })
      .min(1, { error: "Mínimo de 1 parcela." })
      .max(MAX_INSTALLMENTS, { error: `Máximo de ${MAX_INSTALLMENTS} parcelas.` }),
  );

export const transactionSchema = z
  .discriminatedUnion(
    "type",
    [
      z.object({ ...common, type: z.literal("expense"), categoryId: optionalUuid, installments, spentBy: spentByField }),
      z.object({ ...common, type: z.literal("income"), categoryId: optionalUuid, spentBy: spentByField }),
      z.object({
        ...common,
        type: z.literal("transfer"),
        transferAccountId: z.uuid({ error: "Escolha a conta de destino." }),
      }),
    ],
    { error: "Escolha o tipo do lançamento." },
  )
  .superRefine((value, ctx) => {
    if (value.type === "transfer" && value.transferAccountId === value.accountId) {
      ctx.addIssue({ code: "custom", path: ["transferAccountId"], message: "Escolha uma conta diferente da origem." });
    }
    if (value.type === "expense" && value.amountCents < value.installments) {
      ctx.addIssue({ code: "custom", path: ["installments"], message: "Valor pequeno demais para tantas parcelas." });
    }
  });

export type TransactionInput = z.infer<typeof transactionSchema>;

export const TRANSACTION_FORM_FIELDS = [
  "type",
  "amountCents",
  "occurredOn",
  "description",
  "accountId",
  "transferAccountId",
  "categoryId",
  "installments",
  "spentBy",
] as const;

export const scopeSchema = z.enum(["one", "following"]).catch("one");
export type Scope = z.infer<typeof scopeSchema>;

// Filtros da lista (searchParams). Valores inválidos são ignorados.
export const transactionFiltersSchema = z.object({
  mes: z
    .string()
    .optional()
    .transform((v) => (v && parseYearMonth(v) ? v : undefined)),
  conta: uuid.optional().catch(undefined),
  categoria: uuid.optional().catch(undefined),
  pessoa: z.union([z.literal(HOUSE), uuid]).optional().catch(undefined),
});

export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
