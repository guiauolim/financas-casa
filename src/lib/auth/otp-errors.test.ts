import { describe, expect, it } from "vitest";
import { otpErrorMessage } from "./otp-errors";

describe("otpErrorMessage", () => {
  it("informa os segundos de espera do mesmo e-mail", () => {
    expect(
      otpErrorMessage({
        status: 429,
        code: "over_email_send_rate_limit",
        message: "For security purposes, you can only request this after 42 seconds.",
      }),
    ).toBe("Aguarde 42 segundos para pedir um novo link.");
  });

  it("explica o limite de e-mails por hora do projeto", () => {
    expect(
      otpErrorMessage({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" }),
    ).toBe("Limite de e-mails de acesso atingido. Tente de novo mais tarde (o limite é por hora).");
  });

  it("trata limite de requisições", () => {
    expect(otpErrorMessage({ status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" })).toBe(
      "Muitas tentativas. Espere um minuto e tente de novo.",
    );
  });

  it.each([
    { status: 422, code: "signup_disabled", message: "Signups not allowed for this instance" },
    { status: 422, code: "otp_disabled", message: "Signups not allowed for otp" },
    { status: 400, code: undefined, message: "Signups not allowed for otp" },
  ])("explica cadastro fechado ($code)", (error) => {
    expect(otpErrorMessage(error)).toBe("Este e-mail não tem acesso. Peça um convite a quem já usa o app.");
  });

  it("usa mensagem genérica para outros erros", () => {
    expect(otpErrorMessage({ status: 500, code: "unexpected_failure", message: "boom" })).toBe(
      "Não foi possível enviar o link. Tente novamente.",
    );
  });
});
