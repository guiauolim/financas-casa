-- supabase/migrations/0003_cadastros_transacoes.sql
-- Fase 2: saldo inicial das contas, arquivar categorias, updated_at automático,
-- coerência de transações (transferência, parcelas) e checagem de mesma casa.

-- ───────────────────────── Contas ─────────────────────────
-- Saldo inicial: base do saldo em contas e do patrimônio. Pode ser negativo
-- (cheque especial). Cartão não usa (a dívida do cartão vem das transações).
alter table accounts
  add column opening_balance_cents bigint not null default 0,
  add column opening_balance_date date;

-- Contas que não são cartão não guardam dados de fatura.
update accounts set closing_day = null, due_day = null, credit_limit_cents = null
where kind <> 'credit_card';

alter table accounts
  add constraint accounts_card_fields check (
    (kind = 'credit_card' and closing_day is not null and due_day is not null)
    or (kind <> 'credit_card' and closing_day is null and due_day is null and credit_limit_cents is null)
  ) not valid,
  add constraint accounts_credit_limit_positive check (credit_limit_cents is null or credit_limit_cents > 0),
  add constraint accounts_name_length check (char_length(trim(name)) between 1 and 60);

-- ───────────────────────── Categorias ─────────────────────────
alter table categories add column archived boolean not null default false;

-- ───────────────────────── Perfis ─────────────────────────
alter table profiles
  add constraint profiles_phone_e164 check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

-- ───────────────────────── Transações ─────────────────────────
alter table transactions add column updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

alter table transactions
  add constraint transactions_transfer_target check (
    (type = 'transfer' and transfer_account_id is not null and transfer_account_id <> account_id)
    or (type <> 'transfer' and transfer_account_id is null)
  ),
  add constraint transactions_installments check (
    (installment_group_id is null and installment_number is null and installment_total is null)
    or (installment_group_id is not null and installment_total between 1 and 120
        and installment_number between 1 and installment_total)
  ),
  add constraint transactions_description_length check (description is null or char_length(description) <= 200);

create index transactions_installment_group_idx on transactions (installment_group_id, installment_number)
  where installment_group_id is not null;
create index transactions_trash_idx on transactions (household_id, deleted_at desc) where deleted_at is not null;

-- A RLS só confere o household_id da própria linha; conta, conta de destino e
-- categoria referenciadas também precisam ser da mesma casa (vale também para a
-- service role usada pelo bot).
create or replace function check_transaction_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from accounts where id = new.account_id and household_id = new.household_id) then
    raise exception 'account belongs to another household' using errcode = '23503';
  end if;
  if new.transfer_account_id is not null and not exists (
    select 1 from accounts where id = new.transfer_account_id and household_id = new.household_id
  ) then
    raise exception 'transfer account belongs to another household' using errcode = '23503';
  end if;
  if new.category_id is not null and not exists (
    select 1 from categories where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'category belongs to another household' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger transactions_same_household
  before insert or update of household_id, account_id, transfer_account_id, category_id on transactions
  for each row execute function check_transaction_household();
