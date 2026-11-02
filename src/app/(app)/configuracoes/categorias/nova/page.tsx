import type { Metadata } from "next";
import { Panel } from "@/components/panel";
import { CategoryForm } from "../category-form";

export const metadata: Metadata = { title: "Nova categoria" };

export default function NovaCategoriaPage() {
  return (
    <Panel title="Nova categoria" className="max-w-2xl">
      <CategoryForm />
    </Panel>
  );
}
