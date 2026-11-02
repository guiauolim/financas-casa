import { z } from "zod";
import { uuid } from "./form";

export const merchantRuleSchema = z.object({
  pattern: z
    .string({ error: "Informe o trecho da descrição." })
    .trim()
    .min(2, { error: "Use pelo menos 2 letras." })
    .max(80, { error: "Use no máximo 80 caracteres." }),
  categoryId: z.uuid({ error: "Escolha a categoria." }),
});
export type MerchantRuleInput = z.infer<typeof merchantRuleSchema>;
export const MERCHANT_RULE_FIELDS = ["pattern", "categoryId"] as const;

export const merchantRuleIdSchema = z.object({ id: uuid });
