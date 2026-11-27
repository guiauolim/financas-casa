import { describe, expect, it } from "vitest";
import { sessionCookieOptions } from "./cookie-options";

describe("sessionCookieOptions", () => {
  it("HttpOnly, SameSite=Lax e Secure em produção", () => {
    expect(sessionCookieOptions(true)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  });
  it("sem Secure só fora de produção (http://localhost)", () => {
    expect(sessionCookieOptions(false)).toMatchObject({ httpOnly: true, secure: false, sameSite: "lax" });
  });
});
