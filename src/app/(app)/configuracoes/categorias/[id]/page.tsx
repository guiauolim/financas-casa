import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { FormSkeleton, Panel } from "@/components/panel";
import { requireActor } from "@/lib/auth/session";
import { getCategory } from "@/lib/services/categories";
import { createClient } from "@/lib/supabase/server";
import { CategoryForm } from "../category-form";

export const metadata: Metadata = { title: "Editar categoria" };

export default function EditarCategoriaPage({ params }: PageProps<"/configuracoes/categorias/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton fields={4} />}>
      <EditCategory params={params} />
    </Suspense>
  );
}

async function EditCategory({ params }: Pick<PageProps<"/configuracoes/categorias/[id]">, "params">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await requireActor();
  const category = await getCategory(await createClient(), { householdId: actor.householdId, categoryId: id.data });
  if (!category) notFound();
  return (
    <Panel title={`Editar ${category.name}`} className="max-w-2xl">
      <CategoryForm category={category} />
    </Panel>
  );
}
