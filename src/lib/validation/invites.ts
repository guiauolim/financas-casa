// Regras dos convites (puras). O limite de verdade fica no banco (trigger da 0015); aqui ficam os
// mesmos números para as mensagens e a validade do convite.
export const INVITE_LIMIT_PER_DAY = 5;
export const INVITE_VALID_DAYS = 7;

export const inviteExpiresAt = (now: Date = new Date()) =>
  new Date(now.getTime() + INVITE_VALID_DAYS * 86_400_000).toISOString();

// Mesma resposta exista ou não conta com o e-mail: o site não revela quem já tem cadastro.
export const inviteSentMessage = (email: string) =>
  `Convite registrado para ${email}. Se a pessoa ainda não tem conta, recebe um e-mail; se já tem, o convite aparece quando ela entrar no site. Vale por ${INVITE_VALID_DAYS} dias.`;

export const INVITE_LIMIT_MESSAGE = `Limite de ${INVITE_LIMIT_PER_DAY} convites por dia atingido. Tente de novo amanhã.`;
