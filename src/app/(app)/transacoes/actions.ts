"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-button";
import { invalidState, serviceErrorState } from "@/lib/actions";
import { requireActor } from "@/lib/auth/session";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { payCardInvoice } from "@/lib/services/card-invoices";
import {
  createTransaction,
  deleteInvoiceTransactions,
  deleteTransaction,
  deleteTransactions,
  updateTransaction,
} from "@/lib/services/transactions";
import { createClient } from "@/lib/supabase/server";
import { type FormState, formValues, isoDate } from "@/lib/validation/form";
import { scopeSchema, TRANSACTION_FORM_FIELDS, transactionSchema } from "@/lib/validation/transactions";

const targetSchema = z.object({ id: z.uuid(), scope: scopeSchema });
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export async function saveTransactionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const id = formData.get("id");
  const parsed = transactionSchema.safeParse(formValues(formData, TRANSACTION_FORM_FIELDS));
  if (!parsed.success) return invalidState(parsed.error);

  try {
    const db = await createClient();
    if (typeof id === "string" && id) {
      await updateTransaction(db, actor, z.uuid().parse(id), parsed.data, scopeSchema.parse(formData.get("scope")));
    } else {
      await createTransaction(db, actor, parsed.data, { source: "web" });
    }
  } catch (error) {
    return serviceErrorState(error, "Não foi possível salvar o lançamento. Tente novamente.");
  }
  redirect(`/transacoes?mes=${parsed.data.occurredOn.slice(0, 7)}`);
}

// Excluir da tela de edição: apaga de vez e volta para a lista do mês.
export async function deleteTransactionAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const parsed = targetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pedido inválido." };
  const month = monthSchema.safeParse(formData.get("month")).data;
  try {
    await deleteTransaction(await createClient(), actor, parsed.data.id, parsed.data.scope);
  } catch (error) {
    return serviceErrorState(error, "Não foi possível excluir o lançamento.");
  }
  redirect(month ? `/transacoes?mes=${month}` : "/transacoes");
}

export type DeleteResult = { error: string } | { deleted: number };

const failure = (error: unknown, fallback: string): DeleteResult => ({ error: serviceErrorState(error, fallback).error ?? fallback });

const batchSchema = z.object({ ids: z.array(z.uuid()).min(1).max(2000), scope: scopeSchema });

// Exclusão em lote (definitiva). refresh(): a tela recebe o mês atualizado na mesma resposta.
export async function deleteTransactionsAction(input: { ids: string[]; scope: string }): Promise<DeleteResult> {
  const actor = await requireActor();
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) return { error: "Pedido inválido." };
  try {
    const deleted = await deleteTransactions(await createClient(), actor, parsed.data);
    refresh();
    return { deleted };
  } catch (error) {
    return failure(error, "Não foi possível excluir os lançamentos.");
  }
}

const invoiceSchema = z.object({ accountId: z.uuid(), ref: monthSchema });

// "Excluir fatura": todos os lançamentos do cartão nesta fatura.
export async function deleteInvoiceAction(input: { accountId: string; ref: string }): Promise<DeleteResult> {
  const actor = await requireActor();
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { error: "Pedido inválido." };
  try {
    const deleted = await deleteInvoiceTransactions(await createClient(), actor, parsed.data);
    refresh();
    return { deleted };
  } catch (error) {
    return failure(error, "Não foi possível excluir a fatura.");
  }
}

export type PayResult = { error: string } | { remainingCents: number };

const paySchema = z.object({
  cardId: z.uuid(),
  ref: monthSchema,
  occurredOn: isoDate,
  amountCents: z.number().int().min(1),
});

// "Pagar fatura": transferência da conta que paga para o cartão (valor e data escolhidos).
export async function payInvoiceAction(input: {
  cardId: string;
  ref: string;
  occurredOn: string;
  amountCents: number;
}): Promise<PayResult> {
  const actor = await requireActor();
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { error: "Confira o valor e a data." };
  try {
    const { remainingCents } = await payCardInvoice(await createClient(), actor, parsed.data, todayInSaoPaulo());
    refresh();
    return { remainingCents };
  } catch (error) {
    const fallback = "Não foi possível pagar a fatura.";
    return { error: serviceErrorState(error, fallback).error ?? fallback };
  }
}
