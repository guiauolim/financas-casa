-- supabase/migrations/0002_onboarding.sql
-- Onboarding: categorias padrão, criação atômica da casa, convites por e-mail
-- e permissão para renomear a casa.

create extension if not exists citext;

-- ───────────────────────── Casa: renomear ─────────────────────────
create policy household_update on households for update
  using (is_household_member(id)) with check (is_household_member(id));

-- ───────────────────────── Categorias padrão ─────────────────────────
-- Fonte única da lista: usada pelo onboarding (create_household) e pelo seed local.
create or replace function seed_default_categories(hid uuid)
returns void language sql security definer set search_path = public as $$
  insert into categories (household_id, name, type, icon, aliases) values
    (hid, 'Mercado',                'expense',  'shopping-cart',   '{mercado,supermercado,feira,hortifruti,padaria,açougue}'),
    (hid, 'Restaurantes e delivery','expense',  'utensils',        '{restaurante,lanche,almoço,jantar,ifood,rappi,delivery}'),
    (hid, 'Moradia',                'expense',  'house',           '{aluguel,condomínio,iptu,financiamento}'),
    (hid, 'Contas da casa',         'expense',  'plug-zap',        '{luz,energia,água,gás,internet,celular,telefone}'),
    (hid, 'Transporte',             'expense',  'bus',             '{uber,99,ônibus,metrô,táxi,estacionamento,pedágio}'),
    (hid, 'Combustível',            'expense',  'fuel',            '{gasolina,etanol,álcool,diesel,posto}'),
    (hid, 'Saúde',                  'expense',  'heart-pulse',     '{médico,consulta,exame,plano de saúde,dentista,academia}'),
    (hid, 'Farmácia',               'expense',  'pill',            '{farmácia,remédio,drogaria}'),
    (hid, 'Educação',               'expense',  'graduation-cap',  '{escola,faculdade,curso,livro,material escolar}'),
    (hid, 'Lazer',                  'expense',  'party-popper',    '{cinema,show,bar,passeio,jogo}'),
    (hid, 'Assinaturas',            'expense',  'repeat',          '{netflix,spotify,streaming,assinatura,prime}'),
    (hid, 'Vestuário',              'expense',  'shirt',           '{roupa,sapato,tênis,loja}'),
    (hid, 'Pets',                   'expense',  'paw-print',       '{pet,ração,veterinário,petshop}'),
    (hid, 'Presentes',              'expense',  'gift',            '{presente,aniversário,natal}'),
    (hid, 'Viagem',                 'expense',  'plane',           '{viagem,hotel,passagem,airbnb}'),
    (hid, 'Impostos e taxas',       'expense',  'landmark',        '{imposto,taxa,tarifa,ipva,anuidade,juros}'),
    (hid, 'Outros',                 'expense',  'circle-ellipsis', '{outros,diversos}'),
    (hid, 'Salário',                'income',   'briefcase',       '{salário,pagamento,13º,férias}'),
    (hid, 'Freelance',              'income',   'laptop',          '{freela,freelance,bico,serviço}'),
    (hid, 'Rendimentos',            'income',   'trending-up',     '{rendimento,dividendos,juros recebidos,cdb}'),
    (hid, 'Reembolso',              'income',   'undo-2',          '{reembolso,estorno,devolução}'),
    (hid, 'Outras receitas',        'income',   'circle-plus',     '{pix recebido,venda,outras receitas}'),
    (hid, 'Transferência',          'transfer', 'arrow-left-right','{transferência,pix entre contas,ted}')
  on conflict (household_id, name) do nothing;
$$;
-- Só a service role (e as funções abaixo, que rodam como owner) podem chamar.
revoke execute on function seed_default_categories(uuid) from public, anon, authenticated;

-- ───────────────────────── Criar casa (primeiro login) ─────────────────────────
-- RLS não permite que um usuário sem profile crie household/profile; esta função
-- faz as três inserções numa transação, sempre para o próprio auth.uid().
create or replace function create_household(p_household_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hid uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from profiles where user_id = v_uid) then
    raise exception 'profile already exists' using errcode = '23505';
  end if;
  if char_length(trim(coalesce(p_household_name, ''))) not between 1 and 80
     or char_length(trim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'invalid name' using errcode = '22023';
  end if;

  insert into households (name) values (trim(p_household_name)) returning id into v_hid;
  insert into profiles (user_id, household_id, display_name) values (v_uid, v_hid, trim(p_display_name));
  perform seed_default_categories(v_hid);
  return v_hid;
end $$;
revoke execute on function create_household(text, text) from public, anon;
grant execute on function create_household(text, text) to authenticated;

-- ───────────────────────── Convites ─────────────────────────
create table household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  email citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by uuid default auth.uid() references profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (household_id, email)
);
create index on household_invites (email) where accepted_at is null;

alter table household_invites enable row level security;
create policy household_invites_household on household_invites for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Convite pendente para o e-mail do usuário logado (ele ainda não é membro,
-- então não enxerga a casa pela RLS).
create or replace function get_pending_invite()
returns table (invite_id uuid, household_id uuid, household_name text)
language sql stable security definer set search_path = public as $$
  select i.id, h.id, h.name
  from household_invites i
  join households h on h.id = i.household_id
  where i.accepted_at is null
    and i.email = (auth.jwt() ->> 'email')::citext
  order by i.created_at desc
  limit 1;
$$;
revoke execute on function get_pending_invite() from public, anon;
grant execute on function get_pending_invite() to authenticated;

create or replace function accept_household_invite(p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email citext := (auth.jwt() ->> 'email')::citext;
  v_invite household_invites%rowtype;
begin
  if v_uid is null or v_email is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from profiles where user_id = v_uid) then
    raise exception 'profile already exists' using errcode = '23505';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'invalid name' using errcode = '22023';
  end if;

  select * into v_invite from household_invites
  where email = v_email and accepted_at is null
  order by created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'no pending invite' using errcode = 'P0002';
  end if;

  insert into profiles (user_id, household_id, display_name)
  values (v_uid, v_invite.household_id, trim(p_display_name));
  update household_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.household_id;
end $$;
revoke execute on function accept_household_invite(text) from public, anon;
grant execute on function accept_household_invite(text) to authenticated;
