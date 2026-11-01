import { describe, expect, it } from "vitest";
import { createHouseholdSchema, inviteMemberSchema, loginSchema } from "./onboarding";

describe("loginSchema", () => {
  it("normaliza o e-mail", () => {
    expect(loginSchema.parse({ email: "  Ana@Exemplo.COM " })).toEqual({ email: "ana@exemplo.com" });
  });

  it("rejeita e-mail inválido com mensagem em PT-BR", () => {
    const result = loginSchema.safeParse({ email: "ana@" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Informe um e-mail válido.");
  });

  it("rejeita e-mail ausente", () => {
    expect(loginSchema.safeParse({ email: null }).success).toBe(false);
  });
});

describe("createHouseholdSchema", () => {
  it("apara espaços", () => {
    expect(createHouseholdSchema.parse({ householdName: " Casa ", displayName: " Ana " })).toEqual({
      householdName: "Casa",
      displayName: "Ana",
    });
  });

  it("rejeita nomes vazios e longos", () => {
    const result = createHouseholdSchema.safeParse({ householdName: "   ", displayName: "a".repeat(81) });
    expect(result.success).toBe(false);
    const messages = Object.fromEntries(result.error!.issues.map((i) => [i.path[0], i.message]));
    expect(messages).toEqual({
      householdName: "Informe o nome da casa.",
      displayName: "Use no máximo 80 caracteres.",
    });
  });
});

describe("inviteMemberSchema", () => {
  it("aceita e-mail válido", () => {
    expect(inviteMemberSchema.parse({ email: "Bruno@exemplo.com" }).email).toBe("bruno@exemplo.com");
  });
});
