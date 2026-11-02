"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxCategory = { id: string; name: string };

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Escolha de categoria com busca (ignora acento e maiúsculas). Controlado por id.
export function CategoryCombobox({
  categories,
  value,
  onChange,
  label,
  highlight = false,
  className,
}: {
  categories: readonly ComboboxCategory[];
  value: string | null;
  onChange: (categoryId: string) => void;
  label: string; // aria-label (a tabela não tem <label> visível por linha)
  highlight?: boolean; // destaca (ex.: "Outros" para revisar)
  className?: string;
}) {
  const selected = categories.find((c) => c.id === value) ?? null;
  return (
    <Combobox.Root
      items={categories}
      value={selected}
      onValueChange={(item) => {
        if (item) onChange((item as ComboboxCategory).id);
      }}
      itemToStringLabel={(item: ComboboxCategory) => item.name}
      isItemEqualToValue={(a: ComboboxCategory, b: ComboboxCategory) => a.id === b.id}
      filter={(item: ComboboxCategory, query: string) => normalize(item.name).includes(normalize(query))}
      autoHighlight
    >
      <div className={cn("relative", className)}>
        <Combobox.Input
          aria-label={label}
          placeholder="Buscar categoria"
          className={cn(
            "h-11 w-full min-w-[180px] rounded-lg border border-input bg-card pr-9 pl-3 text-sm outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            highlight && "border-[#C9761F] bg-[#FBEBD9]/50",
          )}
        />
        <Combobox.Trigger
          aria-label="Ver categorias"
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground"
        >
          <ChevronDown className="size-4" aria-hidden />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-72 w-[var(--anchor-width)] min-w-[220px] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-md">
            <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground empty:hidden">
              Nenhuma categoria encontrada.
            </Combobox.Empty>
            <Combobox.List>
              {(item: ComboboxCategory) => (
                <Combobox.Item
                  key={item.id}
                  value={item}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-sm data-[highlighted]:bg-muted"
                >
                  <Combobox.ItemIndicator className="text-primary">
                    <Check className="size-4" aria-hidden />
                  </Combobox.ItemIndicator>
                  <span className="flex-1">{item.name}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
