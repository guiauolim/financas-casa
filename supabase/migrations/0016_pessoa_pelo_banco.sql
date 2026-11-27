-- supabase/migrations/0016_pessoa_pelo_banco.sql
-- "De quem é" dos lançamentos vindos da Pluggy: o dono do login do banco (Configurações → Bancos,
-- "De quem é este login"); no cartão, o dono do final (card_holders) quando cadastrado. Vale para
-- todas as categorias. A sincronização já grava assim os novos; esta migration corrige os que já
-- entraram (pela regra antiga, Mercado/Moradia/Contas da casa/Pets iam para Casa).
-- Só dados; compatível com o site no ar. Transferências não têm pessoa.
update transactions t
set spent_by = coalesce(ch.user_id, l.owner_user_id)
from external_transactions e
join pluggy_links l on l.id = e.link_id and l.household_id = e.household_id
left join transactions tx on tx.id = e.transaction_id
left join card_holders ch
  on ch.account_id = tx.account_id and ch.last_digits = tx.card_last_digits and ch.household_id = e.household_id
where e.transaction_id = t.id
  and e.household_id = t.household_id
  and t.source = 'pluggy'
  and t.type <> 'transfer'
  and t.spent_by is distinct from coalesce(ch.user_id, l.owner_user_id);
