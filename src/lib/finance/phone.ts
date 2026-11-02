// Normaliza telefone para E.164 (formato usado pelo WhatsApp Cloud API).
// Sem "+" e com 10–11 dígitos (DDD + número) assume Brasil (+55).
// Retorna null se não parecer um telefone válido.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/[^\d\s()+.-]/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");

  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (digits.length === 10 || digits.length === 11) e164 = `+55${digits}`;
  else if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) e164 = `+${digits}`;
  else return null;

  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  // Celular brasileiro: DDD (2 dígitos, sem zero) + 9 + 8 dígitos; fixo: 8 dígitos.
  if (e164.startsWith("+55") && !/^\+55[1-9][1-9](9\d{8}|[2-8]\d{7})$/.test(e164)) return null;
  return e164;
}

// "+5561999999999" -> "+55 (61) 99999-9999"; outros países ficam como estão.
export function formatPhone(e164: string): string {
  const br = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return br ? `+55 (${br[1]}) ${br[2]}-${br[3]}` : e164;
}
