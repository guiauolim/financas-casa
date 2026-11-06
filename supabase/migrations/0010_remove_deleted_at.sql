-- supabase/migrations/0010_remove_deleted_at.sql
-- Aplicada DEPOIS do deploy de feat/transacoes-por-mes (PR #7): o código no ar não usa mais
-- deleted_at (exclusão definitiva) nem profiles.spending_view (gasto sempre por fatura).
-- Remove o que sobrou da lixeira e da visão do gasto por usuário.

-- O que o código antigo ainda tiver mandado para a lixeira entre a 0009 e o deploy.
delete from transactions where deleted_at is not null;

-- Índices que dependiam de deleted_at (os equivalentes sem a condição vieram na 0009).
drop index if exists transactions_trash_idx;
drop index if exists transactions_household_id_occurred_on_idx;
drop index if exists transactions_account_id_occurred_on_idx;
drop index if exists transactions_spent_by_idx;
drop index if exists transactions_invoice_idx;

alter table transactions drop column deleted_at;

-- Sem lixeira, import_hash continua único por casa: uma linha excluída volta se a mesma fatura for
-- reimportada (comportamento aceito).
comment on index transactions_import_hash_idx is 'Deduplicação da importação de faturas (só lançamentos existentes).';

-- O gasto do mês é sempre "por fatura": a escolha por usuário (0008) não é mais usada.
alter table profiles drop column if exists spending_view;
