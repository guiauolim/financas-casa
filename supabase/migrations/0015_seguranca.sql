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
