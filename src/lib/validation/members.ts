import { z } from "zod";
import { normalizePhone } from "@/lib/finance/phone";
import { requiredName } from "./form";

export const memberSchema = z.object({
  displayName: requiredName("o nome", 80),
  phone: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value?.trim()) return null;
      const phone = normalizePhone(value);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Telefone inválido. Ex.: (61) 99999-9999." });
        return z.NEVER;
      }
      return phone;
    }),
});

export type MemberInput = z.infer<typeof memberSchema>;
