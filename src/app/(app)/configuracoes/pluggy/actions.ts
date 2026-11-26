"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { serviceErrorState } from "@/lib/actions";
import { requireActor } from "@/lib/auth/session";
import { ROLES_BY_KIND } from "@/lib/finance/pluggy-links";
import { createPluggyClient, pluggyConfig } from "@/lib/pluggy/client";
import { discoverPluggySources, type LinkInput, savePluggyLinks } from "@/lib/services/pluggy";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/form";

const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

// Campos por origem: role:<key>, account:<key>; por login: owner:<itemId>. As origens válidas são as
// que a Pluggy devolve agora (o formulário não decide o que existe).
export async function savePluggyLinksAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const config = pluggyConfig();
  if (!config) return { error: "A Pluggy não está configurada." };

  try {
    const { sources } = await discoverPluggySources(createPluggyClient(config));
    const inputs = new Map<string, LinkInput>();
    for (const source of sources) {
      const field = (name: string) => {
        const value = formData.get(name);
        return typeof value === "string" ? value : undefined;
      };
      const role = z.enum(ROLES_BY_KIND[source.sourceKind] as [string, ...string[]]).safeParse(field(`role:${source.key}`));
      const accountId = optionalUuid.safeParse(field(`account:${source.key}`));
      const ownerUserId = optionalUuid.safeParse(field(`owner:${source.itemId}`));
      if (!role.success || !accountId.success || !ownerUserId.success) return { error: "Pedido inválido." };
      inputs.set(source.key, {
        role: role.data as LinkInput["role"],
        accountId: accountId.data,
        ownerUserId: ownerUserId.data,
      });
    }
    await savePluggyLinks(await createClient(), actor, sources, inputs);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar as ligações da Pluggy.");
  }
  refresh();
  return { success: "Ligações salvas." };
}
