-- supabase/migrations/0008_fatura_referencia.sql
-- Fatura gravada no lançamento, nome da fatura por cartão e visão do gasto por usuário.
--
-- Convenção (espelho de src/lib/finance/billing.ts — a fonte é o TypeScript; estas funções só
-- servem para o backfill abaixo e para o trigger de segurança):
-- - accounts.closing_day = melhor dia de compra: compras a partir dele vão para a próxima fatura;
--   a fatura fecha na véspera. Dia 31 em mês curto = último dia do mês.
-- - Chave da fatura = mês do FECHAMENTO, 'YYYY-MM' (melhor dia 26: 26/10–25/11 → '2026-11').
-- - Parcelas: faturas consecutivas a partir da fatura da compra.
-- - Pagamento de fatura (transferência para o cartão): paga a última fatura já fechada na data.

-- ───────────────────────── Funções de fatura (espelho do billing.ts) ─────────────────────────

-- Melhor dia de compra no mês de p_month (limitado ao fim do mês).
create or replace function card_best_day(p_month date, p_day int)
returns date language sql immutable set search_path = public as $$
  select (date_trunc('month', p_month)::date
          + (least(p_day, extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::int) - 1));
$$;

create or replace function invoice_ref_add(p_ref text, p_months int)
returns text language sql immutable set search_path = public as $$
  select to_char(to_date(p_ref || '-01', 'YYYY-MM-DD') + make_interval(months => p_months), 'YYYY-MM');
$$;

-- Fatura (mês do fechamento) cujo melhor dia de compra cai no mês de p_boundary_month.
create or replace function invoice_ref_of_boundary(p_boundary_month date, p_closing_day int)
returns text language sql immutable set search_path = public as $$
  select to_char(card_best_day(p_boundary_month, p_closing_day) - 1, 'YYYY-MM');
$$;

-- Fatura em que cai uma compra na data p_date.
create or replace function card_invoice_ref(p_date date, p_closing_day int)
returns text language sql immutable set search_path = public as $$
  select invoice_ref_of_boundary(
    case when p_date < card_best_day(p_date, p_closing_day) then p_date
         else (date_trunc('month', p_date) + interval '1 month')::date end,
    p_closing_day);
$$;

-- Fatura que vence no mês de p_due_date (arquivo do banco só traz o vencimento).
create or replace function card_invoice_ref_by_due(p_due_date date, p_closing_day int, p_due_day int)
returns text language sql immutable set search_path = public as $$
  select invoice_ref_of_boundary(
    case when p_due_day > p_closing_day then p_due_date
         else (date_trunc('month', p_due_date) - interval '1 month')::date end,
    p_closing_day);
$$;

-- ───────────────────────── Colunas ─────────────────────────

-- Nome exibido da fatura: pelo mês do fechamento (padrão) ou do vencimento.
alter table accounts
  add column invoice_naming text not null default 'closing' check (invoice_naming in ('closing', 'due'));

