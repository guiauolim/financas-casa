import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./paths";

describe("isPublicPath", () => {
  it.each(["/login", "/auth/confirm", "/auth/signout", "/api/whatsapp/webhook", "/api/cron/weekly-insights"])(
    "libera %s",
    (path) => expect(isPublicPath(path)).toBe(true),
  );

  it.each(["/", "/dashboard", "/transacoes", "/onboarding", "/onboarding/convite", "/loginx", "/authx", "/apix"])(
    "protege %s",
    (path) => expect(isPublicPath(path)).toBe(false),
  );
});

describe("safeNextPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/transacoes?mes=2026-11")).toBe("/transacoes?mes=2026-11");
  });

  it.each([null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "dashboard"])(
    "usa o fallback para %s",
    (next) => expect(safeNextPath(next)).toBe("/dashboard"),
  );
});
