"use client";

import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
}

function FieldMessages({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function Field({
  name,
  label,
  error,
  hint,
  className,
  id: idProp,
  ...inputProps
}: { name: string; label: string; error?: string; hint?: ReactNode } & ComponentProps<"input">) {
  const id = idProp ?? name;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...inputProps}
      />
      <FieldMessages id={id} error={error} hint={hint} />
    </div>
  );
}

// Valor em reais no formato brasileiro ("1.234,56"); o servidor converte para centavos.
export function AmountField({
  style,
  ...props
}: { name: string; label: string; error?: string; hint?: ReactNode } & ComponentProps<"input">) {
  return (
    <Field
      inputMode="decimal"
      autoComplete="off"
      placeholder="0,00"
      {...props}
      // Geist Mono para valores (Guia visual).
      style={{ fontFamily: "var(--font-mono)", ...style }}
    />
  );
}

export const selectClassName =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:opacity-50 md:text-sm";

export function SelectField({
  name,
  label,
  error,
  hint,
  className,
  children,
  id: idProp,
  ...selectProps
}: { name: string; label: string; error?: string; hint?: ReactNode } & ComponentProps<"select">) {
  const id = idProp ?? name;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        className={selectClassName}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...selectProps}
      >
        {children}
      </select>
      <FieldMessages id={id} error={error} hint={hint} />
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  return message ? (
    <p className="text-[13px] text-danger" role="alert">
      {message}
    </p>
  ) : null;
}

export function FormSuccess({ message }: { message?: string }) {
  return message ? (
    <p className="rounded-lg bg-primary-soft px-3 py-2 text-[13px] text-primary-soft-foreground" role="status">
      {message}
    </p>
  ) : null;
}

// Grupo de opções exclusivas com cara de "segmented control" (radios reais).
export function Segmented<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  legend: string;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange?: (value: T) => void;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors",
              "has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm",
              "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              option.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange?.(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
