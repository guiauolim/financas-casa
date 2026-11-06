import { defaultPaymentAccount } from "@/lib/finance/payment-account";
import type { Account } from "@/lib/services/accounts";
import type { PaymentAccountOptions } from "./account-form";

// Opções do select "Conta que paga a fatura": contas ativas que não são cartão.
export function paymentAccountOptions(accounts: readonly Account[]): PaymentAccountOptions {
  return {
    accounts: accounts.filter((a) => a.kind !== "credit_card" && !a.archived).map(({ id, name }) => ({ id, name })),
    defaultId: defaultPaymentAccount(accounts)?.id ?? null,
  };
}
