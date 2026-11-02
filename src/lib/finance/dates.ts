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

// Soma `delta` dias a uma data de calendário (meio-dia UTC: sem efeito de fuso/horário de verão).
export function addDays(date: string, delta: number): string {
  if (!parseISODate(date)) throw new RangeError(`Data inválida: ${date}`);
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Dias de `from` até `to` (to − from), em dias de calendário.
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
}

// Dia da semana com segunda = 0 … domingo = 6.
export function weekdayIndex(date: string): number {
  if (!parseISODate(date)) throw new RangeError(`Data inválida: ${date}`);
  return (utc(date).getUTCDay() + 6) % 7;
}

// Semana de segunda a domingo que contém `date`.
export function weekRange(date: string): { from: string; to: string } {
  const from = addDays(date, -weekdayIndex(date));
  return { from, to: addDays(from, 6) };
}

export function yearMonthOf(date: string): YearMonth {
  const parsed = parseISODate(date);
  if (!parsed) throw new RangeError(`Data inválida: ${date}`);
  return { year: parsed.year, month: parsed.month };
}

export function compareYM(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

const monthAbbrevFormat = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
// "2026-11" -> "nov"
export const formatMonthAbbrev = (ym: string) =>
  monthAbbrevFormat.format(new Date(`${ym}-15T12:00:00Z`)).replace(/\./g, "");
