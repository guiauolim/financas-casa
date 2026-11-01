import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentProfile } from "@/lib/auth/session";
import { getPendingInvite } from "@/lib/services/households";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteForm, CreateHouseholdForm } from "./forms";

export const metadata: Metadata = { title: "Primeiro acesso" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <OnboardingStep />
    </Suspense>
  );
}

// Primeiro login: entra na casa para a qual foi convidado ou cria uma nova.
async function OnboardingStep() {
  if (await getCurrentProfile()) redirect("/dashboard");
  const invite = await getPendingInvite(await createClient());

  return (
    <>
      <CardHeader>
        <CardTitle className="text-[28px] font-bold tracking-tight">
          {invite ? "Você foi convidado(a)" : "Bem-vindo(a)!"}
        </CardTitle>
        <CardDescription>
          {invite ? (
            <>
              Você vai entrar na casa <strong className="text-foreground">{invite.householdName}</strong>. Como
              podemos te chamar?
            </>
          ) : (
            "Vamos criar a sua casa. Depois você pode convidar a outra pessoa para dividir tudo."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>{invite ? <AcceptInviteForm /> : <CreateHouseholdForm />}</CardContent>
      <CardFooter className="text-[13px] text-muted-foreground">
        <form action="/auth/signout" method="post" className="flex items-center gap-1">
          Entrou com o e-mail errado?
          <button type="submit" className="min-h-11 font-medium text-primary underline-offset-4 hover:underline">
            Sair
          </button>
        </form>
      </CardFooter>
    </>
  );
}

function OnboardingSkeleton() {
  return (
    <CardContent className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </CardContent>
  );
}
