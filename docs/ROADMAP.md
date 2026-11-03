# Roadmap — Finanças da Casa

Ordem: **primeiro o app web + banco funcionando na Vercel**, depois o WhatsApp.
Cada fase termina com algo funcionando em produção. Os prompts são para colar no
Claude Code com o `CLAUDE.md` na raiz do repo. Use plan mode (Shift+Tab) e revise o
plano antes de aprovar. Ao fim de cada fase: testar local, commit, push → Vercel faz deploy.

---

# Etapa A — App web + banco

## Fase 0 — Setup (manual)
- [ ] Máquina: Node 24 (`.nvmrc`), Git, pnpm (`corepack enable`), Claude Code
- [ ] GitHub: repo público `financas-casa` com `CLAUDE.md`, `docs/ROADMAP.md`,
      `supabase/migrations/0001_init.sql`
- [ ] Supabase: projeto em São Paulo; guardar URL, anon key e service role
- [ ] Vercel: conta ligada ao GitHub (o import do projeto é no fim da Fase 1)

## Fase 1 — Esqueleto, login, banco e primeiro deploy ✅ concluída
```
Leia o CLAUDE.md. Crie o projeto Next.js (App Router, TS strict, Tailwind, shadcn/ui,
pnpm, ESLint, Vitest) seguindo a estrutura e o Guia visual. Configure os clientes
Supabase (server, client, admin) com @supabase/ssr, login por magic link e middleware
que protege o grupo (app). Configure a Supabase CLI (supabase init, link) para aplicar
a migration supabase/migrations/0001_init.sql e crie supabase/seed.sql com categorias
padrão brasileiras. Crie o layout com o menu lateral do Guia visual (páginas vazias com
estado vazio) e um onboarding que, no primeiro login, cria o household e o profile e
permite convidar o segundo membro por e-mail. Crie .env.example e confira o .gitignore.
GitHub Actions: lint, typecheck, test e gitleaks. Me diga os passos para aplicar a
migration no Supabase remoto e para configurar o projeto na Vercel.
```
Depois: importar o repo na Vercel, colar as variáveis, deploy, e adicionar a URL da
Vercel em Supabase → Authentication → URL Configuration (Site URL + Redirect URLs).
✅ Pronto quando: você e sua esposa conseguem logar no site publicado e veem a mesma casa.

**Entregue** (branch `feat/fase-1-esqueleto`):
- Next.js 16 com `src/proxy.ts` no lugar do middleware (libera `/api/*`; cada rota de API se autentica sozinha)
- Migration `0002_onboarding.sql`: categorias padrão, `create_household`, convites (`household_invites`),
  `accept_household_invite`, policy de UPDATE em `households`, extensão `citext`
- Login por magic link com `/auth/confirm` (token_hash), onboarding com convite por e-mail
- Layout com menu lateral, páginas vazias com estado vazio e skeleton
- CI: lint, typecheck, test e gitleaks; variável nova `NEXT_PUBLIC_SITE_URL`

## Fase 2 — Cadastros e transações ✅ concluída
```
Implemente lib/services (accounts, transactions) e as telas:
Configurações — contas e cartões (closing_day, due_day, limite, dono ou conjunta),
categorias (com ícone lucide) e membros da casa (nome, telefone E.164 para o futuro bot).
Transações — lista filtrável por mês, conta, categoria e pessoa; criar/editar/excluir
(exclusão definitiva desde a Fase 4.7); parcelamento gerando N transações; transferência entre contas.
Server Actions finas + Zod chamando os serviços. Regras de fatura em
lib/finance/billing.ts (em qual fatura cai uma compra) com testes.
```
✅ Pronto quando: dá para lançar o mês inteiro pelo site, inclusive compras parceladas.

**Entregue** (branch `feat/fase-2-cadastros`):
- Migration `0003_cadastros_transacoes.sql`: saldo inicial em `accounts`
  (`opening_balance_cents`, `opening_balance_date`), `categories.archived`, `transactions.updated_at`
  com trigger, checks de transferência/parcelas/cartão/E.164 e trigger que exige conta e categoria da mesma casa
