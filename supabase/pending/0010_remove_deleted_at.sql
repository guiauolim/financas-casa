-- supabase/pending/0010_remove_deleted_at.sql (vai para supabase/migrations/ depois do deploy)
-- Fica em supabase/pending/ para o `db push` não aplicar antes da hora. Depois do deploy:
--   mv supabase/pending/0010_remove_deleted_at.sql supabase/migrations/ && pnpm supabase db push && pnpm db:types
-- ⚠️ Aplicar SÓ DEPOIS do merge de feat/transacoes-por-mes e do deploy na Vercel: o código
-- anterior lê e grava deleted_at (lixeira) e quebraria sem a coluna.
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
