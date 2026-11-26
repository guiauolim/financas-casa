-- supabase/migrations/0014_pluggy.sql
-- Fase 4.10: Pluggy (Open Finance, MeuPluggy). Só adiciona: o site no ar ignora as tabelas,
-- as colunas novas e os valores novos ('pluggy') que ele nunca grava.
--
-- pluggy_links: cada origem da Pluggy (conta corrente, cartão ou os investimentos de um item)
-- ligada a um papel no sistema. Várias origens podem somar numa conta só (a Conta Conjunta =
-- correntes + caixinha). external_transactions: a chave de deduplicação da sincronização
-- (como o import_hash), uma linha por transação da Pluggy.

-- ───────────────────────── pluggy_links ─────────────────────────
create table pluggy_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_id text not null,                  -- item do MeuPluggy (um por login de banco)
  source_kind text not null check (source_kind in ('bank_account', 'card', 'investments')),
  external_id text not null,              -- id da conta na Pluggy; em 'investments', o item_id
  label text not null,                    -- nome que a Pluggy mostra ("itau", "gold")
  -- vault: o saldo soma na conta (corrente); reserve: os investimentos ATIVOS somam na conta
  -- (caixinha); card: o cartão; investments: vão para Investimentos; ignore: não sincroniza.
  role text not null default 'ignore' check (role in ('vault', 'reserve', 'card', 'investments', 'ignore')),
  account_id uuid references accounts(id) on delete set null,
  owner_user_id uuid references profiles(user_id) on delete set null, -- de quem é o login
  last_balance_cents bigint,              -- último saldo desta origem (detalhe da Conta Conjunta)
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, source_kind, external_id),
  constraint pluggy_links_role_kind check (
    role = 'ignore'
    or (source_kind = 'bank_account' and role = 'vault')
    or (source_kind = 'card' and role = 'card')
    or (source_kind = 'investments' and role in ('reserve', 'investments'))
  ),
  constraint pluggy_links_account_required check (
    (role in ('vault', 'reserve', 'card')) = (account_id is not null)
  )
);
create index pluggy_links_household_idx on pluggy_links (household_id);

alter table pluggy_links enable row level security;
create policy pluggy_links_household on pluggy_links for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create trigger pluggy_links_set_updated_at
  before update on pluggy_links
  for each row execute function set_updated_at();

-- Conta e dono da mesma casa; cartão só em conta de cartão; corrente/caixinha nunca em cartão.
create or replace function check_pluggy_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kind account_kind;
begin
  if new.account_id is not null then
    select kind into v_kind from accounts where id = new.account_id and household_id = new.household_id;
    if not found then
      raise exception 'pluggy link account belongs to another household' using errcode = '23503';
    end if;
    if (new.role = 'card') <> (v_kind = 'credit_card') then
      raise exception 'pluggy link role does not match the account kind' using errcode = '23514';
    end if;
  end if;
  if new.owner_user_id is not null and not exists (
    select 1 from profiles where user_id = new.owner_user_id and household_id = new.household_id
  ) then
    raise exception 'pluggy link owner belongs to another household' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger pluggy_links_same_household
  before insert or update of household_id, account_id, owner_user_id, role on pluggy_links
  for each row execute function check_pluggy_link();

-- ───────────────────────── external_transactions ─────────────────────────
-- linked: virou (ou foi ligada a) um lançamento; absorbed: movimento dentro do cofre ou lado de
-- uma transferência já contada; ignored: fora do corte/sem uso. transaction_id vira null se o
-- lançamento for excluído — a sincronização não recria o que o usuário apagou.
create table external_transactions (
  id bigint generated always as identity primary key,
  household_id uuid not null references households(id) on delete cascade,
  provider text not null default 'pluggy' check (provider in ('pluggy')),
  external_id text not null,
  link_id uuid references pluggy_links(id) on delete set null,
  transaction_id uuid references transactions(id) on delete set null,
  status text not null check (status in ('linked', 'absorbed', 'ignored')),
  provider_status text check (provider_status in ('PENDING', 'POSTED')),
  bill_id text,                            -- fatura do banco (cartão); null = fatura estimada
  occurred_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, provider, external_id)
);
create index external_transactions_tx_idx on external_transactions (transaction_id) where transaction_id is not null;

alter table external_transactions enable row level security;
create policy external_transactions_household on external_transactions for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create trigger external_transactions_set_updated_at
  before update on external_transactions
  for each row execute function set_updated_at();

-- ───────────────────────── accounts / transactions / investments ─────────────────────────
-- Saldo informado pelo banco (soma das origens ligadas). Null = saldo pelos lançamentos (como hoje).
alter table accounts
  add column external_balance_cents bigint,
  add column external_balance_at timestamptz;

alter type tx_source add value if not exists 'pluggy';

alter table investments drop constraint investments_source_check;
alter table investments
  add constraint investments_source_check check (source in ('manual', 'b3', 'pluggy'));
alter table investments drop constraint investments_manual_no_external;
alter table investments
  add constraint investments_manual_no_external check (source <> 'manual' or external_id is null);
