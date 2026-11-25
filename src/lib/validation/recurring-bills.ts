import { z } from "zod";
import { HOUSE } from "@/lib/finance/spent-by";
import { amountCents, requiredName, uuid } from "./form";

export const recurringBillSchema = z.object({
  name: requiredName("o nome", 60),
  categoryId: z.uuid({ error: "Escolha a categoria." }),
  accountId: z.uuid({ error: "Escolha a conta ou o cartão." }),
  amountCents: amountCents({ label: "o valor previsto" }),
  dueDay: z
    .string()
    .trim()
    .pipe(
      z.coerce
        .number<string>({ error: "Informe o dia do vencimento." })
        .int({ error: "Dia inválido." })
        .min(1, { error: "Dia de 1 a 31." })
        .max(31, { error: "Dia de 1 a 31." }),
    ),
  // "casa" (Casa) ou o id do membro.
  spentBy: z
    .string()
    .trim()
    .pipe(z.union([z.literal(HOUSE), uuid], { error: "Escolha de quem é a conta." }))
    .transform((v) => (v === HOUSE ? null : v)),
});

export type RecurringBillInput = z.infer<typeof recurringBillSchema>;
export const RECURRING_BILL_FIELDS = ["name", "categoryId", "accountId", "amountCents", "dueDay", "spentBy"] as const;
