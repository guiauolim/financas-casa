import type { Metadata } from "next";
import { Suspense } from "react";
import { PasswordForm } from "@/components/password-form";
import { FormSkeleton, Panel } from "@/components/panel";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Senha" };

export default function SenhaConfigPage() {
  return (
    <Panel
      title="Senha"
      description="Crie ou troque a senha de acesso. Ao salvar, as outras sessões abertas (outros navegadores e aparelhos) são encerradas."
      className="max-w-xl"
    >
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <ChangePassword />
      </Suspense>
    </Panel>
  );
}

async function ChangePassword() {
  const user = await getCurrentUser();
  return <PasswordForm email={user?.email ?? null} />;
}
