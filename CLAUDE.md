# Finanças da Casa — contexto do projeto

Sistema de finanças pessoais para um casal (2 usuários, mesma "casa"/household).
Lançamentos e consultas principalmente via **WhatsApp** (linguagem natural, PT-BR),
com um **dashboard web** para visualizar, corrigir e configurar.

> Repositório PÚBLICO. Nunca commitar segredos, dados financeiros reais, números de
> telefone ou dumps do banco. Tudo sensível vai em variáveis de ambiente (Vercel/Supabase).

## Stack
- **Next.js (App Router) + TypeScript (strict)** — hospedado na **Vercel**
- **Tailwind + shadcn/ui** para UI; **Recharts** para gráficos
- **Supabase**: Postgres, Auth (magic link por e-mail), RLS obrigatório
- **WhatsApp Cloud API (oficial da Meta)** — webhook em `/api/whatsapp/webhook`
- **Claude API** (SDK `@anthropic-ai/sdk`) com *tool use* para interpretar mensagens
- **Vercel Cron** para insights/resumos agendados
- **Zod** para validar toda entrada externa (webhook, formulários, saídas do LLM)
- Testes: **Vitest** (unit) — priorizar parser/tools do bot e regras de orçamento

## Estrutura de pastas (alvo)
```
src/
  app/
    (auth)/login/            # magic link
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
    whatsapp/{send,verify-signature,types}.ts
    agent/{index,tools,prompts}.ts      # orquestração Claude + tools
    finance/{budget,summary,insights}.ts # regras de negócio puras (testáveis)
    quotes/brapi.ts
    importers/b3-excel.ts
supabase/migrations/
docs/ROADMAP.md
```

## Regras de dinheiro
- Valores SEMPRE em **centavos (bigint)**. Nunca float. Formatar com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Datas de lançamento em `date` no fuso **America/Sao_Paulo**. Timestamps em `timestamptz`.
- Despesa no cartão de crédito pertence à **fatura** calculada por `closing_day` do cartão;
  relatórios de "gasto do mês" usam a data da compra, relatórios de "fatura" usam o ciclo.
- Parcelado: criar N transações filhas com `installment_group_id`, `installment_number`, `installment_total`.

## WhatsApp — regras críticas
1. `GET` do webhook: responder `hub.challenge` se `hub.verify_token === WHATSAPP_VERIFY_TOKEN`.
2. `POST`: validar `X-Hub-Signature-256` (HMAC SHA-256 com `WHATSAPP_APP_SECRET`) usando o corpo **cru**. Rejeitar se inválido.
3. Responder **200 rápido**; processar com `after()` do `next/server` (evita reentrega da Meta e timeout).
4. **Idempotência**: gravar `wa_message_id` em `whatsapp_messages` com unique; ignorar duplicadas.
5. **Allowlist**: só processar números cadastrados em `profiles.phone_e164`. Qualquer outro → ignorar silenciosamente.
6. Fora da janela de 24h após a última mensagem do usuário, só é possível enviar **template aprovado** (usar isso no resumo semanal).

## Agente (Claude)
- Modelo configurável por `ANTHROPIC_MODEL` (padrão barato para parsing; trocar se precisar).
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
- Rotas `/api/cron/*` exigem `Authorization: Bearer ${CRON_SECRET}`.
- Não logar conteúdo de mensagens nem valores em logs da Vercel além do necessário.

## Variáveis de ambiente
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_WEEKLY_TEMPLATE=
BRAPI_TOKEN=
CRON_SECRET=
```

## Convenções
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`...). Uma fase do roadmap = um ou mais PRs.
- Regras de negócio em `lib/finance/*` como funções puras com teste.
- UI e mensagens do bot em PT-BR.
- Antes de concluir uma tarefa: `pnpm lint && pnpm typecheck && pnpm test`.
