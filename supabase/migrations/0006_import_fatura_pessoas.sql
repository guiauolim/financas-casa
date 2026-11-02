-- supabase/migrations/0006_import_fatura_pessoas.sql
-- "De quem é o gasto" (Casa ou um membro), finais de cartão por pessoa, regras de
-- categoria aprendidas e importação de faturas de cartão (numa transação só).

-- ───────────────────────── De quem é o gasto ─────────────────────────
-- spent_by = membro a quem o gasto/receita pertence; null = Casa (conjunto).
-- Diferente de created_by (quem lançou). Lançamentos existentes ficam como Casa.
alter table transactions
  add column spent_by uuid references profiles(user_id) on delete set null,
  -- Importação de fatura: chave de deduplicação e final do cartão da linha.
  add column import_hash text,
  add column card_last_digits text check (card_last_digits is null or card_last_digits ~ '^[0-9]{4}$');

-- Transferência não é de ninguém.
alter table transactions
  add constraint transactions_spent_by_not_transfer check (type <> 'transfer' or spent_by is null) not valid;

create index transactions_spent_by_idx on transactions (household_id, spent_by, occurred_on)
  where deleted_at is null;
-- Inclui a lixeira: o que foi apagado não volta ao reimportar.
create unique index transactions_import_hash_idx on transactions (household_id, import_hash)
  where import_hash is not null;

-- Categorias "da casa": gasto vai para Casa por padrão (Mercado, Moradia...).
alter table categories add column household_default boolean not null default false;
update categories set household_default = true
 where type = 'expense' and name in ('Mercado', 'Moradia', 'Contas da casa', 'Pets');

-- Mesma checagem de casa da 0003, agora também para spent_by.
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
  return new;
end $$;

drop trigger transactions_same_household on transactions;
create trigger transactions_same_household
  before insert or update of household_id, account_id, transfer_account_id, category_id, spent_by on transactions
  for each row execute function check_transaction_household();

-- Fonte única das categorias padrão (0002), agora com household_default.
create or replace function seed_default_categories(hid uuid)
returns void language sql security definer set search_path = public as $$
  insert into categories (household_id, name, type, icon, aliases, household_default) values
    (hid, 'Mercado',                'expense',  'shopping-cart',   '{mercado,supermercado,feira,hortifruti,padaria,açougue}', true),
    (hid, 'Restaurantes e delivery','expense',  'utensils',        '{restaurante,lanche,almoço,jantar,ifood,rappi,delivery}', false),
    (hid, 'Moradia',                'expense',  'house',           '{aluguel,condomínio,iptu,financiamento}', true),
    (hid, 'Contas da casa',         'expense',  'plug-zap',        '{luz,energia,água,gás,internet,celular,telefone}', true),
    (hid, 'Transporte',             'expense',  'bus',             '{uber,99,ônibus,metrô,táxi,estacionamento,pedágio}', false),
    (hid, 'Combustível',            'expense',  'fuel',            '{gasolina,etanol,álcool,diesel,posto}', false),
    (hid, 'Saúde',                  'expense',  'heart-pulse',     '{médico,consulta,exame,plano de saúde,dentista,academia}', false),
    (hid, 'Farmácia',               'expense',  'pill',            '{farmácia,remédio,drogaria}', false),
    (hid, 'Educação',               'expense',  'graduation-cap',  '{escola,faculdade,curso,livro,material escolar}', false),
    (hid, 'Lazer',                  'expense',  'party-popper',    '{cinema,show,bar,passeio,jogo}', false),
    (hid, 'Assinaturas',            'expense',  'repeat',          '{netflix,spotify,streaming,assinatura,prime}', false),
    (hid, 'Vestuário',              'expense',  'shirt',           '{roupa,sapato,tênis,loja}', false),
    (hid, 'Pets',                   'expense',  'paw-print',       '{pet,ração,veterinário,petshop}', true),
    (hid, 'Presentes',              'expense',  'gift',            '{presente,aniversário,natal}', false),
    (hid, 'Viagem',                 'expense',  'plane',           '{viagem,hotel,passagem,airbnb}', false),
    (hid, 'Impostos e taxas',       'expense',  'landmark',        '{imposto,taxa,tarifa,ipva,anuidade,juros}', false),
    (hid, 'Outros',                 'expense',  'circle-ellipsis', '{outros,diversos}', false),
    (hid, 'Salário',                'income',   'briefcase',       '{salário,pagamento,13º,férias}', false),
    (hid, 'Freelance',              'income',   'laptop',          '{freela,freelance,bico,serviço}', false),
    (hid, 'Rendimentos',            'income',   'trending-up',     '{rendimento,dividendos,juros recebidos,cdb}', false),
    (hid, 'Reembolso',              'income',   'undo-2',          '{reembolso,estorno,devolução}', false),
    (hid, 'Outras receitas',        'income',   'circle-plus',     '{pix recebido,venda,outras receitas}', false),
    (hid, 'Transferência',          'transfer', 'arrow-left-right','{transferência,pix entre contas,ted}', false)
  on conflict (household_id, name) do nothing;
$$;
revoke execute on function seed_default_categories(uuid) from public, anon, authenticated;

-- ───────────────────────── Finais de cartão → pessoa ─────────────────────────
-- Um cartão (conta) tem vários plásticos/virtuais: titular e adicionais. Cada final
-- aponta para o membro dono dos gastos; fatura, limite e orçamento seguem na conta.
create table card_holders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  last_digits text not null check (last_digits ~ '^[0-9]{4}$'),
  user_id uuid not null references profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (account_id, last_digits)
);
create index card_holders_household_idx on card_holders (household_id);

