import { z } from "zod";
import { INVOICE_NAMINGS } from "@/lib/finance/billing";
import { aliases, amountCents, isoDate, requiredName, uuid } from "./form";

export const ACCOUNT_KINDS = ["checking", "savings", "credit_card", "cash", "meal_voucher"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  credit_card: "Cartão de crédito",
  cash: "Dinheiro",
  meal_voucher: "Vale-refeição",
};

const day = (label: string, message = `Informe o dia de ${label}.`) =>
  z.coerce
    .number<string>({ error: message })
    .int({ error: message })
    .min(1, { error: "Use um dia entre 1 e 31." })
    .max(31, { error: "Use um dia entre 1 e 31." });

// owner: id do membro ou "joint" (conta conjunta).
const owner = z.union([z.literal("joint").transform(() => null), uuid], { error: "Escolha o dono da conta." });

const base = {
  name: requiredName("o nome"),
  ownerUserId: owner,
  aliases,
};

export const accountSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({
      ...base,
      kind: z.literal("credit_card"),
      closingDay: day("melhor dia de compra", "Informe o melhor dia de compra."),
      dueDay: day("vencimento"),
      invoiceNaming: z.enum(INVOICE_NAMINGS).catch("closing"),
      creditLimitCents: z
        .string()
        .optional()
        .transform((v) => (v?.trim() ? v : undefined))
        .pipe(amountCents({ label: "o limite" }).optional()),
    }),
    z.object({
      ...base,
      kind: z.enum(["checking", "savings", "cash", "meal_voucher"]),
      openingBalanceCents: z
        .string()
        .optional()
        .transform((v) => (v?.trim() ? v : "0"))
        .pipe(amountCents({ label: "o saldo inicial", allowZero: true, allowNegative: true })),
      openingBalanceDate: z
        .string()
        .optional()
        .transform((v) => (v?.trim() ? v : undefined))
        .pipe(isoDate.optional()),
    }),
  ],
  { error: "Escolha o tipo da conta." },
);

export type AccountInput = z.infer<typeof accountSchema>;

export const ACCOUNT_FORM_FIELDS = [
  "name",
  "kind",
  "ownerUserId",
  "aliases",
  "closingDay",
  "dueDay",
  "invoiceNaming",
  "creditLimitCents",
  "openingBalanceCents",
  "openingBalanceDate",
] as const;
