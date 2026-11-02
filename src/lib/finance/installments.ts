import { addMonthsToDate } from "./dates";

export const MAX_INSTALLMENTS = 48;

// Divide `totalCents` em `count` parcelas inteiras sem perder centavos:
// todas recebem ⌊total/count⌋ e o resto vai para a 1ª parcela (como os bancos fazem).
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new RangeError("Valor inválido");
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) throw new RangeError("Parcelas inválidas");
  if (totalCents < count) throw new RangeError("Valor menor que o número de parcelas");
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

// Datas das parcelas: a 1ª na data da compra e as seguintes no mesmo dia dos meses
// seguintes (limitado ao fim do mês). No cartão, cada uma cai na fatura do seu mês.
export function installmentDates(firstDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonthsToDate(firstDate, i));
}

export type InstallmentPlan = { number: number; total: number; amountCents: number; occurredOn: string }[];

export function planInstallments(totalCents: number, count: number, firstDate: string): InstallmentPlan {
  const amounts = splitInstallments(totalCents, count);
  const dates = installmentDates(firstDate, count);
  return amounts.map((amountCents, i) => ({ number: i + 1, total: count, amountCents, occurredOn: dates[i]! }));
}
