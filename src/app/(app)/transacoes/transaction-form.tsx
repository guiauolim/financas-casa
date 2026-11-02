"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { AmountField, Field, FormError, Segmented, SelectField } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { invoiceFor } from "@/lib/finance/billing";
import { formatDate, formatMonthShort, parseISODate, parseYearMonth } from "@/lib/finance/dates";
import { MAX_INSTALLMENTS, splitInstallments } from "@/lib/finance/installments";
import { formatAmountInput, formatBRL, parseBRL } from "@/lib/finance/money";
import { ACCOUNT_KIND_LABELS, type AccountKind } from "@/lib/validation/accounts";
import { TX_TYPE_LABELS, TX_TYPES, type TxType } from "@/lib/validation/categories";
import type { FormState } from "@/lib/validation/form";
import { saveTransactionAction } from "./actions";

export type FormAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  closingDay: number | null;
  dueDay: number | null;
};
export type FormCategory = { id: string; name: string; type: TxType };

export type TransactionFormValues = {
  id: string;
  type: TxType;
  amountCents: number;
  occurredOn: string;
  description: string | null;
  accountId: string;
  transferAccountId: string | null;
  categoryId: string | null;
  installment: { number: number; total: number } | null;
};

function cardInvoiceText(account: FormAccount | undefined, date: string): string | null {
  if (account?.kind !== "credit_card" || !account.closingDay || !account.dueDay || !parseISODate(date)) return null;
  const invoice = invoiceFor(date, { closingDay: account.closingDay, dueDay: account.dueDay });
  const reference = parseYearMonth(invoice.reference)!;
  return `fatura de ${formatMonthShort(reference)} (fecha ${formatDate(invoice.closingDate)}, vence ${formatDate(invoice.dueDate)})`;
}

