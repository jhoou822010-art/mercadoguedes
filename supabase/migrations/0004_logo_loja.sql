-- =====================================================================
-- Loja Fácil — Migração 0004 (logo da loja)
-- Rode DEPOIS da 0001, 0002 e 0003, uma única vez, no SQL Editor do Supabase.
-- Só acrescenta colunas; não apaga nada.
-- =====================================================================

alter table public.configuracoes
  add column if not exists logo text,
  add column if not exists logo_no_comprovante boolean not null default true;

-- A logo é guardada já reduzida pelo sistema (imagem pequena, no máximo ~300 KB).
alter table public.configuracoes
  drop constraint if exists configuracoes_logo_tamanho;
alter table public.configuracoes
  add constraint configuracoes_logo_tamanho
  check (logo is null or (logo like 'data:image/%' and length(logo) <= 400000));

comment on column public.configuracoes.logo is
  'Logo da loja em formato data URL (imagem reduzida pelo próprio sistema). Aparece no menu e, se marcado, no comprovante.';
