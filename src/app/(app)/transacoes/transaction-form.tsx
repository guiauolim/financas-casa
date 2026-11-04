"use client";

import { Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { AmountField, Field, FormError, Segmented, SelectField } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { type InvoiceNaming, invoiceByRef, invoiceFor, invoiceLabel, isInvoiceRef, paymentInvoiceRef } from "@/lib/finance/billing";
import { formatDate, parseISODate } from "@/lib/finance/dates";
import { MAX_INSTALLMENTS, splitInstallments } from "@/lib/finance/installments";
import { defaultSpentBy, HOUSE, spentByToParam } from "@/lib/finance/spent-by";
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
  invoiceNaming: InvoiceNaming;
};
export type FormCategory = { id: string; name: string; type: TxType; householdDefault: boolean };
export type FormMember = { userId: string; displayName: string };

export type TransactionFormValues = {
  id: string;
  type: TxType;
  amountCents: number;
  occurredOn: string;
  description: string | null;
  accountId: string;
  transferAccountId: string | null;
  categoryId: string | null;
  installment: { number: number; total: number; purchaseTotalCents?: number | null } | null;
  spentBy: string | null;
  invoiceRef: string | null; // fatura gravada (ex.: a do arquivo importado)
};

const cycleOf = (account: FormAccount | undefined) =>
  account?.kind === "credit_card" && account.closingDay && account.dueDay
    ? { closingDay: account.closingDay, dueDay: account.dueDay }
    : null;

// "fatura de novembro de 2026 (fecha 25/11/2026, vence 05/12/2026)" — mesma regra do servidor.
function cardInvoiceText(account: FormAccount | undefined, date: string): string | null {
  const cycle = cycleOf(account);
  if (!cycle || !parseISODate(date)) return null;
  const invoice = invoiceFor(date, cycle);
  return `${invoiceLabel(invoice, account!.invoiceNaming)} (fecha ${formatDate(invoice.closingDate)}, vence ${formatDate(invoice.dueDate)})`;
}

function paymentInvoiceText(target: FormAccount | undefined, date: string): string | null {
  const cycle = cycleOf(target);
  if (!cycle || !parseISODate(date)) return null;
  const invoice = invoiceByRef(paymentInvoiceRef(date, cycle), cycle);
  const due = `${invoice.dueDate < date ? "venceu" : "vence"} ${formatDate(invoice.dueDate)}`;
  return `${invoiceLabel(invoice, target!.invoiceNaming)} (${due})`;
}

// Edição que muda data ou cartão: a fatura gravada é recalculada pela nova data.
function invoiceChangeText(
  transaction: TransactionFormValues | undefined,
  account: FormAccount | undefined,
  date: string,
): string | null {
  if (!transaction || transaction.type === "transfer") return null;
  if (date === transaction.occurredOn && account?.id === transaction.accountId) return null;
  const cycle = cycleOf(account);
  if (!cycle || !parseISODate(date)) return null;
  const next = invoiceFor(date, cycle);
  const before =
    transaction.invoiceRef && isInvoiceRef(transaction.invoiceRef) && transaction.accountId === account!.id
      ? invoiceLabel(invoiceByRef(transaction.invoiceRef, cycle), account!.invoiceNaming)
      : null;
  const nextLabel = invoiceLabel(next, account!.invoiceNaming);
  if (before === nextLabel) return `A fatura será recalculada pela nova data e continua na ${nextLabel}.`;
  return `A fatura será recalculada pela nova data: passa para a ${nextLabel}${before ? ` (estava na ${before})` : ""}.`;
}

