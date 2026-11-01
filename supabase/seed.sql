-- supabase/seed.sql
-- Dados de desenvolvimento LOCAL (roda só em `supabase db reset`; nunca vai para o remoto).
-- No remoto, as categorias padrão são criadas pelo onboarding via create_household().
-- A lista de categorias padrão brasileiras vive em seed_default_categories() (migration 0002).

insert into households (id, name)
values ('00000000-0000-0000-0000-00000000d001', 'Casa Demo')
on conflict (id) do nothing;

select seed_default_categories('00000000-0000-0000-0000-00000000d001');
