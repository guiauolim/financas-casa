// Datas de calendário como "YYYY-MM-DD" / "YYYY-MM", sem Date local: evita erros de
// fuso (o lançamento é uma data em America/Sao_Paulo, não um instante).

export type YearMonth = { year: number; month: number }; // month 1–12

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

const pad = (n: number, size = 2) => String(n).padStart(size, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseISODate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function parseYearMonth(value: string): YearMonth | null {
  const match = ISO_MONTH.exec(value);
  if (!match) return null;
  const [year, month] = [Number(match[1]), Number(match[2])];
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function toISODate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function toYearMonth({ year, month }: YearMonth): string {
  return `${pad(year, 4)}-${pad(month)}`;
}

export function addMonthsYM({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

// Dia `day` no mês informado, limitado ao último dia (31 em fevereiro -> 28/29).
export function clampedDate({ year, month }: YearMonth, day: number): string {
  return toISODate(year, month, Math.min(day, daysInMonth(year, month)));
}

// Mesma data `delta` meses depois, com o dia limitado ao fim do mês.
// Sempre a partir do dia original (31/jan + 2 meses = 31/mar, não 28/mar).
export function addMonthsToDate(date: string, delta: number): string {
  const parsed = parseISODate(date);
  if (!parsed) throw new RangeError(`Data inválida: ${date}`);
  return clampedDate(addMonthsYM(parsed, delta), parsed.day);
}

export function monthRange(ym: YearMonth): { from: string; to: string } {
  return { from: toISODate(ym.year, ym.month, 1), to: toISODate(ym.year, ym.month, daysInMonth(ym.year, ym.month)) };
}

export function todayInSaoPaulo(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fullDayFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });

const utc = (date: string) => new Date(`${date}T12:00:00Z`);

export const formatMonthLong = (ym: YearMonth) => monthFormat.format(utc(monthRange(ym).from)); // "novembro de 2026"
export const formatMonthShort = (ym: YearMonth) => shortMonthFormat.format(utc(monthRange(ym).from)).replace(/\./g, ""); // "nov de 2026"
export const formatDayMonth = (date: string) => dayFormat.format(utc(date)); // "01/11"
export const formatDate = (date: string) => fullDayFormat.format(utc(date)); // "01/11/2026"
