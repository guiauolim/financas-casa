-- supabase/migrations/0005_investimentos.sql
-- Fase 4: investimentos manuais e importados do Excel de posição da B3 (sem cotação
-- automática). Valor atual = valor BRUTO; o líquido (quando a B3 informa) é só exibição.

-- ───────────────────────── investments ─────────────────────────
alter table investments
  add column source text not null default 'manual' check (source in ('manual', 'b3')),
  -- Chave do ativo na B3: "CODIGO|INSTITUICAO" normalizado (ticker, código do título ou ISIN).
  add column external_id text,
  add column value_as_of date,            -- data do valor atual (último snapshot)
  add column net_value_cents bigint,      -- valor líquido informado pela B3 (só exibição)
  add column archived_on date,            -- vendido/resgatado: some dos totais, mantém histórico
  add column created_at timestamptz not null default now();

comment on column investments.ticker is 'Ticker ou código do título (informativo; sem cotação automática)';
comment on column investments.last_quote_cents is 'Sem uso desde a Fase 4 (cotação automática ficou para depois)';

alter table investments
  add constraint investments_b3_identity check (
    source = 'manual' or (external_id is not null and owner_user_id is not null)
  ),
  add constraint investments_manual_no_external check (source = 'b3' or external_id is null);

-- Reimportar não duplica: um ativo B3 por casa + dono + identificador.
alter table investments
  add constraint investments_b3_unique unique (household_id, owner_user_id, external_id);

create index investments_household_idx on investments (household_id);

create trigger investments_set_updated_at
  before update on investments
  for each row execute function set_updated_at();

-- Dono precisa ser membro da mesma casa (vale também para a service role do bot).
create or replace function check_investment_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_user_id is not null and not exists (
    select 1 from profiles where user_id = new.owner_user_id and household_id = new.household_id
  ) then
    raise exception 'investment owner belongs to another household' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger investments_same_household
  before insert or update of household_id, owner_user_id on investments
  for each row execute function check_investment_household();

-- ───────────────────────── investment_snapshots ─────────────────────────
create index investment_snapshots_household_idx on investment_snapshots (household_id, taken_on);

create or replace function check_snapshot_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from investments where id = new.investment_id and household_id = new.household_id
  ) then
    raise exception 'snapshot investment belongs to another household' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger investment_snapshots_same_household
  before insert or update of household_id, investment_id on investment_snapshots
  for each row execute function check_snapshot_household();

-- Ativos cadastrados antes desta fase: 1º snapshot com o valor atual (o histórico e o
-- patrimônio são calculados a partir dos snapshots).
update investments set value_as_of = (updated_at at time zone 'America/Sao_Paulo')::date
 where value_as_of is null;
insert into investment_snapshots (investment_id, household_id, value_cents, taken_on)
select i.id, i.household_id, i.current_value_cents, i.value_as_of
  from investments i
 where not exists (select 1 from investment_snapshots s where s.investment_id = i.id)
on conflict (investment_id, taken_on) do nothing;

-- ───────────────────────── b3_imports ─────────────────────────
-- Registro de cada importação (nunca o conteúdo do arquivo).
create table b3_imports (
  id bigint generated always as identity primary key,
  household_id uuid not null references households(id) on delete cascade,
  owner_user_id uuid not null references profiles(user_id) on delete cascade,
  reference_date date not null,
  imported_by uuid references profiles(user_id) on delete set null,
  imported_at timestamptz not null default now(),
  created_count int not null default 0,
  updated_count int not null default 0,
  archived_count int not null default 0
);
create index b3_imports_owner_idx on b3_imports (household_id, owner_user_id, reference_date desc);

alter table b3_imports enable row level security;
create policy b3_imports_household on b3_imports for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- ───────────────────────── apply_b3_import ─────────────────────────
-- Aplica uma importação já conferida no preview, numa transação só. security invoker:
-- a RLS do usuário vale. p_items: [{external_id, name, ticker, asset_class, institution,
-- quantity, avg_price_cents, value_cents, net_value_cents}].
create or replace function apply_b3_import(
  p_household_id uuid,
  p_owner_user_id uuid,
  p_reference_date date,
  p_items jsonb,
  p_archive_ids uuid[]
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  item jsonb;
  v_id uuid;
  v_inserted boolean;
  v_created int := 0;
  v_updated int := 0;
  v_archived int := 0;
begin
  if not is_household_member(p_household_id) then
    raise exception 'not a household member' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where user_id = p_owner_user_id and household_id = p_household_id) then
    raise exception 'owner belongs to another household' using errcode = '23503';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into investments as i (
      household_id, owner_user_id, source, external_id, name, ticker, asset_class, institution,
      quantity, avg_price_cents, current_value_cents, net_value_cents, value_as_of
    ) values (
      p_household_id, p_owner_user_id, 'b3', item->>'external_id', item->>'name', item->>'ticker',
      (item->>'asset_class')::asset_class, item->>'institution',
      (item->>'quantity')::numeric, (item->>'avg_price_cents')::bigint,
      (item->>'value_cents')::bigint, (item->>'net_value_cents')::bigint, p_reference_date
    )
    on conflict (household_id, owner_user_id, external_id) do update set
      archived_on = null,
      -- Arquivo mais antigo que o valor atual: só grava o snapshot.
      institution = case when i.value_as_of is null or p_reference_date >= i.value_as_of
                         then excluded.institution else i.institution end,
      quantity = case when i.value_as_of is null or p_reference_date >= i.value_as_of
                      then excluded.quantity else i.quantity end,
      avg_price_cents = case when i.value_as_of is null or p_reference_date >= i.value_as_of
                             then excluded.avg_price_cents else i.avg_price_cents end,
      current_value_cents = case when i.value_as_of is null or p_reference_date >= i.value_as_of
                                 then excluded.current_value_cents else i.current_value_cents end,
      net_value_cents = case when i.value_as_of is null or p_reference_date >= i.value_as_of
                             then excluded.net_value_cents else i.net_value_cents end,
      value_as_of = greatest(coalesce(i.value_as_of, p_reference_date), p_reference_date)
    returning i.id, (i.xmax = 0) into v_id, v_inserted;

    if v_inserted then v_created := v_created + 1; else v_updated := v_updated + 1; end if;

    insert into investment_snapshots (investment_id, household_id, value_cents, taken_on)
    values (v_id, p_household_id, (item->>'value_cents')::bigint, p_reference_date)
    on conflict (investment_id, taken_on) do update set value_cents = excluded.value_cents;
  end loop;

  if p_archive_ids is not null and array_length(p_archive_ids, 1) > 0 then
    update investments
       set archived_on = p_reference_date
     where household_id = p_household_id
       and owner_user_id = p_owner_user_id
       and source = 'b3'
       and archived_on is null
       and id = any (p_archive_ids);
    get diagnostics v_archived = row_count;
  end if;

  insert into b3_imports (household_id, owner_user_id, reference_date, imported_by,
                          created_count, updated_count, archived_count)
  values (p_household_id, p_owner_user_id, p_reference_date, auth.uid(), v_created, v_updated, v_archived);

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'archived', v_archived);
end $$;

revoke all on function apply_b3_import(uuid, uuid, date, jsonb, uuid[]) from public, anon;
grant execute on function apply_b3_import(uuid, uuid, date, jsonb, uuid[]) to authenticated;
