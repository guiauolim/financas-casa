// "De quem é o gasto": um membro da casa ou a Casa (gasto conjunto, `spent_by = null`).
// Diferente de `created_by` (quem lançou). Regra única usada pelo site, pela importação
// de fatura e pelo bot do WhatsApp:
// - categoria marcada como "da casa" (Mercado, Moradia...) → Casa;
// - senão → a pessoa do contexto: quem lança no site, o dono do final do cartão na
//   importação, quem mandou a mensagem no bot.

export const HOUSE = "casa"; // valor de "Casa" em formulários e filtros (?pessoa=casa)

export type SpentBy = string | null; // user_id ou null (Casa)

export function defaultSpentBy({
  categoryHouseholdDefault,
  personUserId,
}: {
  categoryHouseholdDefault: boolean | null | undefined;
  personUserId: string | null | undefined;
}): SpentBy {
  if (categoryHouseholdDefault) return null;
  return personUserId ?? null;
}

// Formulário/URL <-> banco.
export const spentByToParam = (spentBy: SpentBy): string => spentBy ?? HOUSE;
export const spentByFromParam = (value: string): SpentBy => (value === HOUSE ? null : value);
