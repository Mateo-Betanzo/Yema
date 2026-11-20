-- Spec 003, cambio del RF-34 (2026-11-18) · T16: the only way to delete (archive) a product, a type or
-- a format (RF-44 to RF-49, RF-52). Security definer, as load_stock and adjust_stock: they write
-- archived_at, which no API role can (T15), after checking that the caller is the admin. Each one locks
-- the row it archives, so two calls at the same time run one after the other; archiving what is already
-- archived changes nothing. Errors as the other RPC: P0001 with the reason in the message and the details
-- in the hint, P0002 when the row does not exist.

-- RF-45, RF-47: a product, active or inactive, unless an order in course has it. It also locks its type,
-- as orders and counter sales lock the types of their products (check_items_available): an order and the
-- archive of one of its products go one after the other, and only one of them gets in.
create function public.archive_product(p_product_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
  v_egg_type_id bigint;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select archived_at, egg_type_id into v_archived_at, v_egg_type_id
  from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if v_archived_at is not null then
    return;
  end if;

  perform 1 from public.egg_types where id = v_egg_type_id for update;

  if exists (
    select 1
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where i.product_id = p_product_id and o.status in ('pending', 'accepted', 'on_the_way')
  ) then
    raise exception 'product_in_active_order' using errcode = 'P0001';
  end if;

  update public.products set archived_at = now() where id = p_product_id;
end;
$$;

-- RF-45, RF-46, RF-48: a type, once its products are archived and its stock is 0. The hint names the
-- products left ("Maple Super, Pack Super") or the eggs left ("30").
create function public.archive_egg_type(p_egg_type_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
  v_stock integer;
  v_products text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select archived_at, stock into v_archived_at, v_stock
  from public.egg_types where id = p_egg_type_id for update;
  if not found then
    raise exception 'type_not_found' using errcode = 'P0002';
  end if;
  if v_archived_at is not null then
    return;
  end if;

  select string_agg(name, ', ' order by name) into v_products
  from public.products where egg_type_id = p_egg_type_id and archived_at is null;
  if v_products is not null then
    raise exception 'has_products' using errcode = 'P0001', hint = v_products;
  end if;

  if v_stock > 0 then
    raise exception 'stock_left' using errcode = 'P0001', hint = v_stock::text;
  end if;

  update public.egg_types set archived_at = now() where id = p_egg_type_id;
end;
$$;

-- RF-45, RF-46, RF-49: a format, never the load format, once its products are archived (named in the hint).
create function public.archive_format(p_format_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
  v_is_load_format boolean;
  v_products text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select archived_at, is_load_format into v_archived_at, v_is_load_format
  from public.formats where id = p_format_id for update;
  if not found then
    raise exception 'format_not_found' using errcode = 'P0002';
  end if;
  if v_archived_at is not null then
    return;
  end if;

  if v_is_load_format then
    raise exception 'load_format' using errcode = 'P0001';
  end if;

  select string_agg(name, ', ' order by name) into v_products
  from public.products where format_id = p_format_id and archived_at is null;
  if v_products is not null then
    raise exception 'has_products' using errcode = 'P0001', hint = v_products;
  end if;

  update public.formats set archived_at = now() where id = p_format_id;
end;
$$;

revoke execute on function public.archive_product(bigint) from public, anon;
revoke execute on function public.archive_egg_type(bigint) from public, anon;
revoke execute on function public.archive_format(bigint) from public, anon;
grant execute on function public.archive_product(bigint) to authenticated;
grant execute on function public.archive_egg_type(bigint) to authenticated;
grant execute on function public.archive_format(bigint) to authenticated;
