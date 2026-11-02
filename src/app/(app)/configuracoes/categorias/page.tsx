import { Archive, ArchiveRestore, House, Pencil, Plus, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/action-button";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton, Panel } from "@/components/panel";
import { buttonVariants } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import { type Category, listCategories } from "@/lib/services/categories";
import { createClient } from "@/lib/supabase/server";
import { archiveCategoryAction } from "../actions";

export const metadata: Metadata = { title: "Categorias" };

export default function CategoriasPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <CategoryList />
    </Suspense>
  );
}

const newCategoryLink = (
  <Link href="/configuracoes/categorias/nova" className={buttonVariants()}>
    <Plus aria-hidden />
    Nova categoria
  </Link>
);

const GROUPS = [
  { type: "expense", title: "Despesas" },
  { type: "income", title: "Receitas" },
  { type: "transfer", title: "Transferências" },
] as const;

async function CategoryList() {
  const actor = await requireActor();
  const categories = await listCategories(await createClient(), {
    householdId: actor.householdId,
    includeArchived: true,
  });

  if (categories.length === 0) {
    return (
      <EmptyState
        icon={Tags}
        title="Nenhuma categoria"
        description="Crie categorias para organizar os gastos e as receitas da casa."
        action={newCategoryLink}
      />
    );
  }

  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);

  return (
    <>
      {GROUPS.map((group, index) => {
        const items = active.filter((c) => c.type === group.type);
        if (!items.length) return null;
        return (
          <Panel key={group.type} title={group.title} actions={index === 0 ? newCategoryLink : undefined}>
            <CategoryRows categories={items} />
          </Panel>
        );
      })}
      {archived.length ? (
        <Panel title="Arquivadas" description="Não aparecem nos formulários, mas o histórico continua.">
          <CategoryRows categories={archived} />
        </Panel>
      ) : null}
    </>
  );
}

function CategoryRows({ categories }: { categories: Category[] }) {
  return (
    <ul className="flex flex-col divide-y divide-divider">
      {categories.map((category) => (
        <li key={category.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <CategoryIcon icon={category.icon} className="size-9" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="flex items-center gap-2 truncate font-medium">
              <span className="truncate">{category.name}</span>
              {category.householdDefault ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[12px] font-medium text-primary-soft-foreground">
                  <House className="size-3" aria-hidden />
                  Casa
                </span>
              ) : null}
            </p>
            {category.aliases.length ? (
              <p className="truncate text-[13px] text-muted-foreground">{category.aliases.join(", ")}</p>
            ) : null}
          </div>
          <Link
            href={`/configuracoes/categorias/${category.id}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label={`Editar ${category.name}`}
          >
            <Pencil aria-hidden />
          </Link>
          <ActionButton
            action={archiveCategoryAction}
            fields={{ id: category.id, archived: String(!category.archived) }}
            variant="ghost"
            size="icon"
            aria-label={category.archived ? `Reativar ${category.name}` : `Arquivar ${category.name}`}
          >
            {category.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          </ActionButton>
        </li>
      ))}
    </ul>
  );
}
