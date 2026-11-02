import { z } from "zod";
import { parseISODate } from "@/lib/finance/dates";
import { parseBRL } from "@/lib/finance/money";

export type FormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string>>;
  success?: string;
};

export function fieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]) {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_form");
    result[key] ??= issue.message;
  }
  return result;
}

// Lê só as chaves pedidas do FormData (campos ausentes viram undefined).
export function formValues<K extends string>(formData: FormData, keys: readonly K[]): Record<K, string | undefined> {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : undefined];
    }),
  ) as Record<K, string | undefined>;
}

export const uuid = z.uuid({ error: "Valor inválido." });

// Campo de texto opcional: vazio -> undefined.
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Use no máximo ${max} caracteres.` })
    .optional()
    .transform((value) => (value ? value : undefined));

export const requiredName = (label: string, max = 60) =>
  z
    .string({ error: `Informe ${label}.` })
    .trim()
    .min(1, { error: `Informe ${label}.` })
    .max(max, { error: `Use no máximo ${max} caracteres.` });

// "nubank, Roxinho ,nubank" -> ["nubank", "roxinho"]
export const aliases = z
  .string()
  .optional()
  .transform((value) =>
    [
      ...new Set(
        (value ?? "")
          .split(",")
          .map((alias) => alias.trim().toLowerCase().replace(/\s+/g, " "))
          .filter(Boolean),
      ),
    ].slice(0, 30),
  )
  .pipe(z.array(z.string().max(40, { error: "Cada apelido pode ter até 40 caracteres." })));

// Valor em formato brasileiro ("1.234,56") -> centavos.
export const amountCents = (opts: { label?: string; allowZero?: boolean; allowNegative?: boolean } = {}) =>
  z.string({ error: `Informe ${opts.label ?? "o valor"}.` }).transform((value, ctx) => {
    const trimmed = value.trim();
    const negative = opts.allowNegative && /^[-−]/.test(trimmed);
    const cents = parseBRL(negative ? trimmed.slice(1) : trimmed);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Use o formato 52,30 ou 1.234,56." });
      return z.NEVER;
    }
    if (cents === 0 && !opts.allowZero) {
      ctx.addIssue({ code: "custom", message: "O valor precisa ser maior que zero." });
      return z.NEVER;
    }
    return negative ? -cents : cents;
  });

export const isoDate = z
  .string({ error: "Informe a data." })
  .refine((value) => parseISODate(value) !== null, { error: "Data inválida." });
