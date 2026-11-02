import { ArrowLeftRight, CreditCard } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { SpenderAvatar } from "@/components/member-avatar";
import { Money } from "@/components/money";
import { SourceBadge } from "@/components/source-badge";
import { formatDayMonth } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import type { Transaction } from "@/lib/services/transactions";

function title(tx: Transaction): string {
  if (tx.description) return tx.description;
  if (tx.type === "transfer") return tx.transferAccount?.kind === "credit_card" ? "Pagamento de fatura" : "Transferência";
  return tx.category?.name ?? "Sem descrição";
}

function CategoryCell({ tx }: { tx: Transaction }) {
  if (tx.type === "transfer") {
    const bill = tx.transferAccount?.kind === "credit_card";
    const Icon = bill ? CreditCard : ArrowLeftRight;
    return (
      <span className="flex items-center gap-2">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
          <Icon className="size-4" strokeWidth={2} />
        </span>
        {bill ? "Pagamento de fatura" : "Transferência"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <CategoryIcon icon={tx.category?.icon} />
      {tx.category?.name ?? <span className="text-muted-foreground">Sem categoria</span>}
    </span>
  );
}

function accountText(tx: Transaction) {
  return tx.transferAccount ? `${tx.account.name} → ${tx.transferAccount.name}` : tx.account.name;
}

function InstallmentTag({ tx }: { tx: Transaction }) {
  if (!tx.installment) return null;
  const { number, total, purchaseTotalCents } = tx.installment;
  return (
    <span className="ml-2 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <span className="font-mono">
        {number}/{total}
      </span>
      {purchaseTotalCents !== null ? (
        <>
          {" "}
          · total <span className="font-mono">{formatBRL(purchaseTotalCents)}</span>
        </>
      ) : null}
    </span>
  );
}

// De quem é (Casa ou membro). Transferência não é de ninguém: mostra quem lançou, apagado.
function Spender({ tx, memberIndex }: { tx: Transaction; memberIndex: (userId: string | null) => number }) {
  if (tx.type === "transfer") {
    return <span className="inline-flex size-7 items-center justify-center text-muted-foreground" aria-hidden>—</span>;
  }
  return <SpenderAvatar spentBy={tx.spentBy} name={tx.spentByName} index={memberIndex(tx.spentBy)} />;
}

// Tabela no desktop e lista compacta no celular. `href` null = linha sem link (lixeira).
export function TransactionRows({
  transactions,
  memberIndex,
  href = (tx) => `/transacoes/${tx.id}`,
  actions,
}: {
  transactions: Transaction[];
  memberIndex: (userId: string | null) => number;
  href?: ((tx: Transaction) => string) | null;
  actions?: (tx: Transaction) => ReactNode;
}) {
  const label = (tx: Transaction) =>
    href ? (
      <Link
        href={href(tx)}
        className="rounded font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {title(tx)}
      </Link>
    ) : (
      <span className="font-medium">{title(tx)}</span>
    );

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-[12px] text-muted-foreground">
            <tr className="border-b border-divider">
              <th scope="col" className="py-2 pr-3 font-medium">Data</th>
              <th scope="col" className="py-2 pr-3 font-medium">Descrição</th>
              <th scope="col" className="py-2 pr-3 font-medium">Categoria</th>
              <th scope="col" className="py-2 pr-3 font-medium">Conta</th>
              <th scope="col" className="py-2 pr-3 font-medium">Origem</th>
              <th scope="col" className="py-2 pr-3 font-medium">De quem</th>
              <th scope="col" className="py-2 text-right font-medium">Valor</th>
              {actions ? <th scope="col" className="py-2 pl-3"><span className="sr-only">Ações</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td className="py-3 pr-3 font-mono text-muted-foreground">{formatDayMonth(tx.occurredOn)}</td>
                <td className="py-3 pr-3">
                  {label(tx)}
                  <InstallmentTag tx={tx} />
                </td>
                <td className="py-3 pr-3"><CategoryCell tx={tx} /></td>
                <td className="py-3 pr-3 text-muted-foreground">{accountText(tx)}</td>
                <td className="py-3 pr-3"><SourceBadge source={tx.source} /></td>
                <td className="py-3 pr-3">
                  <Spender tx={tx} memberIndex={memberIndex} />
                </td>
                <td className="py-3 text-right"><Money cents={tx.amountCents} kind={tx.type} /></td>
                {actions ? <td className="py-3 pl-3 text-right">{actions(tx)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col divide-y divide-divider md:hidden">
        {transactions.map((tx) => (
          <li key={tx.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <Spender tx={tx} memberIndex={memberIndex} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate">
                {label(tx)}
                <InstallmentTag tx={tx} />
              </p>
              <p className="truncate text-[13px] text-muted-foreground">
                <span className="font-mono">{formatDayMonth(tx.occurredOn)}</span> · {accountText(tx)}
                {tx.type !== "transfer" && tx.category ? ` · ${tx.category.name}` : null}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Money cents={tx.amountCents} kind={tx.type} className="font-medium" />
              {actions ? actions(tx) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
