import { z } from "zod";
import { HOUSE } from "@/lib/finance/spent-by";
import { MAX_UPLOAD_BYTES } from "@/lib/importers/limits";
import { uuid } from "./form";

// Importação de faturas do cartão. Arquivos: só em memória; o cliente reenvia os mesmos
// arquivos na confirmação e o sha256 (fingerprint) garante que não mudaram.

export const MAX_STATEMENT_FILES = 12;

const statementFile = z
  .instanceof(File, { error: "Escolha os arquivos da fatura." })
  .refine((file) => file.size > 0, { error: "Um dos arquivos está vazio." })
  .refine((file) => /\.xlsx?$/i.test(file.name), { error: "Envie arquivos .xls ou .xlsx." });

export const statementFiles = z
  .array(statementFile)
  .min(1, { error: "Escolha pelo menos um arquivo da fatura." })
  .max(MAX_STATEMENT_FILES, { error: `Envie no máximo ${MAX_STATEMENT_FILES} arquivos por vez.` })
  .refine((files) => files.reduce((sum, f) => sum + f.size, 0) <= MAX_UPLOAD_BYTES, {
    error: "Os arquivos somam mais de 4 MB. Envie em partes.",
  });

// "casa" -> null (sem dono: gastos do final vão para Casa).
const person = z.union([z.literal(HOUSE), uuid]).transform((v) => (v === HOUSE ? null : v));

const holders = z
  .array(z.object({ last4: z.string().regex(/^\d{4}$/), userId: person }))
  .max(30);

const json = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Pedido inválido." });
        return z.NEVER;
      }
    })
    .pipe(schema.optional());

export const cardImportPreviewSchema = z.object({
  accountId: z.uuid({ error: "Escolha o cartão." }),
  files: statementFiles,
  holders: json(holders),
  paymentAccountId: uuid.optional(),
});

const hash = z.string().regex(/^[0-9a-f]{64}$/, { error: "Pedido inválido." });

export const cardImportApplySchema = cardImportPreviewSchema.extend({
  fingerprints: z.array(hash).min(1).max(MAX_STATEMENT_FILES),
  includeFuture: z.boolean(),
  decisions: json(
    z.object({
      overrides: z
        .array(
          z.object({
            hash,
            include: z.boolean().optional(),
            categoryId: uuid.optional(),
            spentBy: person.optional(),
          }),
        )
        .max(5000),
      rules: z.array(z.object({ pattern: z.string().trim().min(2).max(80), categoryId: uuid })).max(1000),
    }),
  ),
});

export type CardImportApplyInput = z.infer<typeof cardImportApplySchema>;