alter table card_holders enable row level security;
create policy card_holders_household on card_holders for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create or replace function check_card_holder_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from accounts where id = new.account_id and household_id = new.household_id and kind = 'credit_card'
  ) then
    raise exception 'account is not a credit card of this household' using errcode = '23503';
  end if;
  if not exists (select 1 from profiles where user_id = new.user_id and household_id = new.household_id) then
    raise exception 'holder belongs to another household' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger card_holders_same_household
  before insert or update on card_holders
  for each row execute function check_card_holder_household();

-- ───────────────────────── Regras de categoria aprendidas ─────────────────────────
-- pattern = trecho normalizado da descrição (minúsculas, sem acento), ver lib/finance/categorize.ts.
create table merchant_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  pattern text not null check (char_length(pattern) between 2 and 80),
  category_id uuid not null references categories(id) on delete cascade,
  created_by uuid references profiles(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, pattern)
);

alter table merchant_rules enable row level security;
create policy merchant_rules_household on merchant_rules for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create trigger merchant_rules_set_updated_at
  before update on merchant_rules
  for each row execute function set_updated_at();

create or replace function check_merchant_rule_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from categories where id = new.category_id and household_id = new.household_id) then
    raise exception 'category belongs to another household' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger merchant_rules_same_household
  before insert or update of household_id, category_id on merchant_rules
  for each row execute function check_merchant_rule_household();

-- ───────────────────────── Registro das importações de fatura ─────────────────────────
-- Só metadados (nunca o conteúdo do arquivo).
create table card_statement_imports (
  id bigint generated always as identity primary key,
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  due_date date not null,
  total_cents bigint,
  imported_by uuid references profiles(user_id) on delete set null,
  imported_at timestamptz not null default now(),
  created_count int not null default 0,
  duplicate_count int not null default 0
);
create index card_statement_imports_account_idx on card_statement_imports (household_id, account_id, due_date desc);

alter table card_statement_imports enable row level security;
create policy card_statement_imports_household on card_statement_imports for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- ───────────────────────── apply_card_import ─────────────────────────
-- Grava uma importação já conferida na prévia, numa transação só. security invoker: a RLS
-- do usuário vale (e os triggers de mesma casa).
-- p_items: [{import_hash, type, amount_cents, description, occurred_on, category_id, spent_by,
--   card_last_digits, installment_group_id, installment_number, installment_total,
--   account_id?, transfer_account_id?}] — account_id ausente = o cartão; pagamento de fatura é
--   transferência de outra conta para o cartão.
-- p_holders: [{last_digits, user_id}]; p_rules: [{pattern, category_id}];
-- p_statements: [{due_date, total_cents, hashes: [..]}] (para contar criados por fatura).
create or replace function apply_card_import(
  p_household_id uuid,
  p_account_id uuid,
  p_items jsonb,
  p_holders jsonb,
  p_rules jsonb,
  p_statements jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  item jsonb;
  st jsonb;
  v_id uuid;
  v_created int := 0;
  v_duplicates int := 0;
  v_created_hashes text[] := '{}';
  v_st_created int;
  v_st_total int;
begin
  if not is_household_member(p_household_id) then
    raise exception 'not a household member' using errcode = '42501';
  end if;
  if not exists (
    select 1 from accounts where id = p_account_id and household_id = p_household_id and kind = 'credit_card'
  ) then
    raise exception 'account is not a credit card of this household' using errcode = '23503';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_holders, '[]'::jsonb)) loop
    insert into card_holders (household_id, account_id, last_digits, user_id)
    values (p_household_id, p_account_id, item->>'last_digits', (item->>'user_id')::uuid)
    on conflict (account_id, last_digits) do update set user_id = excluded.user_id;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) loop
    insert into merchant_rules (household_id, pattern, category_id)
    values (p_household_id, item->>'pattern', (item->>'category_id')::uuid)
    on conflict (household_id, pattern) do update set category_id = excluded.category_id;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into transactions (
      household_id, account_id, transfer_account_id, category_id, type, amount_cents, description,
      occurred_on, installment_group_id, installment_number, installment_total, source, created_by,
      spent_by, import_hash, card_last_digits
    ) values (
      p_household_id,
      coalesce((item->>'account_id')::uuid, p_account_id),
      (item->>'transfer_account_id')::uuid,
      (item->>'category_id')::uuid,
      (item->>'type')::tx_type,
      (item->>'amount_cents')::bigint,
      item->>'description',
      (item->>'occurred_on')::date,
      (item->>'installment_group_id')::uuid,
      (item->>'installment_number')::smallint,
      (item->>'installment_total')::smallint,
      'import',
      auth.uid(),
      (item->>'spent_by')::uuid,
      item->>'import_hash',
      item->>'card_last_digits'
    )
    on conflict (household_id, import_hash) where import_hash is not null do nothing
    returning id into v_id;

    if v_id is null then
      v_duplicates := v_duplicates + 1;
    else
      v_created := v_created + 1;
      v_created_hashes := v_created_hashes || (item->>'import_hash');
    end if;
    v_id := null;
  end loop;

  for st in select * from jsonb_array_elements(coalesce(p_statements, '[]'::jsonb)) loop
    select count(*) filter (where h = any (v_created_hashes)), count(*)
      into v_st_created, v_st_total
      from jsonb_array_elements_text(coalesce(st->'hashes', '[]'::jsonb)) as h;
    insert into card_statement_imports (household_id, account_id, due_date, total_cents, imported_by,
                                        created_count, duplicate_count)
    values (p_household_id, p_account_id, (st->>'due_date')::date, (st->>'total_cents')::bigint, auth.uid(),
            v_st_created, v_st_total - v_st_created);
  end loop;

  return jsonb_build_object('created', v_created, 'duplicates', v_duplicates);
end $$;

revoke all on function apply_card_import(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function apply_card_import(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
