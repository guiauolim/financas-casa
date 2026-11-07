# Finanças da Casa — contexto do projeto

Sistema de finanças pessoais para um casal (2 usuários, mesma "casa"/household).
**Etapa atual: app web + banco** (lançar, orçar, investir, visualizar), funcionando em produção.
Investimentos: valores vêm do Excel de posição da B3 (importado à mão) ou de cadastro manual —
sem cotação automática (brapi/cron ficaram para depois). Histórico de gastos do cartão vem da
importação de faturas (Itaú); dali para frente, pelo WhatsApp.
**Etapa seguinte: bot do WhatsApp** (linguagem natural, PT-BR) usando a mesma camada de serviços.

> Repositório PÚBLICO. Nunca commitar segredos, dados financeiros reais, números de
> telefone ou dumps do banco. Tudo sensível vai em variáveis de ambiente (Vercel/Supabase).

## Stack
- **Next.js 16 (App Router) + TypeScript (strict)** — hospedado na **Vercel**. Cache Components e
  Partial Prefetching ligados (ver "Next.js 16 — armadilhas")
- **Tailwind + shadcn/ui** para UI; **Recharts** para gráficos
- **Supabase**: Postgres, Auth (magic link por e-mail), RLS obrigatório
- **WhatsApp Cloud API (oficial da Meta)** — webhook em `/api/whatsapp/webhook`
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai`, opcional `@ai-sdk/anthropic`) com *tool calling* para
  interpretar mensagens. Provedor e modelo escolhidos por env (`AI_PROVIDER`, `AI_MODEL`) — começar com OpenAI
- **Vercel Cron** para insights/resumos agendados (a partir da Fase 8)
- **SheetJS** (`xlsx`, tarball oficial do cdn.sheetjs.com — o pacote do npm está parado com CVEs) para ler o Excel da B3
- **Zod** para validar toda entrada externa (webhook, formulários, saídas do LLM)
- Testes: **Vitest** (unit) — priorizar parser/tools do bot e regras de orçamento

## Estrutura de pastas (alvo)
```
src/
  app/
    (auth)/login/            # magic link
    auth/confirm/route.ts    # destino dos links de e-mail (token_hash → verifyOtp)
    auth/signout/route.ts
    onboarding/              # 1º login: cria a casa ou aceita convite; /onboarding/convite
    (app)/dashboard/         # visão geral: "Todos os meses" (padrão, sem ?mes; até o mês atual) ou um mês
    (app)/transacoes/        # mês (faturas + fora do cartão; month-browser no cliente), dados/ (GET do mês),
                             # nova, [id], importar (faturas do cartão com prévia)
    (app)/orcamentos/
    (app)/investimentos/     # lista, novo, [id] (atualizar valor, histórico), importar (B3 com prévia)
    (app)/configuracoes/     # contas, cartões, categorias, regras de categoria, membros/telefones
    api/whatsapp/webhook/route.ts   # GET (verificação) + POST (mensagens)
    api/cron/weekly-insights/route.ts   # Fase 8
  lib/
    supabase/{server,client,admin}.ts   # admin = service role, SÓ server-side
    supabase/proxy.ts        # updateSession() usado por src/proxy.ts
    supabase/database.types.ts           # gerado por `pnpm db:types` — não editar à mão
    auth/{paths,session}.ts  # rotas públicas; getCurrentUser/getCurrentProfile
    validation/*.ts          # schemas Zod dos formulários (form.ts: FormState, valor BR, apelidos)
    categories/icon-names.ts # ícones lucide permitidos nas categorias
    whatsapp/{send,verify-signature,types}.ts
    agent/{index,tools,prompts,model}.ts # orquestração LLM + tools (model.ts escolhe o provedor)
    services/{households,accounts,categories,transactions,budgets,overview,investments,networth,
              card-holders,merchant-rules,card-import,card-invoices,month-transactions}.ts # casos de uso: usados
                                         # pelas Server Actions do site E pelas tools do bot
    services/errors.ts       # ServiceError (mensagem PT-BR para o usuário)
    finance/{money,dates,ledger,billing,balances,installments,phone,summary,budget,insights,portfolio,networth,
             spent-by,categorize,spending-view,month-view,payment-account}.ts # regras puras (testáveis)
    importers/excel.ts       # helpers de planilha (magic bytes, números/datas BR, leitura) — B3 e faturas
    importers/limits.ts      # MAX_UPLOAD_BYTES (sem dependências: usado também no navegador)
    importers/b3-excel.ts    # Excel de posição da B3 -> ativos normalizados (puro, sem I/O)
    importers/card-statement/ # faturas de cartão: types, itau.ts (parser), plan.ts (dedup/parcelas), index.ts
    importers/__fixtures__/  # SÓ dados INVENTADOS: b3-posicao-ficticia.xlsx, itau-fatura-ficticia-*.xlsx/.xls
  proxy.ts                   # Next 16: substitui o middleware.ts
supabase/
  migrations/                # 0001_init … 0005_investimentos, 0006_import_fatura_pessoas, 0007_faturas_pagas,
                             # 0008_fatura_referencia, 0009_exclusao_definitiva, 0010_remove_deleted_at, 0011_conta_pagamento_fatura
  pending/                   # (criar quando preciso) migrations que NÃO podem ir no próximo `db push`;
                             # só depois do deploy: mover para migrations/ e dar push
  seed.sql                   # só dev local (`supabase db reset`); nunca vai para o remoto
  templates/                 # e-mails do Auth (magic link, convite) em PT-BR
scripts/make-{b3,itau}-fixture.mjs  # geram as fixtures fictícias dos importadores
docs/ROADMAP.md
```

## Regras de dinheiro
- Valores SEMPRE em **centavos (bigint)**. Nunca float. Formatar com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Datas de lançamento em `date` no fuso **America/Sao_Paulo**. Timestamps em `timestamptz`.
- Fatura (`lib/finance/billing.ts`): `closing_day` = **melhor dia de compra** (compras a partir dele vão
  para a próxima fatura; a fatura fecha na véspera). Chave = **mês do fechamento** "YYYY-MM" (melhor dia 26:
  26/10–25/11 = "2026-11"). Nome exibido por cartão (`accounts.invoice_naming`: `closing` padrão | `due`) —
  usar sempre `invoiceLabel`/`invoiceNameMonth`/`refForNameMonth`, nunca montar o nome à mão.
- A fatura fica **gravada** no lançamento (`transactions.invoice_ref`): site/bot por `transactionInvoiceRefs`
  no momento do lançamento (parcelas em faturas consecutivas; pagamento = última fatura fechada na data);
  importação = a fatura do ARQUIVO. Faturas abertas, pagamentos (alocados primeiro à fatura gravada, depois
  FIFO), limite e as seções de fatura de Transações leem `invoice_ref` sem recalcular. Editar data/conta recalcula (com aviso).
  Mudar o melhor dia de compra NÃO mexe nas faturas já gravadas. Trigger da 0008 preenche se vier vazio.
- Gasto do mês é sempre **por fatura** (regra do sistema, sem opção na UI): no cartão, conta no mês do
  nome da fatura; o resto, pela data (`invoiceMonthOf` em `lib/finance/spending-view.ts`). As regras
  mensais (`summary.ts`, `budget.ts`) recebem `monthOf`; `purchaseMonthOf` (pela data da compra) fica só
  para uso interno — o limite semanal do cartão é sempre pela data da compra.
- Parcelado: criar N transações filhas com `installment_group_id`, `installment_number`, `installment_total`
  (`planInstallments` em `lib/finance/installments.ts`; resto de centavos na 1ª parcela).
- Pagamento de fatura = **transferência** da conta para o cartão (não é despesa: o gasto já foi contado na compra).
- Conta Conjunta = o "cofre" da casa: salários entram, pix/débito saem e a fatura é paga por ela; o saldo
  vem só dos lançamentos (saldo inicial R$ 0 em 01/10/2026). Cada cartão tem a conta que paga a fatura
  (`accounts.payment_account_id`; vazio = a padrão, `defaultPaymentAccount` em `lib/finance/payment-account.ts`:
  conta corrente conjunta ativa). **Sem pagamento automático**: o pagamento é sempre uma transferência
  lançada — pelo botão "Pagar fatura" de Transações (`payCardInvoice`: valor de R$ 0,01 até o que falta,
  recalculado no servidor; data editável; grava `invoice_ref` da fatura) ou à mão. Receita nova sugere a
  mesma conta.
- Fatura: compra no melhor dia (`closing_day`) ou depois cai na fatura seguinte; dia 31 em mês curto = último dia.

## Tela Transações (o mês manda em tudo)
- Mês escolhido → uma seção por cartão com ciclo ("Fatura <cartão> · <mês> (dd/mm a dd/mm) · vence dd/mm",
  Total/Pago/Falta da fatura inteira, lançamentos dela inclusive parcelas antigas) + fora do cartão
  (pela data) em "Despesas fora do cartão", "Receitas" e "Transferências" (pagamento de fatura; fora dos
  totais). Ordem na tela: resumo (Receitas, Despesas e Saldo do mês), "Receitas", faturas, "Despesas fora
  do cartão", "Transferências". Regra pura em `lib/finance/month-view.ts` (`groupMonth`, `splitOutside`, `monthTotals`); dados em
  `services/month-transactions.ts` (`getTransactionsMonth`, também para o bot).
- Rapidez: nada de ledger inteiro. `listMonthTransactions` (data no mês OU fatura candidata) +
  RPCs `card_invoice_totals` (somas por cartão/fatura → `ledgerFromInvoiceTotals` → `cardInvoices`) e
  `month_installment_totals`, tudo em paralelo. No cliente (`month-browser.tsx`): meses em memória,
  prefetch do anterior/próximo via GET `/transacoes/dados?mes=`, URL por `history.pushState/replaceState`
  (sem render no servidor), filtros Conta/Categoria/Pessoa aplicados no navegador.
- Exclusão é **definitiva** (sem lixeira; a coluna `deleted_at` saiu na 0010): em lote (`deleteTransactions`,
  "só estas / e as próximas parcelas" via `planBatchDelete`) e "Excluir fatura" (`deleteInvoiceTransactions`:
  só os lançamentos do cartão naquela fatura). Confirmação sempre diz "Não dá para desfazer".
  O `undo_last` do bot apaga de vez o último lançamento (`deleteTransaction`).
- Cada fatura com saldo (não futura) tem "Pagar fatura"; paga mostra "Paga em dd/mm" (`invoicePaidOn`:
  último pagamento com a fatura gravada) ou "Paga" (importada como paga, sem pagamento lançado).

## Casa e pessoa ("de quem é o gasto")
- `transactions.spent_by` = membro dono do gasto/receita; **null = Casa** (conjunto). É diferente de
  `created_by` (quem lançou). Transferência nunca tem `spent_by`.
- Regra única em `lib/finance/spent-by.ts` (`defaultSpentBy`): categoria com `household_default`
  (Mercado, Moradia, Contas da casa, Pets por padrão; editável em Configurações → Categorias) → Casa;
  senão a pessoa do contexto (site: quem lança; importação: dono do final; bot: quem mandou a mensagem).
  `createTransaction` aplica a regra quando `spentBy` não vem.
- Filtro "Pessoa" em Transações e o card "Por pessoa" usam `spent_by` (`?pessoa=casa|<user_id>`).
- Cartão com titular + adicionais + virtuais é **uma conta só**: fatura, limite e orçamento semanal são
  do cartão inteiro. `card_holders (account_id, last_digits, user_id)` só diz de quem é cada final.

## Importação de faturas do cartão
- `lib/importers/card-statement`: `CardStatementParser` por banco (hoje `itau.ts`), colunas pelo nome,
  erros em PT-BR com aba/coluna/linha. O arquivo do Itaú não traz o fechamento: vem do `closing_day`.
- Cada linha recebe a fatura do arquivo (`invoice_ref`, pelo vencimento + ciclo do cartão), não o cálculo
  pela data; parcelas futuras geradas, as faturas seguintes. A prévia avisa linhas que o cálculo poria em outra.
- `plan.ts` (puro): compra → despesa; estorno/crédito → receita (abate a fatura); IOF/anuidade/juros/
  multa/encargos → "Impostos e taxas"; pagamento → ignorado (ou transferência de uma conta escolhida).
  Parcela k/n: `occurred_on` = data da compra + (k−1) meses; `installment_group_id` = UUID derivado da
  compra (mesmo grupo em faturas/importações diferentes). Opção de criar as parcelas futuras.
- Deduplicação: `import_hash` (sha256 de casa|conta|final|data|descrição|valor — ou k/n nas parcelas,
  sem o valor — |ordinal de linhas idênticas), único por casa. Reimportar ou enviar faturas
  sobrepostas não duplica; sem lixeira, uma linha excluída volta se a mesma fatura for reimportada (aceito).
- Conferência: soma das linhas (sem o pagamento) × total do arquivo, com a diferença na prévia.
- Fatura já paga (arquivo "Fatura Paga" ou, sem título, já vencida; ajustável na prévia) grava
  `card_statement_imports.paid`: depois do vencimento ela fica quitada (`settledRefs` em
  `balances.ts`, chave = `card_statement_imports.invoice_ref`) e não entra em "faturas em aberto" nem abate o patrimônio — o pagamento real não
  precisa ser lançado. Pagamentos lançados para ela são absorvidos (não viram crédito).
- A entrada da importação fica em Novo lançamento (botão "Importar fatura").
- Classificação (`lib/finance/categorize.ts`): regras aprendidas (`merchant_rules`, "lembrar para
  próximas" na prévia, editáveis em Configurações → Regras) > palavras-chave padrão > apelidos > "Outros".
- Confirmar grava tudo numa transação (RPC `apply_card_import`, security invoker, `source='import'`).
  O cliente só manda decisões; o servidor reprocessa o arquivo (sha256 confere) e refaz o plano.
- Privacidade: igual à B3 (só em memória, sem log, até 4 MB no total). `*.xls`, `*.xlsx`, `*.csv`,
  `*.ofx`, `*.pdf` no `.gitignore`; testes, fixtures, comentários e docs NUNCA usam descrições,
  comércios, nomes ou finais de cartão de arquivos reais — só exemplos inventados.

## Investimentos e patrimônio
- **Patrimônio** = saldo das contas + investimentos ativos − faturas em aberto (faturas pagas fora do
  sistema não contam; ver importação de faturas) (`lib/finance/networth.ts`,
  reaproveita `balances.ts`). Investimento usa sempre o valor **bruto**; o líquido da B3 (`net_value_cents`)
  é só informação no detalhe do ativo e nunca entra em totais.
- Histórico em `investment_snapshots` (um valor por ativo por data). Valor numa data = último snapshot
  até ela; `current_value_cents`/`value_as_of` = snapshot mais recente (lançar valor antigo só completa o histórico).
- Arquivar (`archived_on`) tira o ativo dos totais a partir da data, mas mantém o histórico.
- **Importação da B3**: um arquivo por pessoa (CPF). Ativo B3 é único por casa + dono + `external_id`
  (`CODIGO|INSTITUICAO`); reimportar faz upsert e grava snapshot na data de referência (RPC `apply_b3_import`,
  numa transação). Renda Fixa: CURVA → MTM → FECHAMENTO; Tesouro: Valor bruto → Valor Atualizado.
  Colunas lidas pelo nome; erro de estrutura diz a aba e a coluna.
- O arquivo é processado **só em memória** (sem storage, sem log do conteúdo), até 4 MB (a Vercel corta
  corpo acima de 4,5 MB). A prévia e a confirmação reenviam o arquivo; o sha256 garante que é o mesmo.
- `*.xlsx`/`*.xls` estão no `.gitignore`: nunca commitar planilha real. Testes usam só a fixture fictícia.

## Next.js 16 — armadilhas
- Esta versão difere do que costuma estar nos exemplos: ler o guia em `node_modules/next/dist/docs/`
  antes de usar uma API nova (ver `AGENTS.md`).
- `middleware.ts` virou **`src/proxy.ts`** (função `proxy`). Ele só renova a sessão e barra quem não
  está logado; o guarda de "tem profile?" fica no `UserMenu` do layout `(app)`.
- **Cache Components**: tudo que lê cookies/sessão fica dentro de `<Suspense>` (com skeleton).
- `createClient()` de `lib/supabase/server.ts` chama `await connection()`: o auth-js usa `Date.now()`
  e o App Shell do Partial Prefetching proíbe isso mesmo depois de `cookies()`. Não remover.
- Não usar `"use cache: private"` em leituras de profile/sessão: cachearia "sem profile" logo após o onboarding.

## Supabase — banco e Auth
- Migrations novas em `supabase/migrations/NNNN_nome.sql`; aplicar com `pnpm supabase db push` e
  depois `pnpm db:types`. Nunca editar uma migration já aplicada.
- O banco é aplicado antes do deploy: toda migration em `migrations/` tem que ser compatível com o
  código que está em produção. O que quebra o código antigo (remover coluna etc.) fica em
  `supabase/pending/` e só entra depois do merge e do deploy.
- Usuário sem profile não passa na RLS: criar casa e aceitar convite são RPCs `security definer`
  (`create_household`, `accept_household_invite`) que usam `auth.uid()` e o e-mail do JWT.
  Convites ficam em `household_invites` — nunca confiar em `user_metadata` (o usuário pode alterá-lo).
- Categorias padrão: fonte única em `seed_default_categories()` (migration 0002).
- Templates de e-mail usam `{{ .SiteURL }}/auth/confirm?token_hash=...`; no remoto, configurar o
  mesmo conteúdo em Authentication → Email Templates.

## WhatsApp — regras críticas
1. `GET` do webhook: responder `hub.challenge` se `hub.verify_token === WHATSAPP_VERIFY_TOKEN`.
2. `POST`: validar `X-Hub-Signature-256` (HMAC SHA-256 com `WHATSAPP_APP_SECRET`) usando o corpo **cru**. Rejeitar se inválido.
3. Responder **200 rápido**; processar com `after()` do `next/server` (evita reentrega da Meta e timeout).
4. **Idempotência**: gravar `wa_message_id` em `whatsapp_messages` com unique; ignorar duplicadas.
5. **Allowlist**: só processar números cadastrados em `profiles.phone_e164`. Qualquer outro → ignorar silenciosamente.
6. Fora da janela de 24h após a última mensagem do usuário, só é possível enviar **template aprovado** (usar isso no resumo semanal).

## Camada de serviços (vale desde a Fase 1)
- Toda regra de leitura/escrita fica em `lib/services/*`, recebendo `householdId` e `userId` explícitos.
- Server Actions do site são finas: validam com Zod e chamam o serviço.
- Assim o bot do WhatsApp (fase posterior) reaproveita exatamente a mesma lógica — não duplicar regras.

## Agente do WhatsApp (fase posterior)
- Provedor/modelo via `AI_PROVIDER` (`openai` | `anthropic`) e `AI_MODEL` (modelo pequeno e barato
  para parsing; trocar se precisar). Toda a escolha fica em `lib/agent/model.ts`.
- O LLM **nunca** escreve SQL. Ele só chama tools tipadas (Zod) que executam queries filtradas pelo `household_id` do remetente.
- De quem é o gasto: `add_transaction` sem pessoa explícita → regra única (`defaultSpentBy`: categoria da
  casa → Casa; senão o remetente). "foi da <nome>"/"da casa" definem `spent_by`. Categoria: `categorize()`
  com as regras aprendidas antes do LLM chutar; "Outros" → perguntar. Final de cartão → pessoa via
  `card_holders` (nunca outra conta).
- Tools iniciais: `add_transaction`, `list_transactions`, `get_month_summary`, `get_budget_status`,
  `set_budget`, `update_investment_position`, `get_net_worth`, `undo_last`.
- Ambiguidade (conta/cartão/categoria incertos) → perguntar de volta em vez de chutar.
- Toda escrita responde com confirmação curta: "✅ R$ 52,30 · Mercado · Nubank crédito · hoje. Responda *desfazer* para apagar."
- Contexto curto: últimas ~10 mensagens da conversa em `whatsapp_messages`.

## Segurança (repo público)
- `.env.local` no `.gitignore`; manter `.env.example` sem valores.
- `SUPABASE_SERVICE_ROLE_KEY` só em código server (`lib/supabase/admin.ts`), nunca com prefixo `NEXT_PUBLIC_`.
- RLS ligado em TODAS as tabelas; acesso por `is_household_member(household_id)`.
- O proxy **não** roda em `/api/*`: cada rota de API se autentica sozinha (webhook pela assinatura
  `X-Hub-Signature-256`; crons por `Authorization: Bearer ${CRON_SECRET}`).
- Rotas `/api/cron/*` (a partir da Fase 8) exigem `Authorization: Bearer ${CRON_SECRET}`.
- Não logar conteúdo de mensagens nem valores em logs da Vercel além do necessário.

## Variáveis de ambiente
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=       # URL pública do site (links de e-mail do Auth)
# --- a partir da fase do WhatsApp ---
AI_PROVIDER=openai
AI_MODEL=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=          # opcional, só se AI_PROVIDER=anthropic
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_WEEKLY_TEMPLATE=
# --- a partir da Fase 8 (insights agendados) ---
CRON_SECRET=
```
`BRAPI_TOKEN` não é usado: cotação automática ficou em "Ideias para depois" no ROADMAP.

## Guia visual (seguir em todas as telas)
Referência: telas aprovadas no canvas "Finanças da Casa — telas" (Visão geral, Transações,
Orçamentos, Investimentos, conversa do bot).

**Tokens** — definir como variáveis CSS do tema do shadcn em `globals.css` e usar via Tailwind:
| Token | Valor | Uso |
|---|---|---|
| `background` | `#F4F5F2` | fundo da página |
| `card` | `#FFFFFF` | cards, tabelas, menu lateral |
| `border` | `#E3E6E2` | bordas de card; divisória de linha `#EEF0ED` |
| `foreground` | `#15201B` | texto principal; card de destaque escuro (patrimônio) |
| `muted-foreground` | `#5B6660` | rótulos e texto secundário (contraste ≥ 4.5:1) |
| `primary` | `#0F6E56` | botões principais, entradas (+), barra OK |
| `primary-soft` | `#E3F1EC` / texto `#0B5442` | item ativo do menu, etiqueta "WhatsApp" |
| `warning` | barra `#C9761F` / texto `#9A4F0E` | orçamento entre 80% e 100% |
| `danger` | `#B42318` | orçamento estourado, variação negativa |
| `track` | `#E8EBE7` | fundo das barras de progresso |

**Tipografia**: `Geist` (UI) e `Geist Mono` (todos os valores em R$, %, quantidades) via `next/font/google`.
Título de página 28px/700 com `tracking-tight`; título de card 17px/600; corpo 14px; rótulos 12–13px.

**Layout**
- Menu lateral (220px) + conteúdo; no celular o menu vai para o topo (ou vira menu inferior). Nada de `100vh` fixo no menu.
- Conteúdo com padding `clamp(16px, 3vw, 40px)`; cards com raio 14px (12px nos menores), padding 20–24px, `gap` 16px.
- KPIs em grid `repeat(auto-fit, minmax(230px, 1fr))`; seções de dois cards em flex-wrap 3:2.
- Tabelas largas dentro de um container com `overflow-x-auto`.

**Componentes e regras**
- Barra de progresso de orçamento: verde < 80%, âmbar 80–100%, vermelha > 100% (com texto "estourou" / "R$ X acima do limite" — nunca só a cor).
- Valores: saídas com "−", entradas em verde com "+". Sempre `Intl.NumberFormat('pt-BR')`.
- Etiqueta de origem do lançamento: WhatsApp (verde suave), Site (cinza), Recorrente (âmbar suave), Importado/B3 (azul suave).
- Avatar com a inicial de quem lançou (cada membro da casa com uma cor fixa).
- Card de patrimônio em fundo escuro `#15201B` como único elemento escuro da tela.
- Gráficos (Recharts): barras simples, eixo começando em zero, cores do tema, sem gradiente.
- Ícones: `lucide-react`, traço 2px. Sem emoji na UI.
- Alvos de toque ≥ 44px; botões e links reais (`<button>`, `<a>`), `aria-label` em botões só de ícone.
- Estados vazios e de carregamento (skeleton) em toda lista e card de dados.

## Convenções
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`...). Uma fase do roadmap = um ou mais PRs.
- Regras de negócio em `lib/finance/*` como funções puras com teste.
- UI e mensagens do bot em PT-BR.
- Antes de concluir uma tarefa: `pnpm lint && pnpm typecheck && pnpm test` (o CI roda os mesmos + gitleaks).
- pnpm via Corepack (versão em `packageManager`). Se `corepack enable` falhar por permissão:
  `corepack enable --install-directory ~/.local/bin pnpm`.
