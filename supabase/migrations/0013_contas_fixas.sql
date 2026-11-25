-- supabase/migrations/0013_contas_fixas.sql
-- Contas fixas (aluguel, luz, internet, assinaturas): o que está previsto para todo mês.
-- Nada é lançado sozinho: o botão "Lançar" cria o lançamento já preenchido e liga a ele
-- (transactions.recurring_bill_id). Só adiciona: o site no ar ignora a tabela e a coluna.

create table recurring_bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  category_id uuid not null references categories(id),
  account_id uuid not null references accounts(id),
  amount_cents bigint not null check (amount_cents > 0), -- valor previsto (o lançado pode variar)
  due_day smallint not null check (due_day between 1 and 31), -- dia 31 em mês curto = último dia
  spent_by uuid references profiles(user_id) on delete set null, -- null = Casa
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_bills_household_idx on recurring_bills (household_id) where active;

alter table recurring_bills enable row level security;
create policy recurring_bills_household on recurring_bills for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create trigger recurring_bills_set_updated_at
  before update on recurring_bills
  for each row execute function set_updated_at();

-- Categoria (de despesa), conta e pessoa da mesma casa (vale também para a service role).
create or replace function check_recurring_bill_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from categories where id = new.category_id and household_id = new.household_id and type = 'expense'
  ) then
    raise exception 'recurring bill category must be an expense category of the same household' using errcode = '23503';
  end if;
  if not exists (select 1 from accounts where id = new.account_id and household_id = new.household_id) then
    raise exception 'recurring bill account belongs to another household' using errcode = '23503';
  end if;
  if new.spent_by is not null and not exists (
    select 1 from profiles where user_id = new.spent_by and household_id = new.household_id
  ) then
    raise exception 'spent_by belongs to another household' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger recurring_bills_same_household
  before insert or update of household_id, category_id, account_id, spent_by on recurring_bills
  for each row execute function check_recurring_bill_household();

-- Lançamento ligado à conta fixa (apagar a conta fixa só desliga).
alter table transactions
  add column recurring_bill_id uuid references recurring_bills(id) on delete set null;
create index transactions_recurring_bill_idx on transactions (recurring_bill_id) where recurring_bill_id is not null;

-- Mesma checagem de casa da 0006, agora também para a conta fixa.
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
  if new.spent_by is not null and not exists (
    select 1 from profiles where user_id = new.spent_by and household_id = new.household_id
  ) then
    raise exception 'spent_by belongs to another household' using errcode = '23503';
  end if;
  if new.recurring_bill_id is not null and not exists (
    select 1 from recurring_bills where id = new.recurring_bill_id and household_id = new.household_id
  ) then
    raise exception 'recurring bill belongs to another household' using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger transactions_same_household on transactions;
create trigger transactions_same_household
  before insert or update of household_id, account_id, transfer_account_id, category_id, spent_by, recurring_bill_id
  on transactions
  for each row execute function check_transaction_household();