- `lib/finance`: `parseBRL`, `dates`, `billing` (fatura pelo `closing_day`; compra no dia do fechamento
  vai para a seguinte; meses curtos limitam ao último dia), `installments` (resto de centavos na 1ª parcela),
  `phone` (E.164), `summary` (transferência fora dos totais)
- `lib/services`: `accounts`, `categories`, `transactions`, membros e convites em `households`
- Configurações (contas e cartões, categorias com ícone, membros com WhatsApp e convites) e Transações
  (filtros, totais, parcelado, transferência/pagamento de fatura, "só esta"/"esta e as próximas", lixeira)
- Login: mensagem para e-mail sem acesso quando o cadastro está fechado

## Fase 3 — Orçamentos e Visão geral ✅ concluída
```
Implemente lib/finance/budget.ts (mensal total e por categoria; semanal por cartão,
semana segunda→domingo; status ok/atenção ≥80%/estourado >100%; projeção do mês no
ritmo atual) com testes. Telas Orçamentos e Visão geral conforme o Guia visual:
KPIs (saldo do mês, gasto x orçamento, limite semanal do cartão, patrimônio),
gastos por categoria, últimos lançamentos, entradas x saídas em 6 meses (Recharts),
faturas abertas e um card de insights simples calculados por regra (sem IA ainda).
```
✅ Pronto quando: a Visão geral mostra seus números reais e os alertas de orçamento.

**Entregue** (branch `feat/fase-3-orcamentos`):
- Migration `0004_orcamentos.sql`: check de escopo (`monthly` sem conta; `weekly` só com cartão e sem
  categoria), trigger que exige categoria de despesa e cartão da mesma casa, `budgets.updated_at`
- `lib/finance`: `budget` (status ok/atenção/estourado, semana segunda→domingo, projeção do mês — sem
  projeção no dia 1, nunca abaixo do já lançado), `balances` (saldo a partir do saldo inicial; faturas
  com pagamentos alocados FIFO, da mais antiga para a mais nova), `insights` (até 3, por regra),
  `summary` (série de 6 meses, gasto por categoria)
- `lib/services`: `budgets` (CRUD + `getBudgetStatus`, base da tool do bot), `overview`, `listLedger`
- Orçamentos (mensal da casa com marcador de projeção, semanal por cartão com barras por dia, grade por
  categoria) e Visão geral (KPIs, gastos por categoria, insights, entradas x saídas com Recharts,
  faturas abertas, últimos lançamentos), com seletor de mês

## Fase 4 — Investimentos e patrimônio ✅ concluída
```
Implemente lib/services/investments e a tela Investimentos: cadastro manual de ativos
(classe, instituição, dono ou conjunto, ticker opcional, quantidade/preço médio opcionais,
valor atual, apelidos), atualização de valor com snapshot datado e arquivamento; importador
do Excel de posição da Área do Investidor da B3 (lib/importers/b3-excel.ts, upload com
preview e confirmação, upsert por casa + dono + identificador do ativo, snapshot na data de
referência, arquivo só em memória). SEM brapi e SEM cron. Patrimônio = saldo das contas +
investimentos − faturas em aberto (lib/finance/networth.ts), com evolução de 12 meses.
```
✅ Pronto quando: seus investimentos estão no sistema e o patrimônio bate com a realidade.

**Entregue** (branch `feat/fase-4-investimentos`):
- Migration `0005_investimentos.sql`: `source` (manual/b3), `external_id` único por casa + dono,
  `value_as_of`, `net_value_cents` (só exibição), `archived_on`, triggers de mesma casa, tabela
  `b3_imports` e RPC `apply_b3_import` (upsert + snapshots + arquivamento numa transação)
- `lib/importers/b3-excel`: abas Ações, BDR, ETF, Fundo de Investimento, Renda Fixa e Tesouro Direto
  lidas pelo nome das colunas; números/datas BR; valor bruto (Renda Fixa: CURVA → MTM → FECHAMENTO;
  Tesouro: Valor bruto); data de referência pelo nome do arquivo ou data de criação; erros em PT-BR.
  Testes com fixture fictícia (`scripts/make-b3-fixture.mjs`)
- `lib/finance`: `portfolio` (valor numa data pelos snapshots, variação, distribuição por classe,
  série de 12 meses, aviso de 35 dias) e `networth` (contas + investimentos − faturas, variação no mês)
