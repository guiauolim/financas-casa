import { CreditCard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import { listMembers } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";
import { CardImportForm } from "./import-form";

export const metadata: Metadata = { title: "Importar fatura do cartão" };

export default function ImportarFaturaPage() {
  return (
    <>
      <PageHeader
        title="Importar fatura do cartão"
        description="Envie as faturas exportadas pelo banco (.xls ou .xlsx). Hoje: Itaú. Reimportar não duplica."
      />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <ImportCard />
      </Suspense>
    </>
  );
}

async function ImportCard() {
  const actor = await requireActor();
  const db = await createClient();
  const [accounts, categories, members] = await Promise.all([
    listAccounts(db, { householdId: actor.householdId }),
    listCategories(db, { householdId: actor.householdId }),
    listMembers(db, { householdId: actor.householdId }),
  ]);
  const cards = accounts.filter((a) => a.kind === "credit_card");
  if (cards.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Cadastre o cartão primeiro"
        description="A fatura entra num cartão de crédito cadastrado, com o dia de fechamento e de vencimento certos."
        action={
          <Link href="/configuracoes/contas/nova" className={buttonVariants()}>
            Cadastrar cartão
          </Link>
        }
      />
    );
  }
  return (
    <CardImportForm
      cards={cards.map((c) => ({ id: c.id, name: c.name, closingDay: c.closingDay, dueDay: c.dueDay }))}
      paymentAccounts={accounts.filter((a) => a.kind !== "credit_card").map((a) => ({ id: a.id, name: a.name }))}
      categories={categories
        .filter((c) => c.type !== "transfer")
        .map((c) => ({ id: c.id, name: c.name, type: c.type as "expense" | "income", householdDefault: c.householdDefault }))}
      members={members.map((m, index) => ({ userId: m.userId, displayName: m.displayName, index }))}
    />
  );
}
