import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentProfile } from "@/lib/auth/session";
import { InviteMemberForm } from "../forms";

export const metadata: Metadata = { title: "Convidar membro" };

export default function InvitePage() {
  return (
    <>
      <CardHeader>
        <CardTitle className="text-[28px] font-bold tracking-tight">Convide a outra pessoa</CardTitle>
        <CardDescription>
          Ela recebe um link por e-mail e, ao entrar, passa a ver a mesma casa que você.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-[120px] w-full" />}>
          <InviteStep />
        </Suspense>
      </CardContent>
      <CardFooter>
        <Link href="/dashboard" className={buttonVariants({ variant: "ghost", className: "w-full" })}>
          Continuar para a visão geral
        </Link>
      </CardFooter>
    </>
  );
}

async function InviteStep() {
  if (!(await getCurrentProfile())) redirect("/onboarding");
  return <InviteMemberForm />;
}
