import { z } from "zod";
import { ASSET_CLASSES } from "@/lib/finance/portfolio";
import { aliases, amountCents, isoDate, optionalText, requiredName, uuid } from "./form";

export const MAX_B3_FILE_BYTES = 4 * 1024 * 1024; // a Vercel corta corpo acima de 4,5 MB

const assetClass = z.enum(ASSET_CLASSES, { error: "Escolha a classe do ativo." });

// owner: id do membro ou "joint" (conjunto).
const owner = z.union([z.literal("joint").transform(() => null), uuid], { error: "Escolha o dono." });

const blankToUndefined = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

// Quantidade no formato BR ("10", "0,25", "1.000,12345678") -> decimal em texto ("1000.12345678").
const QUANTITY = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,8}))?$/;
export const quantity = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const trimmed = blankToUndefined(value);
    if (!trimmed) return undefined;
    const match = QUANTITY.exec(trimmed);
    if (!match) {
      ctx.addIssue({ code: "custom", message: "Use o formato 10 ou 0,25 (até 8 casas)." });
      return z.NEVER;
    }
    return `${match[1]!.replace(/\./g, "")}${match[2] ? `.${match[2]}` : ""}`;
  });

const optionalAmount = (label: string) =>
  z
    .string()
    .optional()
    .transform(blankToUndefined)
    .pipe(amountCents({ label }).optional());

const ticker = z
  .string()
  .optional()
  .transform((v) => blankToUndefined(v)?.toUpperCase().replace(/\s+/g, ""))
  .pipe(z.string().max(20, { error: "Use no máximo 20 caracteres." }).optional());

// Cadastro de ativo manual (edição usa o mesmo, sem valor/data: o valor muda por "Atualizar valor").
export const investmentSchema = z.object({
  name: requiredName("o nome", 80),
  assetClass,
  institution: optionalText(80),
  ownerUserId: owner,
  ticker,
  quantity,
  avgPriceCents: optionalAmount("o preço médio"),
  aliases,
});
export type InvestmentInput = z.infer<typeof investmentSchema>;

export const investmentCreateSchema = investmentSchema.extend({
  valueCents: amountCents({ label: "o valor atual", allowZero: true }),
  valueDate: isoDate,
});
export type InvestmentCreateInput = z.infer<typeof investmentCreateSchema>;

// Ativo da B3: dono, código, quantidade e valor vêm da importação.
export const b3InvestmentSchema = investmentSchema.pick({ name: true, assetClass: true, aliases: true });
export type B3InvestmentInput = z.infer<typeof b3InvestmentSchema>;

export const INVESTMENT_FORM_FIELDS = [
  "name",
  "assetClass",
  "institution",
  "ownerUserId",
  "ticker",
  "quantity",
  "avgPriceCents",
  "aliases",
  "valueCents",
  "valueDate",
] as const;

export const investmentValueSchema = z.object({
  id: uuid,
  valueCents: amountCents({ label: "o valor", allowZero: true }),
  date: isoDate,
  quantity,
});
export type InvestmentValueInput = z.infer<typeof investmentValueSchema>;
export const INVESTMENT_VALUE_FIELDS = ["id", "valueCents", "date", "quantity"] as const;

export const investmentIdSchema = z.object({ id: uuid });

// ───────────────────────── Importação da B3 ─────────────────────────

export const b3FileSchema = z
  .instanceof(File, { error: "Escolha o arquivo exportado da B3." })
  .refine((file) => file.size > 0, { error: "O arquivo está vazio." })
  .refine((file) => file.size <= MAX_B3_FILE_BYTES, { error: "O arquivo passa de 4 MB." })
  .refine((file) => /\.xlsx?$/i.test(file.name), { error: "Envie um arquivo .xlsx ou .xls." });

export const b3PreviewSchema = z.object({
  ownerUserId: z.uuid({ error: "Escolha de quem é esta posição." }),
  file: b3FileSchema,
});

export const b3ApplySchema = b3PreviewSchema.extend({
  referenceDate: isoDate,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/, { error: "Pedido inválido." }),
  archiveIds: z.array(uuid).max(500),
});