export function TransactionForm({
  transaction,
  accounts,
  categories,
  members,
  currentUserId,
  today,
}: {
  transaction?: TransactionFormValues;
  accounts: FormAccount[];
  categories: FormCategory[];
  members: FormMember[];
  currentUserId: string;
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
  // De quem: segue a categoria (regra única defaultSpentBy) até a pessoa escolher à mão.
  const [spentBy, setSpentBy] = useState(
    transaction ? spentByToParam(transaction.spentBy) : spentByToParam(currentUserId),
  );
  const [spentByTouched, setSpentByTouched] = useState(Boolean(transaction));
  const onCategoryChange = (categoryId: string) => {
    if (spentByTouched) return;
    const category = categories.find((c) => c.id === categoryId);
    setSpentBy(
      spentByToParam(defaultSpentBy({ categoryHouseholdDefault: category?.householdDefault, personUserId: currentUserId })),
    );
  };

  const account = accounts.find((a) => a.id === accountId);
  const target = accounts.find((a) => a.id === transferAccountId);
  const typeCategories = categories.filter((c) => c.type === type);
  const amountCents = parseBRL(amount);
  const count = Number(installments);
  const isNewInstallment = !transaction && type === "expense" && Number.isInteger(count) && count > 1;

  let installmentParts: number[] | null = null;
  if (isNewInstallment && amountCents && count <= MAX_INSTALLMENTS && amountCents >= count) {
    installmentParts = splitInstallments(amountCents, count);
  }
  const invoiceText = type === "expense" ? cardInvoiceText(account, date) : null;
  const isBillPayment = type === "transfer" && target?.kind === "credit_card";
  const paymentText = isBillPayment ? paymentInvoiceText(target, date) : null;
  const changeText = invoiceChangeText(transaction, account, date);

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

      {installmentParts && amountCents ? (
        <p
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-soft-foreground"
          role="status"
        >
          <span>
            Total <strong className="font-mono">{formatBRL(amountCents)}</strong>
          </span>
          <span aria-hidden>→</span>
          <span className="sr-only">dividido em</span>
          <strong className="font-mono">
            {installmentParts[0] === installmentParts[1]
              ? `${count}× de ${formatBRL(installmentParts[1]!)}`
              : `1ª de ${formatBRL(installmentParts[0]!)} e ${count - 1}× de ${formatBRL(installmentParts[1]!)}`}
          </strong>
        </p>
      ) : null}

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
                <strong>Pagamento de fatura{paymentText ? `: ${paymentText}` : ""}.</strong> Pagar a fatura é uma
                transferência da conta para o cartão: os gastos já foram contados nas compras, então o pagamento não
                entra de novo como saída.
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
            hint={
              invoiceText
                ? isNewInstallment
                  ? `1ª parcela na ${invoiceText}; as demais nas faturas seguintes.`
                  : `Entra na ${invoiceText}.`
                : undefined
            }
          >
            <option value="">Escolha a conta</option>
            {accountOptions()}
          </SelectField>
          <SelectField
            key={type}
            name="categoryId"
            label="Categoria"
            defaultValue={transaction?.type === type ? (transaction.categoryId ?? "") : ""}
            onChange={(e) => onCategoryChange(e.target.value)}
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

      {changeText ? (
        <p
          className="flex gap-2 rounded-lg bg-[#FBEBD9] px-3 py-2 text-[13px] text-warning-foreground"
          role="status"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
          <span>{changeText}</span>
        </p>
      ) : null}

      {type !== "transfer" ? (
        <Segmented
          name="spentBy"
          legend={type === "income" ? "De quem é a receita" : "De quem é o gasto"}
          value={spentBy}
          onChange={(value) => {
            setSpentBy(value);
            setSpentByTouched(true);
          }}
          options={[
            { value: HOUSE, label: "Casa" },
            ...members.map((m) => ({ value: m.userId, label: m.displayName })),
          ]}
          error={errors.spentBy}
        />
      ) : null}

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
          hint="1 = à vista. Informe o valor total da compra: ele é dividido entre as parcelas, uma por mês."
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
          {transaction.installment.purchaseTotalCents != null ? (
            <p className="text-[13px] text-muted-foreground">
              Total da compra:{" "}
              <span className="font-mono text-foreground">{formatBRL(transaction.installment.purchaseTotalCents)}</span>{" "}
              em {transaction.installment.total} parcelas. O valor acima é o desta parcela.
            </p>
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
