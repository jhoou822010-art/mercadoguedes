-- =====================================================================
-- Loja Fácil — Migração 0003 (atalhos de teclado do caixa)
-- Rode DEPOIS da 0001 e da 0002, uma única vez, no SQL Editor do Supabase.
-- Só acrescenta uma coluna; não apaga nada.
-- =====================================================================

alter table public.configuracoes
  add column if not exists atalhos jsonb not null default '{}'::jsonb;

comment on column public.configuracoes.atalhos is
  'Teclas de atalho do caixa definidas pelo administrador. Ex.: {"pagamento": "F2", "calculadora": "F7"}. '
  'Ação ausente usa a tecla padrão do sistema; valor vazio ("") desliga o atalho.';
