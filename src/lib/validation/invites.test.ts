import { describe, expect, it } from "vitest";
import { INVITE_LIMIT_MESSAGE, inviteExpiresAt, inviteSentMessage } from "./invites";

describe("convites", () => {
  it("vale 7 dias", () => {
    expect(inviteExpiresAt(new Date("2026-11-26T12:00:00Z"))).toBe("2026-12-03T12:00:00.000Z");
  });

  it("a mensagem não diz se o e-mail já tem conta", () => {
    const message = inviteSentMessage("pessoa@exemplo.com");
    expect(message).toContain("pessoa@exemplo.com");
    expect(message).not.toMatch(/já tem conta\./);
    expect(message).toMatch(/Se a pessoa ainda não tem conta.*se já tem/);
  });

  it("mensagem de limite cita o número", () => {
    expect(INVITE_LIMIT_MESSAGE).toContain("5 convites por dia");
  });
});
