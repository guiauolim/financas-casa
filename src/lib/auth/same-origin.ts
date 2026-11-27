// Pedido de mudança de estado vindo do próprio site? Para rotas POST fora das Server Actions
// (que já conferem a origem sozinhas), ex.: /auth/signout. Sem isso, outro site poderia enviar um
// formulário que desloga o usuário (CSRF). Aceita: Origin igual ao do site; sem Origin, só se o
// navegador disser que é do mesmo site (Sec-Fetch-Site same-origin/none).
export function isSameOriginRequest(headers: Headers, requestUrl: string): boolean {
  const expected = new URL(requestUrl).origin;
  const origin = headers.get("origin");
  if (origin) return origin === expected;
  const site = headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}
