-- supabase/migrations/0004_orcamentos.sql
-- Fase 3: coerência dos orçamentos (escopo, mesma casa, tipo de categoria/conta)
-- e updated_at automático.

-- Escopos válidos:
--   monthly, sem categoria e sem conta  -> limite mensal total da casa
--   monthly, com categoria              -> limite mensal da categoria
--   weekly,  com conta (cartão)         -> limite semanal do cartão
alter table budgets
  add constraint budgets_scope check (
    (period = 'monthly' and account_id is null)
    or (period = 'weekly' and account_id is not null and category_id is null)
  );

alter table budgets add column updated_at timestamptz not null default now();

create trigger budgets_set_updated_at
  before update on budgets
  for each row execute function set_updated_at();

-- A RLS só confere o household_id da própria linha; categoria e conta
-- referenciadas também precisam ser da mesma casa (vale também para a service role).
create or replace function check_budget_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null and not exists (
    select 1 from categories
    where id = new.category_id and household_id = new.household_id and type = 'expense'
  ) then
    raise exception 'budget category must be an expense category of the same household' using errcode = '23503';
  end if;
  if new.account_id is not null and not exists (
    select 1 from accounts
    where id = new.account_id and household_id = new.household_id and kind = 'credit_card'
  ) then
    raise exception 'budget account must be a credit card of the same household' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger budgets_same_household
  before insert or update of household_id, category_id, account_id on budgets
  for each row execute function check_budget_household();
