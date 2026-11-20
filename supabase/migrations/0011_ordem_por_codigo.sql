-- =====================================================================
-- 0011 — Produtos em ordem de código como número (1, 2, 10, 100)
-- Só ACRESCENTA uma coluna calculada na visão vw_produtos ("codigo_ordem").
-- Não muda nenhum dado. Pode rodar mais de uma vez.
--   Códigos só com números vêm primeiro, em ordem numérica;
--   códigos com letras/símbolos vêm depois, em ordem alfabética.
-- =====================================================================
create or replace view public.vw_produtos
with (security_invoker = true)
as
select
  p.*,
  round(p.custo * p.estoque, 2)                                     as valor_estoque,
  (p.estoque_minimo > 0 and p.estoque < p.estoque_minimo)           as abaixo_minimo,
  case when p.validade is null then null
       else p.validade - (now() at time zone 'America/Sao_Paulo')::date
  end                                                               as dias_para_vencer,
  case
    when p.validade is null then 'sem_validade'
    when p.validade <  (now() at time zone 'America/Sao_Paulo')::date then 'vencido'
    when p.validade <= (now() at time zone 'America/Sao_Paulo')::date + 7 then 'critico'
    when p.validade <= (now() at time zone 'America/Sao_Paulo')::date + c.dias_alerta_validade then 'proximo'
    else 'ok'
  end                                                               as situacao_validade,
  case when trim(p.codigo) ~ '^[0-9]+$'
       then '0' || lpad(ltrim(trim(p.codigo), '0'), 30, '0')
       else '1' || lower(trim(p.codigo))
  end                                                               as codigo_ordem
from public.produtos p
cross join public.configuracoes c;

grant select on public.vw_produtos to authenticated;
notify pgrst, 'reload schema';

-- Conferência: deve mostrar os 10 primeiros produtos em ordem de código.
select codigo, nome from public.vw_produtos order by codigo_ordem, nome limit 10;