- `lib/services`: `investments` (CRUD, `updateInvestmentValue`, prévia/aplicação da B3) e `networth`
  (`getNetWorth`, base da tool do bot)
- Investimentos (KPIs, evolução, distribuição, tabela com fonte Manual/B3 e variação, arquivados),
  detalhe do ativo com histórico, importação em duas etapas; card Patrimônio da Visão geral com
  detalhamento e variação no mês

## Fase 4.5 — Importar faturas do cartão + "de quem é o gasto" ✅ concluída
```
Importe faturas do cartão (Itaú .xls/.xlsx; interface pronta para outros bancos) para trazer o
histórico. Novo conceito spent_by (Casa ou membro), categorias "da casa", finais do cartão →
pessoa (card_holders, mesmo cartão), classificação por comércio com regras aprendidas
(merchant_rules), prévia editável e gravação numa transação (RPC). Sem duplicar ao reimportar.
```
✅ Pronto quando: as faturas dos últimos meses estão no sistema, com categoria e de quem.

**Entregue** (branch `feat/import-fatura-cartao`):
- Migration `0006_import_fatura_pessoas.sql`: `transactions.spent_by` (null = Casa), `import_hash`
  (único por casa, inclui a lixeira), `card_last_digits`; `categories.household_default`; tabelas
  `card_holders`, `merchant_rules`, `card_statement_imports`; RPC `apply_card_import` (security invoker)
- `lib/finance/spent-by` (regra única de "de quem"), `lib/finance/categorize` (normalização do comércio,
  regras aprendidas > palavras-chave > apelidos > Outros), `expensesByPerson`
- `lib/importers/card-statement` (`itau.ts`, `plan.ts`: tipo, data das parcelas, grupo determinístico,
  hash de deduplicação, parcelas futuras, conferência com o total, totais por pessoa); helpers de planilha
  compartilhados com a B3 em `lib/importers/excel.ts`. Fixtures fictícias: `scripts/make-itau-fixture.mjs`
- `/transacoes/importar` (cartão + arquivos → finais → prévia com edição em lote), campo "De quem" no
  lançamento, filtro "Pessoa" por `spent_by`, card "Por pessoa" na Visão geral, "Gasto da casa por padrão"
  nas categorias e Configurações → Regras de categoria

## Fase 4.6 — Fatura gravada no lançamento + visão "Por fatura" ✅ concluída
**Entregue** (branch `fix/fatura-referencia`):
- Migration `0008_fatura_referencia.sql`: `transactions.invoice_ref` ("YYYY-MM" do fechamento),
  `card_statement_imports.invoice_ref`, `accounts.invoice_naming` (fechamento | vencimento),
  `profiles.spending_view`; backfill (importadas pela fatura do arquivo, parcelas em sequência, o resto
  pelo cálculo), trigger de segurança e `apply_card_import` gravando a fatura do arquivo
- `lib/finance/billing` (melhor dia de compra, chave da fatura, nome, parcelas consecutivas, pagamento),
  `lib/finance/spending-view` (`invoiceMonthOf`: no cartão, o mês da fatura, via `monthOf`)
