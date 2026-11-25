-- supabase/migrations/0012_orcamento_cartao.sql
-- Limite mensal do cartão ("limite da fatura"): orçamento mensal com cartão e sem categoria.
-- O ritmo semanal (quanto dá para gastar na semana) é calculado no código (lib/finance/pacing.ts).
--
-- Escopos válidos:
--   monthly, sem categoria e sem conta  -> limite mensal total da casa
--   monthly, com categoria e sem conta  -> limite mensal da categoria
--   monthly, com cartão e sem categoria -> limite da fatura do cartão (novo)
--   weekly,  com cartão e sem categoria -> limite semanal fixo do cartão
-- Só amplia o que é aceito: o site no ar nunca cria o escopo novo.
alter table budgets drop constraint budgets_scope;
alter table budgets
  add constraint budgets_scope check (
    (period = 'monthly' and (account_id is null or category_id is null))
    or (period = 'weekly' and account_id is not null and category_id is null)
  );
