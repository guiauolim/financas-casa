# Finanças da Casa — contexto do projeto

Sistema de finanças pessoais para um casal (2 usuários, mesma "casa"/household).
**Etapa atual: app web + banco** (lançar, orçar, investir, visualizar), funcionando em produção.
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
- **Vercel Cron** para insights/resumos agendados
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
    (app)/dashboard/         # visão geral do mês
    (app)/transacoes/
    (app)/orcamentos/
    (app)/investimentos/
    (app)/configuracoes/     # contas, cartões, categorias, telefones
    api/whatsapp/webhook/route.ts   # GET (verificação) + POST (mensagens)
    api/cron/weekly-insights/route.ts
    api/cron/update-quotes/route.ts
  lib/
    supabase/{server,client,admin}.ts   # admin = service role, SÓ server-side
    supabase/proxy.ts        # updateSession() usado por src/proxy.ts
    supabase/database.types.ts           # gerado por `pnpm db:types` — não editar à mão
    auth/{paths,session}.ts  # rotas públicas; getCurrentUser/getCurrentProfile
    validation/*.ts          # schemas Zod dos formulários (form.ts: FormState, valor BR, apelidos)
    categories/icon-names.ts # ícones lucide permitidos nas categorias
    whatsapp/{send,verify-signature,types}.ts
    agent/{index,tools,prompts,model}.ts # orquestração LLM + tools (model.ts escolhe o provedor)
    services/{households,accounts,categories,transactions,budgets,investments}.ts # casos de uso: usados
                                         # pelas Server Actions do site E pelas tools do bot
    services/errors.ts       # ServiceError (mensagem PT-BR para o usuário)
    finance/{money,dates,billing,installments,phone,summary,budget,insights}.ts # regras puras (testáveis)
    quotes/brapi.ts
    importers/b3-excel.ts
  proxy.ts                   # Next 16: substitui o middleware.ts
supabase/
  migrations/                # 0001_init, 0002_onboarding, 0003_cadastros_transacoes
  seed.sql                   # só dev local (`supabase db reset`); nunca vai para o remoto
  templates/                 # e-mails do Auth (magic link, convite) em PT-BR
docs/ROADMAP.md
```

## Regras de dinheiro
- Valores SEMPRE em **centavos (bigint)**. Nunca float. Formatar com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Datas de lançamento em `date` no fuso **America/Sao_Paulo**. Timestamps em `timestamptz`.
- Despesa no cartão de crédito pertence à **fatura** calculada por `closing_day` do cartão;
  relatórios de "gasto do mês" usam a data da compra, relatórios de "fatura" usam o ciclo.
- Parcelado: criar N transações filhas com `installment_group_id`, `installment_number`, `installment_total`
  (`planInstallments` em `lib/finance/installments.ts`; resto de centavos na 1ª parcela).
- Pagamento de fatura = **transferência** da conta para o cartão (não é despesa: o gasto já foi contado na compra).
- Fatura: compra no dia do `closing_day` ou depois cai na fatura seguinte; dia 31 em mês curto = último dia.

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
- Rotas `/api/cron/*` exigem `Authorization: Bearer ${CRON_SECRET}`.
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
BRAPI_TOKEN=
CRON_SECRET=
```

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
