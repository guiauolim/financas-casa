import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PasswordForm } from "@/components/password-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { safeNextPath } from "@/lib/auth/paths";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Criar senha" };

// Depois de entrar pelo link do e-mail (convite ou "esqueci a senha"): criar a senha para os
// próximos acessos. Fora do layout do app: vale também antes do onboarding.
export default function SenhaPage({ searchParams }: PageProps<"/senha">) {
  return (
    <main className="flex flex-1 items-center justify-center p-[clamp(16px,3vw,40px)]">
      <Card className="w-full max-w-sm">
        <Suspense fallback={<Skeleton className="m-6 h-64" />}>
          <CreatePassword searchParams={searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}

async function CreatePassword({ searchParams }: Pick<PageProps<"/senha">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === "string" ? next : null);
  return (
    <>
      <CardHeader>
        <CardTitle className="text-[28px] font-bold tracking-tight">Crie sua senha</CardTitle>
        <CardDescription>Assim, nas próximas vezes você entra com e-mail e senha, sem esperar o e-mail.</CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordForm email={user.email} next={target} submitLabel="Criar senha e continuar" />
      </CardContent>
      <CardFooter className="text-[13px] text-muted-foreground">
        <Link href={target} className="min-h-11 content-center font-medium text-primary underline-offset-4 hover:underline">
          Agora não
        </Link>
      </CardFooter>
    </>
  );
}
