# Roadmap — Finanças da Casa

Cada fase termina com algo funcionando em produção na Vercel. Os prompts são para
colar no Claude Code com o `CLAUDE.md` já na raiz do repo. Use plan mode (Shift+Tab)
nas fases grandes e revise o plano antes de deixar executar.

---

## Fase 0 — Contas e setup (manual, ~1h)
- [ ] GitHub: criar repo público `financas-casa` (sem nada dentro)
- [ ] Supabase: criar projeto (região São Paulo), guardar URL, anon key e service role
- [ ] Vercel: importar o repo do GitHub
- [ ] Meta for Developers: criar app tipo *Business*, adicionar produto WhatsApp,
      pegar `Phone number ID`, token temporário e App Secret. Adicionar seu número e
      o da sua esposa como destinatários de teste.
- [ ] Anthropic Console: gerar API key
- [ ] brapi.dev: gerar token gratuito

## Fase 1 — Esqueleto + auth + banco
```
Leia o CLAUDE.md. Crie o projeto Next.js (App Router, TS strict, Tailwind, shadcn/ui,
pnpm, ESLint, Vitest) seguindo a estrutura descrita. Configure os clientes Supabase
(server, client, admin) com @supabase/ssr, login por magic link e middleware que
protege o grupo (app). Coloque a migration que está em supabase/migrations/0001_init.sql,
crie um seed (supabase/seed.sql) com categorias padrão brasileiras e uma página de
onboarding que cria o household e o profile no primeiro login, e permite convidar o
segundo membro. Crie .env.example e garanta .gitignore correto. Adicione um workflow
do GitHub Actions rodando lint, typecheck e test, e gitleaks para detectar segredos.
```

## Fase 2 — CRUD web mínimo
```
Implemente as telas de Configurações (contas/cartões com closing_day e due_day, aliases,
categorias, telefone em E.164 de cada membro) e Transações (lista filtrável por mês,
conta e categoria; criar/editar/excluir com soft delete; parcelamento gerando N
transações). Server Actions + Zod. Regras de fatura em lib/finance/billing.ts com testes.
```

## Fase 3 — Webhook do WhatsApp (eco)
```
Implemente /api/whatsapp/webhook seguindo as "regras críticas" do CLAUDE.md:
verificação GET, validação de assinatura HMAC no corpo cru, resposta 200 imediata com
after(), idempotência por wa_message_id, allowlist por profiles.phone_e164. Por enquanto
só responda "recebi: <texto>". Crie lib/whatsapp/send.ts (texto e template). Escreva
testes da verificação de assinatura. Me diga exatamente o que configurar no painel da Meta.
```
Depois: deploy, colar a URL do webhook na Meta, assinar o campo `messages`, testar.

## Fase 4 — Agente: registrar gastos e receitas
```
Implemente lib/agent com a Claude API e tool use. Tools: add_transaction, undo_last,
list_transactions. O system prompt deve receber: data de hoje (America/Sao_Paulo),
nome do remetente, contas e categorias com aliases. Exemplos que precisam funcionar:
"gastei 52,30 no mercado no nubank", "uber 18 ontem", "tv 3000 em 10x no itaú crédito",
"recebi salário 8500", "caiu o pix de 200 do freela". Se a conta/categoria for ambígua,
pergunte. Confirme cada lançamento no formato do CLAUDE.md. Valide inputs das tools
com Zod. Testes com o SDK mockado.
```

## Fase 5 — Consultas e orçamento
```
Adicione as tools get_month_summary, get_budget_status, set_budget e implemente
lib/finance/budget.ts (mensal por categoria/total e semanal por cartão, semana
segunda→domingo). Perguntas que devem funcionar: "quanto gastei esse mês?",
"quanto ainda posso gastar no cartão essa semana?", "quero gastar no máximo 4 mil
por mês", "limite de 600 por semana no nubank", "como tá a fatura do itaú?".
Após cada gasto, se ultrapassar 80% ou 100% de um orçamento, avise na confirmação.
Crie a tela Orçamentos e o Dashboard (gasto x orçamento, por categoria, evolução).
```

## Fase 6 — Investimentos e patrimônio
```
Implemente: tools update_investment_position e get_net_worth ("meu CDB do nubank tá em
15.200", "comprei 10 PETR4 a 38,50", "quanto eu tenho no total?"); importador do Excel
de posição exportado da Área do Investidor da B3 (lib/importers/b3-excel.ts, com
upload na tela Investimentos e preview antes de salvar); cron diário
/api/cron/update-quotes que atualiza ativos com ticker via brapi e grava snapshot.
Patrimônio = saldo das contas + investimentos − faturas em aberto.
```

## Fase 7 — Insights proativos
```
Crie /api/cron/weekly-insights (domingo 20h BRT no vercel.json) protegido por
CRON_SECRET. Gere um resumo por household: gasto da semana vs orçamento, top
categorias, projeção do mês no ritmo atual, alerta de fatura próxima do vencimento.
Envie via template aprovado (WHATSAPP_WEEKLY_TEMPLATE) com variáveis, já que fica
fora da janela de 24h. Me passe o texto do template para eu cadastrar na Meta.
```

## Ideias para depois
- Áudio no WhatsApp (transcrever e passar para o agente)
- Foto de nota fiscal/comprovante → lançamento
- Importar OFX/CSV de extrato bancário
- Recorrências (aluguel, assinaturas) lançadas automaticamente
- Metas (viagem, reserva de emergência) com progresso
- Divisão de gastos entre o casal
- Token permanente da Meta (System User) e número próprio verificado