-- Fatura do lançamento: no cartão, a fatura da compra/estorno; no pagamento (transferência para o
-- cartão), a fatura paga. null = não é do cartão.
alter table transactions
  add column invoice_ref text check (invoice_ref is null or invoice_ref ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
create index transactions_invoice_idx on transactions (household_id, account_id, invoice_ref)
  where deleted_at is null and invoice_ref is not null;

-- Fatura do arquivo importado (mês do fechamento).
alter table card_statement_imports
  add column invoice_ref text check (invoice_ref is null or invoice_ref ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- Visão do gasto lembrada por usuário: por data da compra (padrão) ou por fatura.
alter table profiles
  add column spending_view text not null default 'purchase' check (spending_view in ('purchase', 'invoice'));

-- ───────────────────────── Backfill ─────────────────────────

-- Importações: a fatura de cada arquivo pelo vencimento (sem ciclo cadastrado: mês anterior ao vencimento).
update card_statement_imports s
   set invoice_ref = case
         when a.closing_day is not null and a.due_day is not null
           then card_invoice_ref_by_due(s.due_date, a.closing_day, a.due_day)
         else to_char(s.due_date - interval '1 month', 'YYYY-MM')
       end
  from accounts a
 where a.id = s.account_id;
alter table card_statement_imports alter column invoice_ref set not null;

-- Lançamentos no cartão (inclusive os da lixeira, que podem ser restaurados).
-- 1) Base de cada linha: se veio de uma importação com UMA fatura só (as linhas de uma importação
--    têm created_at = imported_at, pois são gravadas na mesma transação do apply_card_import), a
--    fatura do arquivo; senão, o cálculo pela data (parcela: pela data da compra + k−1 faturas).
-- 2) Parcelas: a "âncora" do grupo é a parcela gravada primeiro (menor k da primeira gravação: a
--    linha do arquivo, nunca uma parcela futura gerada); as demais seguem em faturas consecutivas.
with single_import as (
  select account_id, imported_at, min(invoice_ref) as invoice_ref
    from card_statement_imports
   group by account_id, imported_at
  having count(distinct invoice_ref) = 1
),
card_rows as (
  select t.id, t.installment_group_id, t.installment_number, t.created_at,
         coalesce(
           si.invoice_ref,
           case when t.installment_number is null then card_invoice_ref(t.occurred_on, a.closing_day)
                else invoice_ref_add(
                       card_invoice_ref((t.occurred_on - make_interval(months => t.installment_number - 1))::date, a.closing_day),
                       t.installment_number - 1)
           end
         ) as base_ref
    from transactions t
    join accounts a on a.id = t.account_id and a.kind = 'credit_card' and a.closing_day is not null
    left join single_import si
      on t.source = 'import' and si.account_id = t.account_id and si.imported_at = t.created_at
),
anchors as (
  select distinct on (installment_group_id)
         installment_group_id, installment_number as anchor_number, base_ref as anchor_ref
    from card_rows
   where installment_group_id is not null and installment_number is not null
   order by installment_group_id, created_at, installment_number
),
resolved as (
  select r.id,
         case when an.installment_group_id is not null
                then invoice_ref_add(an.anchor_ref, r.installment_number - an.anchor_number)
              else r.base_ref end as invoice_ref
    from card_rows r
    left join anchors an on an.installment_group_id = r.installment_group_id and r.installment_number is not null
)
update transactions t set invoice_ref = resolved.invoice_ref from resolved where resolved.id = t.id;

-- Pagamentos de fatura (transferência de outra conta para o cartão): a última fatura fechada na data.
update transactions t
   set invoice_ref = invoice_ref_add(card_invoice_ref(t.occurred_on, a.closing_day), -1)
  from accounts a
 where t.type = 'transfer' and t.invoice_ref is null
   and a.id = t.transfer_account_id and a.kind = 'credit_card' and a.closing_day is not null;

-- ───────────────────────── Trigger de segurança ─────────────────────────
-- O serviço (lib/services/transactions.ts e a importação) sempre manda invoice_ref. Se algum
-- caminho inserir sem (ex.: versão antiga do site durante o deploy), calcula pela data.
create or replace function fill_transaction_invoice_ref()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_closing int;
begin
  if new.invoice_ref is not null then
    return new;
  end if;
  select closing_day into v_closing from accounts where id = new.account_id and kind = 'credit_card';
  if v_closing is not null then
    new.invoice_ref := card_invoice_ref(new.occurred_on, v_closing);
    return new;
  end if;
  if new.type = 'transfer' and new.transfer_account_id is not null then
    select closing_day into v_closing from accounts where id = new.transfer_account_id and kind = 'credit_card';
    if v_closing is not null then
      new.invoice_ref := invoice_ref_add(card_invoice_ref(new.occurred_on, v_closing), -1);
    end if;
  end if;
  return new;
end $$;

create trigger transactions_fill_invoice_ref
  before insert on transactions
  for each row execute function fill_transaction_invoice_ref();

-- ───────────────────────── apply_card_import ─────────────────────────
-- Igual à 0007, agora gravando a fatura: p_items[].invoice_ref (a fatura do ARQUIVO para cada
-- linha; parcelas futuras nas faturas seguintes) e p_statements[].invoice_ref.
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
      spent_by, import_hash, card_last_digits, invoice_ref
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
      item->>'card_last_digits',
      item->>'invoice_ref'
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
                                        created_count, duplicate_count, paid, invoice_ref)
    values (p_household_id, p_account_id, (st->>'due_date')::date, (st->>'total_cents')::bigint, auth.uid(),
            v_st_created, v_st_total - v_st_created, coalesce((st->>'paid')::boolean, false),
            coalesce(st->>'invoice_ref', (
              select case when a.closing_day is not null and a.due_day is not null
                            then card_invoice_ref_by_due((st->>'due_date')::date, a.closing_day, a.due_day)
                          else to_char((st->>'due_date')::date - interval '1 month', 'YYYY-MM') end
                from accounts a where a.id = p_account_id)));
  end loop;

  return jsonb_build_object('created', v_created, 'duplicates', v_duplicates);
end $$;

revoke all on function apply_card_import(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function apply_card_import(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
