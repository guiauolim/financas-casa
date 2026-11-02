import "server-only";
import { throwIf } from "./errors";
import type { Db } from "./types";

// Finais de cartão (titular, adicionais, virtuais) -> membro dono dos gastos, dentro da
// MESMA conta de cartão. Fatura, limite e orçamento continuam sendo do cartão inteiro.
export type CardHolder = { lastDigits: string; userId: string };

export async function listCardHolders(
  db: Db,
  { householdId, accountId }: { householdId: string; accountId: string },
): Promise<CardHolder[]> {
  const { data, error } = await db
    .from("card_holders")
    .select("last_digits, user_id")
    .eq("household_id", householdId)
    .eq("account_id", accountId)
    .order("last_digits");
  throwIf(error);
  return (data ?? []).map((row) => ({ lastDigits: row.last_digits, userId: row.user_id }));
}

// Dono de um final (para o bot/lançamentos com final informado). undefined = desconhecido.
export async function holderOfCard(
  db: Db,
  { householdId, accountId, lastDigits }: { householdId: string; accountId: string; lastDigits: string },
): Promise<string | undefined> {
  const holders = await listCardHolders(db, { householdId, accountId });
  return holders.find((h) => h.lastDigits === lastDigits)?.userId;
}