export function TransactionForm({
  transaction,
  accounts,
  categories,
  today,
}: {
  transaction?: TransactionFormValues;
  accounts: FormAccount[];
  categories: FormCategory[];
  today: string;
}) {
  const [state, action, pending] = useActionState(saveTransactionAction, {} as FormState);
  const errors = state.fieldErrors ?? {};
  const isInstallment = Boolean(transaction?.installment);

  const [type, setType] = useState<TxType>(transaction?.type ?? "expense");
  const [amount, setAmount] = useState(transaction ? formatAmountInput(transaction.amountCents) : "");
  const [date, setDate] = useState(transaction?.occurredOn ?? today);
  const [accountId, setAccountId] = useState(transaction?.accountId ?? "");
  const [transferAccountId, setTransferAccountId] = useState(transaction?.transferAccountId ?? "");
  const [installments, setInstallments] = useState("1");

  const account = accounts.find((a) => a.id === accountId);
  const target = accounts.find((a) => a.id === transferAccountId);
  const typeCategories = categories.filter((c) => c.type === type);
  const amountCents = parseBRL(amount);
  const count = Number(installments);
  const isNewInstallment = !transaction && type === "expense" && Number.isInteger(count) && count > 1;

  let installmentPreview: string | null = null;
  if (isNewInstallment && amountCents && count <= MAX_INSTALLMENTS && amountCents >= count) {
    const parts = splitInstallments(amountCents, count);
    installmentPreview =
      parts[0] === parts[1]
        ? `${count}× de ${formatBRL(parts[1]!)}`
        : `1ª de ${formatBRL(parts[0]!)} e ${count - 1}× de ${formatBRL(parts[1]!)}`;
  }
  const invoiceText = type === "expense" ? cardInvoiceText(account, date) : null;
  const isBillPayment = type === "transfer" && target?.kind === "credit_card";

  const accountOptions = (exclude?: string) =>
    accounts
      .filter((a) => a.id !== exclude)
      .map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {ACCOUNT_KIND_LABELS[a.kind]}
        </option>
      ));

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {transaction ? <input type="hidden" name="id" value={transaction.id} /> : null}

      <Segmented
        name="type"
        legend="Tipo"
        value={type}
        onChange={setType}
        options={TX_TYPES.map((t) => ({ value: t, label: TX_TYPE_LABELS[t], disabled: isInstallment && t !== "expense" }))}
        error={errors.type}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField
          name="amountCents"
          label={isInstallment ? "Valor da parcela" : isNewInstallment ? "Valor total" : "Valor"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          hint="Ex.: 52,30 ou 1.234,56"
          error={errors.amountCents}
        />
        <Field
          name="occurredOn"
          label={isNewInstallment ? "Data da compra (1ª parcela)" : "Data"}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          error={errors.occurredOn}
        />
      </div>

      {type === "transfer" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="accountId"
            label="De"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
            error={errors.accountId}
          >
            <option value="">Escolha a conta de origem</option>
            {accountOptions()}
          </SelectField>
          <SelectField
            name="transferAccountId"
            label="Para"
            value={transferAccountId}
            onChange={(e) => setTransferAccountId(e.target.value)}
            required
            error={errors.transferAccountId}
          >
            <option value="">Escolha a conta de destino</option>
            {accountOptions(accountId)}
          </SelectField>
          <p
            className="flex gap-2 rounded-lg bg-primary-soft px-3 py-2 text-[13px] text-primary-soft-foreground sm:col-span-2"
            role="note"
          >
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
            {isBillPayment ? (
              <span>
                <strong>Pagamento de fatura.</strong> Pagar a fatura é uma transferência da conta para o cartão: os
                gastos já foram contados nas compras, então o pagamento não entra de novo como saída.
              </span>
            ) : (
              <span>
                Transferências movem dinheiro entre contas da casa e não contam como entrada nem saída. Para pagar a
                fatura do cartão, escolha o cartão como destino.
              </span>
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="accountId"
            label={type === "income" ? "Conta que recebeu" : "Conta ou cartão"}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
            error={errors.accountId}
            hint={invoiceText ? `${isNewInstallment ? "1ª parcela na" : "Entra na"} ${invoiceText}.` : undefined}
          >
            <option value="">Escolha a conta</option>
            {accountOptions()}
          </SelectField>
          <SelectField
            key={type}
            name="categoryId"
            label="Categoria"
            defaultValue={transaction?.type === type ? (transaction.categoryId ?? "") : ""}
            error={errors.categoryId}
          >
            <option value="">Sem categoria</option>
            {typeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
      )}

      {type === "expense" && !transaction ? (
        <Field
          name="installments"
          label="Parcelas"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_INSTALLMENTS}
          value={installments}
          onChange={(e) => setInstallments(e.target.value)}
          hint={installmentPreview ?? "1 = à vista. Cada parcela é lançada no mês correspondente."}
          error={errors.installments}
          className="sm:max-w-[calc(50%-8px)]"
        />
      ) : null}

      <Field
        name="description"
        label="Descrição (opcional)"
        placeholder={type === "transfer" ? "Ex.: Fatura de novembro" : "Ex.: Mercado do mês"}
        defaultValue={transaction?.description ?? undefined}
        maxLength={200}
        error={errors.description}
      />

      {transaction?.installment ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium">
            Parcela {transaction.installment.number} de {transaction.installment.total}: aplicar a
          </legend>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="scope" value="one" defaultChecked className="size-4 accent-primary" />
            Só esta parcela
          </label>
          {transaction.installment.number < transaction.installment.total ? (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="scope" value="following" className="size-4 accent-primary" />
              Esta e as próximas ({transaction.installment.total - transaction.installment.number + 1} parcelas)
            </label>
          ) : null}
          <p className="text-[13px] text-muted-foreground">
            Conta, categoria, descrição e valor valem para as parcelas escolhidas; a data muda só nesta.
          </p>
        </fieldset>
      ) : null}

      <FormError message={state.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : transaction ? "Salvar alterações" : "Lançar"}
        </Button>
        <Link href="/transacoes" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
