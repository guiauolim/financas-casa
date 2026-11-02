"use client";

import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type ActionResult = { error?: string; success?: string } | void;
type Action = (formData: FormData) => Promise<ActionResult>;

function toFormData(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function useRunAction(action: Action) {
  const [pending, startTransition] = useTransition();
  const run = (fields: Record<string, string>, after?: () => void) =>
    startTransition(async () => {
      const result = await action(toFormData(fields));
      if (result?.error) toast.error(result.error);
      else if (result?.success) toast.success(result.success);
      after?.();
    });
  return { pending, run };
}

type ButtonProps = Pick<React.ComponentProps<typeof Button>, "variant" | "size" | "className" | "aria-label">;

// Botão que dispara uma Server Action sem confirmação (ex.: arquivar/restaurar).
export function ActionButton({
  action,
  fields,
  children,
  pendingLabel,
  ...buttonProps
}: { action: Action; fields: Record<string, string>; children: ReactNode; pendingLabel?: string } & ButtonProps) {
  const { pending, run } = useRunAction(action);
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => run(fields)} {...buttonProps}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

// Botão com diálogo de confirmação. Cada opção vira um botão no rodapé (ex.:
// "Só esta" / "Esta e as próximas"), enviando seus próprios campos.
export function ConfirmAction({
  action,
  trigger,
  title,
  description,
  options,
  ...buttonProps
}: {
  action: Action;
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  options: { label: string; fields: Record<string, string>; destructive?: boolean }[];
} & ButtonProps) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunAction(action);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} {...buttonProps}>
        {trigger}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            {options.map((option) => (
              <Button
                key={option.label}
                type="button"
                variant={option.destructive ? "destructive" : "default"}
                disabled={pending}
                onClick={() => run(option.fields, () => setOpen(false))}
              >
                {option.label}
              </Button>
            ))}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
