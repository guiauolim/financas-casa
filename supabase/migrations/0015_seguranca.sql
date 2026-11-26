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
