import { Card } from "@/components/ui/card";

export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return (
    <main className="flex flex-1 items-center justify-center p-[clamp(16px,3vw,40px)]">
      <Card className="w-full max-w-md">{children}</Card>
    </main>
  );
}
