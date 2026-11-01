import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-[clamp(16px,3vw,40px)]">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-[28px] font-bold tracking-tight">Finanças da Casa</CardTitle>
          <CardDescription>Entre com seu e-mail. Vamos mandar um link de acesso, sem senha.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[120px] w-full" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
