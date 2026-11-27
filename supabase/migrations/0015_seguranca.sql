-- supabase/migrations/0015_seguranca.sql
-- Correções da auditoria de segurança de 26/11/2026. Compatível com o site no ar.

-- ───────────────────────── B1: profiles ─────────────────────────
-- Antes (0001): profiles_rw "for all" para qualquer membro da casa — um membro podia editar ou
-- apagar o perfil do outro (inclusive o telefone, que será a allowlist do bot do WhatsApp).
-- Agora: todos da casa leem; cada um atualiza só a própria linha e só nome/telefone; ninguém
-- insere nem apaga direto (entrada na casa só pelas RPCs create_household/accept_household_invite).
-- O site no ar só atualiza display_name/phone_e164 (Configurações → Membros); editar o outro
-- membro passa a responder "Membro não encontrado" em vez de alterar.
drop policy if exists profiles_rw on profiles;

create policy profiles_select on profiles for select
  using (is_household_member(household_id));

create policy profiles_update_own on profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_household_member(household_id));

-- Mesmo com a policy, só estas colunas podem mudar pela API (casa e usuário nunca).
revoke insert, update, delete on profiles from anon, authenticated;
grant update (display_name, phone_e164) on profiles to authenticated;

-- ───────────────────────── B3: external_transactions ─────────────────────────
-- A ligação da Pluggy (link_id) e o lançamento (transaction_id) têm que ser da mesma casa da
-- linha, como nas outras tabelas (antes só havia a FK: dava para apontar para id de outra casa).
create or replace function check_external_transaction_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.link_id is not null and not exists (
    select 1 from pluggy_links where id = new.link_id and household_id = new.household_id
  ) then
    raise exception 'external transaction link belongs to another household' using errcode = '23503';
  end if;
  if new.transaction_id is not null and not exists (
    select 1 from transactions where id = new.transaction_id and household_id = new.household_id
  ) then
    raise exception 'external transaction points to a transaction of another household' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger external_transactions_same_household
  before insert or update of household_id, link_id, transaction_id on external_transactions
  for each row execute function check_external_transaction_household();

-- ───────────────────────── M2: convites ─────────────────────────
-- Convite vale 7 dias (reenviar renova) e cada casa manda no máximo 5 convites por dia (cada envio
-- dispara um e-mail do Supabase Auth). O site no ar continua funcionando: ele não preenche
-- expires_at (vale o padrão) e não usa household_invite_sends.
alter table household_invites
  add column expires_at timestamptz not null default (now() + interval '7 days');
-- Os pendentes de hoje ganham 7 dias a partir de agora.
update household_invites set expires_at = now() + interval '7 days' where accepted_at is null;

create or replace function get_pending_invite()
returns table (invite_id uuid, household_id uuid, household_name text)
language sql stable security definer set search_path = public as $$
  select i.id, h.id, h.name
  from household_invites i
  join households h on h.id = i.household_id
  where i.accepted_at is null
    and i.expires_at > now()
    and i.email = (auth.jwt() ->> 'email')::citext
  order by i.created_at desc
  limit 1;
$$;

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
  where email = v_email and accepted_at is null and expires_at > now()
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

-- Um registro por e-mail de convite enviado: o limite vale até para quem chamar a API direto.
create table household_invite_sends (
  id bigint generated always as identity primary key,
  household_id uuid not null references households(id) on delete cascade,
  sent_by uuid default auth.uid() references profiles(user_id) on delete set null,
  sent_at timestamptz not null default now()
);
create index household_invite_sends_recent_idx on household_invite_sends (household_id, sent_at desc);

alter table household_invite_sends enable row level security;
create policy household_invite_sends_household on household_invite_sends for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
-- Só inserir e ler: o histórico não se apaga nem se edita pela API.
revoke update, delete on household_invite_sends from anon, authenticated;

create or replace function check_invite_send_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.sent_at := now(); -- não dá para "voltar no tempo" e furar o limite
  -- Envios simultâneos da mesma casa contam um de cada vez.
  perform pg_advisory_xact_lock(hashtext('invite_sends:' || new.household_id::text));
  if (
    select count(*) from household_invite_sends
    where household_id = new.household_id and sent_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'invite limit reached' using errcode = 'P0429';
  end if;
  return new;
end $$;

create trigger household_invite_sends_limit
  before insert on household_invite_sends
  for each row execute function check_invite_send_limit();
