-- supabase/migrations/0011_conta_pagamento_fatura.sql
-- Conta que paga a fatura de cada cartão (usada pelo botão "Pagar fatura" em Transações).
-- Só adiciona: o código anterior ignora a coluna. Não há pagamento automático: o pagamento
-- continua sendo uma transferência lançada (pelo botão ou à mão).

alter table accounts
  add column payment_account_id uuid references accounts(id) on delete set null;

alter table accounts
  add constraint accounts_payment_account_only_card
  check (payment_account_id is null or kind = 'credit_card');

comment on column accounts.payment_account_id is
  'Cartão: conta de onde sai o pagamento da fatura (padrão: a conta corrente conjunta da casa).';

-- Padrão para os cartões existentes: a conta corrente conjunta (sem dono) ativa mais antiga.
update accounts c
   set payment_account_id = (
     select a.id
       from accounts a
      where a.household_id = c.household_id
        and a.kind = 'checking'
        and a.owner_user_id is null
        and not a.archived
      order by a.created_at
      limit 1)
 where c.kind = 'credit_card'
   and c.payment_account_id is null;
