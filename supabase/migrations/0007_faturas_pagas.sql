-- supabase/migrations/0007_faturas_pagas.sql
-- Faturas importadas que já foram pagas fora do sistema (arquivo "Fatura Paga"; o pagamento
-- não é lançado na importação). Elas não contam em "faturas em aberto" nem abatem o
-- patrimônio depois do vencimento (lib/finance/balances.ts, settledReferences).

alter table card_statement_imports add column paid boolean not null default false;

-- Importações feitas antes desta coluna: faturas de histórico já vencidas, pagas na vida real.
update card_statement_imports set paid = true where due_date < (now() at time zone 'America/Sao_Paulo')::date;

create index card_statement_imports_paid_idx on card_statement_imports (household_id, account_id)
  where paid;

-- Igual à 0006, agora gravando `paid` de cada fatura (p_statements: [{due_date, total_cents,
-- paid, hashes}]).
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
                                        created_count, duplicate_count, paid)
    values (p_household_id, p_account_id, (st->>'due_date')::date, (st->>'total_cents')::bigint, auth.uid(),
            v_st_created, v_st_total - v_st_created, coalesce((st->>'paid')::boolean, false));
  end loop;

  return jsonb_build_object('created', v_created, 'duplicates', v_duplicates);
end $$;

revoke all on function apply_card_import(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function apply_card_import(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
