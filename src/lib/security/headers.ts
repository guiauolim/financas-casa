// Cabeçalhos de segurança de todas as respostas (usados em next.config.ts). Puro: testável.
//
// CSP em Report-Only por enquanto: o navegador só avisa (console) o que bloquearia, sem quebrar
// nada. Depois de uma semana sem avisos, trocar a chave para "Content-Security-Policy".
// 'unsafe-inline' em script por causa dos scripts inline do Next (trocar por nonce depois);
// 'unsafe-eval' só em desenvolvimento (React Refresh).

export type SecurityHeader = { key: string; value: string };

export function contentSecurityPolicy({ supabaseUrl, dev }: { supabaseUrl?: string; dev?: boolean }): string {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(supabase ? [supabase] : []), ...(dev ? ["ws:"] : [])],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(opts: { supabaseUrl?: string; dev?: boolean } = {}): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(opts) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
}
