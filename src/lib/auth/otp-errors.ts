// Traduz falhas do envio de magic link (signInWithOtp) para mensagens em PT-BR.
// O Supabase responde 429 em três situações diferentes, e cada uma pede uma ação diferente.
export function otpErrorMessage(error: { status?: number; code?: string; message: string }): string {
  // Cadastro fechado (Authentication → Sign In / Providers → "Allow new users to sign up" desligado):
  // e-mail sem conta não recebe link. Quem foi convidado já tem conta criada pelo convite.
  if (
    error.code === "signup_disabled" ||
    error.code === "otp_disabled" ||
    /signups? not allowed/i.test(error.message)
  ) {
    return "Este e-mail não tem acesso. Peça um convite a quem já usa o app.";
  }

  // Mesmo e-mail pedindo outro link cedo demais: "...you can only request this after 42 seconds."
  const seconds = /after (\d+) seconds?/i.exec(error.message)?.[1];
  if (seconds) return `Aguarde ${seconds} segundos para pedir um novo link.`;

  // Limite de e-mails por hora do projeto (o SMTP padrão do Supabase envia poucos).
  if (error.code === "over_email_send_rate_limit") {
    return "Limite de e-mails de acesso atingido. Tente de novo mais tarde (o limite é por hora).";
  }

  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "Muitas tentativas. Espere um minuto e tente de novo.";
  }

  return "Não foi possível enviar o link. Tente novamente.";
}
