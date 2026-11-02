import { z } from "zod";
import { CATEGORY_ICON_NAMES } from "@/lib/categories/icon-names";
import { aliases, requiredName } from "./form";

export const TX_TYPES = ["expense", "income", "transfer"] as const;
export type TxType = (typeof TX_TYPES)[number];

export const TX_TYPE_LABELS: Record<TxType, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
};

export const categorySchema = z.object({
  name: requiredName("o nome", 40),
  type: z.enum(TX_TYPES, { error: "Escolha o tipo." }),
  icon: z.enum(CATEGORY_ICON_NAMES, { error: "Escolha um ícone." }),
  aliases,
  // Checkbox "Gasto da casa por padrão" (só despesas).
  householdDefault: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "1" || v === "true"),
}).transform((value) => ({ ...value, householdDefault: value.type === "expense" && value.householdDefault }));

export type CategoryInput = z.infer<typeof categorySchema>;
export const CATEGORY_FORM_FIELDS = ["name", "type", "icon", "aliases", "householdDefault"] as const;
