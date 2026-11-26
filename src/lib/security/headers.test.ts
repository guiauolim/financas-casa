import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { contentSecurityPolicy, securityHeaders } from "./headers";

const byKey = (headers: { key: string; value: string }[]) => new Map(headers.map((h) => [h.key, h.value]));

describe("securityHeaders", () => {
  const headers = byKey(securityHeaders({ supabaseUrl: "https://projeto-ficticio.supabase.co/" }));

  it.each([
    ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["X-Frame-Options", "DENY"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
  ])("%s", (key, value) => {
    expect(headers.get(key)).toBe(value);
  });

  it("CSP em Report-Only, sem iframe de fora e com o Supabase liberado", () => {
    const csp = headers.get("Content-Security-Policy-Report-Only")!;
    expect(headers.has("Content-Security-Policy")).toBe(false);
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "connect-src 'self' https://projeto-ficticio.supabase.co",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toContain("unsafe-eval");
  });

  it("'unsafe-eval' e websocket só em desenvolvimento", () => {
    const csp = contentSecurityPolicy({ dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
  });
});

describe("next.config", () => {
  it("aplica os cabeçalhos em todas as rotas", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    const keys = all!.headers.map((h) => h.key);
    for (const key of [
      "Content-Security-Policy-Report-Only",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "X-Frame-Options",
      "Permissions-Policy",
    ]) {
      expect(keys).toContain(key);
    }
  });
});
