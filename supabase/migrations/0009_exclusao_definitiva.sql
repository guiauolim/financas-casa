-- supabase/migrations/0009_exclusao_definitiva.sql
-- Sem lixeira: excluir um lançamento passa a ser DELETE definitivo (código novo).
-- COMPATÍVEL com o código anterior (main): só cria funções e índices e apaga o que estava na
-- lixeira. A coluna deleted_at, os índices parciais e profiles.spending_view continuam aqui e
-- só saem na 0010, que vai DEPOIS do merge e do deploy.

-- ───────────────────────── Fim da lixeira ─────────────────────────

-- O que estava na lixeira é apagado de vez. (A 0010 repete, para o que o código antigo ainda
-- mandar para a lixeira até o deploy.)
delete from transactions where deleted_at is not null;

-- Índices sem a condição "deleted_at is null": o código novo não filtra deleted_at, então os
-- índices parciais antigos não servem para as consultas dele. Os antigos saem na 0010.
create index if not exists transactions_household_occurred_idx on transactions (household_id, occurred_on desc);
create index if not exists transactions_account_occurred_idx on transactions (account_id, occurred_on);
create index if not exists transactions_spent_by_occurred_idx on transactions (household_id, spent_by, occurred_on);
create index if not exists transactions_account_invoice_idx on transactions (household_id, account_id, invoice_ref)
  where invoice_ref is not null;
-- Pagamentos de fatura (transferências para o cartão), lidos por card_invoice_totals.
create index if not exists transactions_transfer_account_idx on transactions (transfer_account_id)
  where transfer_account_id is not null;

-- ───────────────────────── Totais das faturas ─────────────────────────
-- Soma por cartão e fatura, para calcular Total / Pago / Falta sem baixar todos os lançamentos.
-- A alocação dos pagamentos (fatura gravada primeiro, depois FIFO) continua em TypeScript
-- (lib/finance/balances.ts → cardInvoices), sobre estas linhas.
--   kind = 'charge': lançamentos NO cartão (compra/saque somam, estorno abate), pela fatura gravada;
--                    sem fatura gravada, uma linha por data (o TS calcula a fatura pela data).
--   kind = 'payment': transferências PARA o cartão, pela fatura paga (null = FIFO).
-- Não olha deleted_at: depois desta migration o código novo não manda nada para a lixeira.
create or replace function card_invoice_totals(p_household_id uuid)
returns table (kind text, account_id uuid, invoice_ref text, occurred_on date, amount_cents bigint)
language sql stable security invoker set search_path = public as $$
  select 'charge', t.account_id, t.invoice_ref,
         case when t.invoice_ref is null then t.occurred_on end,
         sum(case when t.type = 'income' then -t.amount_cents else t.amount_cents end)::bigint
    from transactions t
    join accounts a on a.id = t.account_id and a.kind = 'credit_card'
   where t.household_id = p_household_id
   group by t.account_id, t.invoice_ref, case when t.invoice_ref is null then t.occurred_on end
  union all
  select 'payment', t.transfer_account_id, t.invoice_ref, null, sum(t.amount_cents)::bigint
    from transactions t
    join accounts a on a.id = t.transfer_account_id and a.kind = 'credit_card'
   where t.household_id = p_household_id and t.type = 'transfer'
   group by t.transfer_account_id, t.invoice_ref;
$$;

revoke all on function card_invoice_totals(uuid) from public, anon;
grant execute on function card_invoice_totals(uuid) to authenticated;

-- Total da compra (soma das parcelas) dos grupos de parcelas que aparecem no mês: lançamentos com
-- data entre p_from e p_to ou com fatura em p_refs. Uma ida ao banco, em paralelo com a lista.
create or replace function month_installment_totals(p_household_id uuid, p_from date, p_to date, p_refs text[])
returns table (installment_group_id uuid, total_cents bigint)
language sql stable security invoker set search_path = public as $$
  select g.installment_group_id, sum(g.amount_cents)::bigint
    from transactions g
   where g.household_id = p_household_id
     and g.installment_group_id in (
       select m.installment_group_id
         from transactions m
        where m.household_id = p_household_id
          and m.installment_group_id is not null
          and (m.occurred_on between p_from and p_to or m.invoice_ref = any(p_refs)))
   group by g.installment_group_id;
$$;

revoke all on function month_installment_totals(uuid, date, date, text[]) from public, anon;
grant execute on function month_installment_totals(uuid, date, date, text[]) to authenticated;
