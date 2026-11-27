import { describe, expect, it } from "vitest";
import {
  hasPassword,
  passwordLoginErrorMessage,
  pathAfterEmailLink,
  passwordSchema,
  setPasswordSchema,
} from "./password";

describe("senha", () => {
  it("pede 8+ caracteres com letra e número", () => {
    expect(passwordSchema.safeParse("curta1").success).toBe(false);
    expect(passwordSchema.safeParse("somenteletras").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("casa2026ficticia").success).toBe(true);
  });

  it("confirmação precisa ser igual", () => {
    const r = setPasswordSchema.safeParse({ password: "casa2026ficticia", confirm: "outra2026" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["confirm"]);
  });
});

describe("depois do link do e-mail", () => {
  it("sem senha → criar senha, guardando o destino", () => {
    expect(pathAfterEmailLink({}, "/onboarding")).toBe("/senha?next=%2Fonboarding");
    expect(pathAfterEmailLink(null, null)).toBe("/senha?next=%2Fdashboard");
  });

  it("com senha → direto para o destino (só caminhos internos)", () => {
    expect(pathAfterEmailLink({ has_password: true }, "/transacoes")).toBe("/transacoes");
    expect(pathAfterEmailLink({ has_password: true }, "https://site-malicioso.exemplo")).toBe("/dashboard");
    expect(hasPassword({ has_password: "true" })).toBe(false);
  });
});

describe("mensagens do login com senha", () => {
  it("não revelam se o e-mail existe", () => {
    expect(passwordLoginErrorMessage({ code: "invalid_credentials" })).toBe("E-mail ou senha incorretos.");
    expect(passwordLoginErrorMessage({ code: "user_not_found" })).toBe("E-mail ou senha incorretos.");
    expect(passwordLoginErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
  });
});
