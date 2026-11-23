-- =====================================================================
-- 0012 — Abertura de caixa enviada pelo computador nunca trava a fila
--
-- Problema visto na loja: o servidor recusou uma abertura com
--   "duplicate key value violates unique constraint
--    caixas_um_aberto_por_usuario_dispositivo"
-- porque já havia OUTRO caixa aberto no servidor para a mesma pessoa no
-- mesmo computador. Sem a abertura, todas as vendas daquele caixa ficaram
-- paradas com "Caixa não encontrado".
--
-- Agora: se já existir um caixa aberto da mesma pessoa no mesmo computador,
-- a abertura nova entra mesmo assim (marcada com o código do computador +
-- um sufixo). Os dois caixas ficam no servidor e o administrador fecha o
-- antigo pela tela "Caixas". Nada é apagado.
--
-- Também troca a mensagem técnica "numeric field overflow" por uma em
-- português quando o valor é absurdo (ex.: código de barras lido no campo).
--
-- Só altera a função sinc_abrir_caixa. Não muda nenhum dado. Pode rodar
-- mais de uma vez.
-- =====================================================================
create or replace function public.sinc_abrir_caixa(p_uuid uuid, p_valor_abertura numeric, p_aberto_em timestamptz, p_dispositivo text)
returns public.caixas
language plpgsql security definer set search_path = public
as $$
declare v public.caixas;
begin
  if not public.tem_acesso() then
    raise exception 'Seu usuário não tem permissão para abrir caixa.';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_uuid::text));
  select * into v from public.caixas where uuid_local = p_uuid;
  if found then return v; end if;   -- já recebido antes: devolve o mesmo
  if p_valor_abertura is null or p_valor_abertura < 0 then
    raise exception 'O valor de abertura não pode ser negativo.';
  end if;
  if p_valor_abertura > 1000000 then
    raise exception 'Valor de abertura muito alto (R$ %). Corrija o valor no computador do caixa.', p_valor_abertura;
  end if;
  begin
    insert into public.caixas (usuario_id, usuario_nome, valor_abertura, aberto_em, uuid_local, dispositivo)
    values (auth.uid(), public.meu_nome(), round(p_valor_abertura, 2), public.sinc_quando(p_aberto_em), p_uuid, p_dispositivo)
    returning * into v;
  exception when unique_violation then
    -- Já existe um caixa aberto desta pessoa neste computador: abre este também,
    -- com o computador marcado de forma única, para as vendas poderem entrar.
    insert into public.caixas (usuario_id, usuario_nome, valor_abertura, aberto_em, uuid_local, dispositivo)
    values (auth.uid(), public.meu_nome(), round(p_valor_abertura, 2), public.sinc_quando(p_aberto_em), p_uuid,
            coalesce(p_dispositivo, '') || '/' || left(p_uuid::text, 8))
    returning * into v;
  end;
  return v;
end;
$$;

grant execute on function public.sinc_abrir_caixa(uuid, numeric, timestamptz, text) to authenticated;
notify pgrst, 'reload schema';

-- Conferência: caixas abertos agora (o antigo que estava travando aparece aqui).
select id, usuario_nome, dispositivo, valor_abertura, aberto_em
from public.caixas where status = 'aberto' order by id;