- `lib/services/card-invoices`: `getCardInvoice`, `findCardInvoicesByName` (base de "quanto está a fatura
  de novembro?" no bot)
- Gasto do mês sempre "por fatura" na Visão geral, Orçamentos e Transações (o toggle "Por data da
  compra / Por fatura" foi removido; data da compra só internamente, no limite semanal); filtro "Fatura" em
  Transações; faturas abertas com nome, link e limite disponível; "Melhor dia de compra" no cartão

## Fase 4.7 — Transações por mês, rapidez e exclusão definitiva ✅ concluída
**Entregue** (branch `feat/transacoes-por-mes`):
- Tela Transações: o mês manda em tudo. Uma seção por cartão (fatura do mês com Total/Pago/Falta,
  recolhível) e "Fora do cartão"; resumo (total, cartão, fora, saldo com entradas e saídas); filtros
  Conta/Categoria/Pessoa aplicados na hora e mantidos na URL. Saíram o seletor "Fatura" e "Ver fatura".
- Rapidez: só o mês e os totais das faturas (RPCs `card_invoice_totals`, `month_installment_totals`),
  meses em memória no navegador, prefetch do anterior/próximo, troca de mês sem skeleton e seletor
  rápido de mês/ano
- Exclusão em lote (checkbox, selecionar todos por seção, "só estas / e as próximas parcelas") e
  "Excluir fatura"
- Migration `0009_exclusao_definitiva.sql` (compatível com o código anterior, já aplicada): RPCs novas,
  índices sem `deleted_at` e apaga o que estava na lixeira. Tela Lixeira/restaurar removidas.
- [ ] Depois do merge e do deploy: `supabase/pending/0010_remove_deleted_at.sql` (remove `deleted_at`,
  índices antigos e `profiles.spending_view`) → mover para `migrations/`, `db push`, `db:types`

---

# Etapa B — WhatsApp

## Fase 5 — Contas da Meta e do modelo (manual)
- [ ] Meta for Developers: app com WhatsApp, número de teste, Phone number ID, token,
      App Secret; seu número e o da sua esposa como destinatários
- [ ] OpenAI Platform: API key com créditos (a assinatura do ChatGPT não inclui API)
- [ ] Gerar `WHATSAPP_VERIFY_TOKEN` (`openssl rand -hex 16`)

## Fase 6 — Webhook (eco)
```
Implemente /api/whatsapp/webhook seguindo as "regras críticas" do CLAUDE.md:
verificação GET, assinatura HMAC no corpo cru, 200 imediato com after(), idempotência
por wa_message_id, allowlist por profiles.phone_e164. Por enquanto só responda
"recebi: <texto>". Crie lib/whatsapp/send.ts (texto, botões e template) e testes da
assinatura. Me diga exatamente o que configurar no painel da Meta.
```

## Fase 7 — Agente: lançar e consultar
```
Implemente lib/agent com o Vercel AI SDK (provedor via AI_PROVIDER/AI_MODEL em
lib/agent/model.ts). As tools apenas chamam lib/services — nenhuma regra nova.
Tools: add_transaction, undo_last, list_transactions, get_month_summary,
get_budget_status, set_budget, update_investment_position, get_net_worth.
O system prompt recebe: data de hoje (America/Sao_Paulo), nome do remetente, contas,
cartões e categorias com aliases. Devem funcionar: "gastei 52,30 no mercado no nubank",
"uber 18 ontem", "tv 3000 em 10x no itaú", "recebi salário 8500", "quanto ainda posso
gastar no cartão essa semana?", "quanto eu tenho no total?". Ambíguo → perguntar
(com botões quando fizer sentido). Confirmar cada escrita e avisar orçamento ≥80%/>100%.
De quem é o gasto (spent_by): use a regra única de lib/finance/spent-by (categoria "da casa" →
Casa; senão quem mandou a mensagem) — é o que createTransaction faz quando spentBy não vem.
"foi da <nome>", "da casa", "meu" mudam spent_by. Categoria: rodar categorize() com as regras
aprendidas (merchant_rules) antes de o LLM chutar; se cair em "Outros", perguntar.
Cartão com adicionais é UMA conta: o final informado ("no final 1234") só define a pessoa via
card_holders, nunca outra conta. Testes com o modelo mockado.
```

## Fase 8 — Insights proativos
```
Crie /api/cron/weekly-insights (domingo 20h BRT no vercel.json, protegido por
CRON_SECRET): gasto da semana vs orçamento, top categorias, projeção do mês, fatura
perto do vencimento. Envie por template aprovado (WHATSAPP_WEEKLY_TEMPLATE), já que fica
fora da janela de 24h. Me passe o texto do template para cadastrar na Meta.
```

---

## Ideias para depois
- Cotação automática: cron diário (Vercel Cron + `CRON_SECRET`) atualizando ativos com ticker via brapi
  (`BRAPI_TOKEN`) e gravando `investment_snapshots`
- Áudio no WhatsApp (transcrever e mandar para o agente)
- Foto de nota fiscal/comprovante → lançamento
- Importar OFX/CSV de extrato bancário e faturas de outros bancos (novo `CardStatementParser`)
- Recorrências (aluguel, assinaturas) lançadas automaticamente
- Metas (viagem, reserva de emergência) com progresso
- Divisão de gastos entre o casal
- Token permanente da Meta (System User) e número próprio verificado
