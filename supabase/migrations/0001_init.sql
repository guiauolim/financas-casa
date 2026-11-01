-- supabase/migrations/0001_init.sql
-- Schema inicial: casa (household), perfis, contas/cartões, categorias,
-- transações, orçamentos, investimentos e log do WhatsApp. Valores em centavos.

create extension if not exists "pgcrypto";

-- ───────────────────────── Casa e perfis ─────────────────────────
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null,
  phone_e164 text unique,              -- ex: +5561999999999 (allowlist do bot)
  created_at timestamptz not null default now()
);

create or replace function is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.household_id = hid and p.user_id = auth.uid());
$$;

-- ───────────────────────── Contas e cartões ─────────────────────────
create type account_kind as enum ('checking', 'savings', 'credit_card', 'cash', 'meal_voucher');

create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_user_id uuid references profiles(user_id) on delete set null, -- null = conjunta
  name text not null,                  -- "Nubank crédito", "Itaú conta"
  kind account_kind not null,
  closing_day smallint check (closing_day between 1 and 31), -- só cartão
  due_day smallint check (due_day between 1 and 31),         -- só cartão
  credit_limit_cents bigint,
  aliases text[] not null default '{}', -- apelidos que o bot reconhece: {nubank, roxinho}
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Categorias ─────────────────────────
create type tx_type as enum ('expense', 'income', 'transfer');

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type tx_type not null default 'expense',
  icon text,
  aliases text[] not null default '{}',
  unique (household_id, name)
);

-- ───────────────────────── Transações ─────────────────────────
create type tx_source as enum ('whatsapp', 'web', 'import');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id),
  transfer_account_id uuid references accounts(id),   -- destino em transferências
  category_id uuid references categories(id),
  type tx_type not null,
  amount_cents bigint not null check (amount_cents > 0),
  description text,
  occurred_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  installment_group_id uuid,
  installment_number smallint,
  installment_total smallint,
  source tx_source not null default 'web',
  created_by uuid references profiles(user_id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz                               -- soft delete (suporta "desfazer")
);
create index on transactions (household_id, occurred_on desc) where deleted_at is null;
create index on transactions (account_id, occurred_on) where deleted_at is null;

-- ───────────────────────── Orçamentos ─────────────────────────
create type budget_period as enum ('monthly', 'weekly');

create table budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  period budget_period not null,
  category_id uuid references categories(id) on delete cascade, -- null = total geral
  account_id uuid references accounts(id) on delete cascade,    -- ex: limite semanal no cartão
  limit_cents bigint not null check (limit_cents > 0),
  created_at timestamptz not null default now()
);
create unique index budgets_unique_scope
  on budgets (household_id, period, coalesce(category_id, '00000000-0000-0000-0000-000000000000'),
              coalesce(account_id, '00000000-0000-0000-0000-000000000000'));

-- ───────────────────────── Investimentos ─────────────────────────
create type asset_class as enum ('stock', 'fii', 'etf', 'fixed_income', 'treasury', 'crypto', 'fund', 'other');

create table investments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_user_id uuid references profiles(user_id) on delete set null,
  name text not null,                 -- "CDB Nubank 120% CDI", "PETR4"
  ticker text,                        -- preenchido → cotação automática (brapi)
  asset_class asset_class not null,
  institution text,
  quantity numeric(20, 8),
  avg_price_cents bigint,
  current_value_cents bigint not null default 0, -- valor manual ou qty * cotação
  last_quote_cents bigint,
  updated_at timestamptz not null default now(),
  aliases text[] not null default '{}'
);

create table investment_snapshots (       -- histórico p/ gráfico de patrimônio
  id bigint generated always as identity primary key,
  investment_id uuid not null references investments(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  value_cents bigint not null,
  taken_on date not null,
  unique (investment_id, taken_on)
);

-- ───────────────────────── WhatsApp ─────────────────────────
create table whatsapp_messages (
  id bigint generated always as identity primary key,
  household_id uuid references households(id) on delete cascade,
  user_id uuid references profiles(user_id) on delete set null,
  wa_message_id text unique,           -- idempotência de entrada
  direction text not null check (direction in ('in', 'out')),
  body text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);
create index on whatsapp_messages (user_id, created_at desc);

-- ───────────────────────── RLS ─────────────────────────
alter table households            enable row level security;
alter table profiles              enable row level security;
alter table accounts              enable row level security;
alter table categories            enable row level security;
alter table transactions          enable row level security;
alter table budgets               enable row level security;
alter table investments           enable row level security;
alter table investment_snapshots  enable row level security;
alter table whatsapp_messages     enable row level security;

create policy household_read on households for select using (is_household_member(id));
create policy profiles_rw on profiles for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','budgets',
                           'investments','investment_snapshots','whatsapp_messages']
  loop
    execute format(
      'create policy %I_household on %I for all using (is_household_member(household_id)) with check (is_household_member(household_id));',
      t, t);
  end loop;
end $$;
-- O webhook do WhatsApp e os crons usam a service role (ignora RLS) e DEVEM
-- filtrar por household_id explicitamente no código.
