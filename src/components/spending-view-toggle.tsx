import { CalendarDays, CreditCard } from "lucide-react";
import { setSpendingViewAction } from "@/app/(app)/preferences-actions";
import { SPENDING_VIEW_LABELS, SPENDING_VIEWS, type SpendingView } from "@/lib/finance/spending-view";
import { cn } from "@/lib/utils";

const ICONS = { purchase: CalendarDays, invoice: CreditCard } as const;

// Alterna entre "Por data da compra" e "Por fatura". A escolha fica no perfil do usuário e vale
// para Visão geral, Orçamentos e Transações. Formulário real: funciona sem JavaScript.
export function SpendingViewToggle({ view }: { view: SpendingView }) {
  return (
    <form action={setSpendingViewAction} className="flex flex-col gap-1">
      <span id="spending-view-label" className="sr-only">
        Contar o gasto do mês
      </span>
      <div role="group" aria-labelledby="spending-view-label" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {SPENDING_VIEWS.map((option) => {
          const Icon = ICONS[option];
          const active = option === view;
          return (
            <button
              key={option}
              type="submit"
              name="view"
              value={option}
              aria-pressed={active}
              className={cn(
                "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" strokeWidth={2} aria-hidden />
              {SPENDING_VIEW_LABELS[option]}
            </button>
          );
        })}
      </div>
    </form>
  );
}

// Explica a visão escolhida em uma linha.
export function spendingViewNote(view: SpendingView): string {
  return view === "invoice"
    ? "Por fatura: compras no cartão contam no mês da fatura (inclusive parcelas de compras antigas); o resto, pela data."
    : "Por data da compra: cada lançamento conta no mês da sua data; parcelas, no mês de cada parcela.";
}
