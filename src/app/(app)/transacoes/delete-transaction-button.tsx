import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/action-button";
import type { Transaction } from "@/lib/services/transactions";
import { deleteTransactionAction } from "./actions";

// Botão "Excluir" da tela de edição: apaga de vez e volta para a lista do mês. `compact`: só o
// ícone (fica na mesma página). Na lista, a exclusão é pela seleção (month-browser).
export function DeleteTransactionButton({
  tx,
  compact = false,
}: {
  tx: Pick<Transaction, "id" | "occurredOn" | "installment">;
  compact?: boolean;
}) {
  const installment = tx.installment;
  const hasFollowing = installment && installment.number < installment.total;
  const fields = { id: tx.id, month: tx.occurredOn.slice(0, 7), ...(compact ? { stay: "1" } : {}) };
  const title = installment ? `Excluir parcela ${installment.number} de ${installment.total}?` : "Excluir lançamento?";

  return (
    <ConfirmAction
      action={deleteTransactionAction}
      {...(compact
        ? {
            variant: "ghost" as const,
            size: "icon" as const,
            className: "size-11 text-muted-foreground hover:text-destructive",
            "aria-label": installment ? `Excluir parcela ${installment.number} de ${installment.total}` : "Excluir lançamento",
          }
        : { variant: "destructive" as const })}
      trigger={
        compact ? (
          <Trash2 aria-hidden strokeWidth={2} />
        ) : (
          <>
            <Trash2 aria-hidden />
            Excluir
          </>
        )
      }
      title={title}
      description="O lançamento é apagado de vez. Não dá para desfazer."
      options={
        hasFollowing
          ? [
              { label: "Só esta", fields: { ...fields, scope: "one" }, destructive: true },
              { label: "Esta e as próximas", fields: { ...fields, scope: "following" }, destructive: true },
            ]
          : [{ label: "Excluir", fields: { ...fields, scope: "one" }, destructive: true }]
      }
    />
  );
}
