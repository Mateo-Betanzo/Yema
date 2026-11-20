-- Spec 003 · T3: the only way to change the stock of a type (RF-18 to RF-21, RF-35).
-- Both functions are security definer: they write egg_types.stock and stock_movements, which no
-- client role can touch (T2), after checking that the caller is the admin. Each one locks the type
-- (select … for update), so two movements at the same time run one after the other and an adjustment
-- can never leave the stock below 0. The table checks validate packs, eggs and the note; an error rolls
-- back the whole call, so a rejected movement changes nothing.

-- RF-18: a load, in packs of the load format as it is at this moment (RF-8). Returns the new stock.
create function public.load_stock(p_egg_type_id bigint, p_packs integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock integer;
  v_eggs integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.egg_types where id = p_egg_type_id for update;
  if not found then
    raise exception 'type_not_found' using errcode = 'P0002';
  end if;

  select f.eggs * p_packs into v_eggs from public.formats f where f.is_load_format;

  insert into public.stock_movements (egg_type_id, kind, eggs, packs, note)
  values (p_egg_type_id, 'load', v_eggs, p_packs, p_note);

  update public.egg_types set stock = stock + v_eggs where id = p_egg_type_id
  returning stock into v_stock;
  return v_stock;
end;
$$;

-- RF-19, RF-20: an adjustment subtracts eggs, with a reason, never below 0. Returns the new stock.
-- When there is not enough, the error "insufficient_stock" carries the current stock in its hint.
create function public.adjust_stock(p_egg_type_id bigint, p_eggs integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select stock into v_stock from public.egg_types where id = p_egg_type_id for update;
  if not found then
    raise exception 'type_not_found' using errcode = 'P0002';
  end if;

  if p_eggs > v_stock then
    raise exception 'insufficient_stock' using errcode = 'P0001', hint = v_stock::text;
  end if;

  insert into public.stock_movements (egg_type_id, kind, eggs, note)
  values (p_egg_type_id, 'adjustment', p_eggs, p_reason);

  update public.egg_types set stock = stock - p_eggs where id = p_egg_type_id
  returning stock into v_stock;
  return v_stock;
end;
$$;

revoke execute on function public.load_stock(bigint, integer, text) from public, anon;
revoke execute on function public.adjust_stock(bigint, integer, text) from public, anon;
grant execute on function public.load_stock(bigint, integer, text) to authenticated;
grant execute on function public.adjust_stock(bigint, integer, text) to authenticated;
