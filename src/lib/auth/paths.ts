// Rotas que não exigem sessão.
// /api/* fica liberado no proxy de propósito: cada rota de API se autentica
// sozinha (webhook do WhatsApp pela assinatura X-Hub-Signature-256, crons por
// `Authorization: Bearer ${CRON_SECRET}`). Ao criar uma rota em /api, autenticar nela.
const PUBLIC_PREFIXES = ["/login", "/auth/", "/api/"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Aceita só caminhos internos (evita open redirect via ?next=https://...).
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
