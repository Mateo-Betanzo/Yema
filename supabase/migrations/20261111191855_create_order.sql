-- Spec 004 · T4: create_order, the only way to create an order (RF-24 to RF-30, RF-33, RF-37).
-- The app sends only the slot, product ids, quantities and the total the client saw; the base checks
-- everything else and computes prices, total, eggs and the reservation. All or nothing: any error
-- rolls back the whole call, so a rejected order creates and reserves nothing.
--
-- Two confirmations at the same time go one after the other: the slot row is locked (capacity, RF-28,
-- RF-30) and so are the types of the products (stock, RF-26, RF-30), always in id order so two orders
-- never wait for each other. Two confirmations of the same client race on the unique index
-- orders_one_active_per_client (23505), which the app shows as "Ya tenés un pedido en curso" (RF-27).
--
-- Errors, in this order: forbidden (42501), and invalid_items, active_order_exists, slot_unavailable,
-- product_unavailable, not_enough_units and price_changed (P0001). The last three before price_changed
-- name the product in the hint.
create function public.create_order(
  p_delivery_date date,
  p_slot_id bigint,
  p_items jsonb,
  p_expected_total integer
)
returns table (order_id bigint, delivery_date date, starts_at time, ends_at time, total integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client public.profiles;
  v_slot public.delivery_slots;
  v_is_full boolean;
  v_ids bigint[];
  v_quantities integer[];
  v_product text;
  v_total bigint;
  v_order bigint;
begin
  -- RF-33: only a client, and always for itself.
  select * into v_client from public.profiles where id = auth.uid();
  if not found or v_client.role <> 'client' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- RF-29: a non-empty list of { product_id, quantity }, 1 to 5 units, no product twice.
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0
    or exists (
      select 1
      from jsonb_array_elements(p_items) e
      where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'product_id') is distinct from 'number'
        or jsonb_typeof(e -> 'quantity') is distinct from 'number'
        or (e ->> 'product_id') !~ '^-?[0-9]+$'
        or (e ->> 'quantity') !~ '^[1-5]$'
    )
  then
    raise exception 'invalid_items' using errcode = 'P0001';
  end if;

  select array_agg((x.e ->> 'product_id')::bigint order by x.n), array_agg((x.e ->> 'quantity')::integer order by x.n)
  into v_ids, v_quantities
  from jsonb_array_elements(p_items) with ordinality as x (e, n);

  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) as id) then
    raise exception 'invalid_items' using errcode = 'P0001';
  end if;

  -- RF-27: one active order per client.
  if exists (
    select 1 from public.orders o
    where o.client_id = v_client.id and o.status in ('pending', 'accepted', 'on_the_way')
  ) then
    raise exception 'active_order_exists' using errcode = 'P0001';
  end if;

  -- RF-28: the slot must be offered now on that date (delivery_options) and not full. The lock makes
  -- the next confirmation of this slot count this order.
  select * into v_slot from public.delivery_slots s where s.id = p_slot_id for update;
  select o.is_full into v_is_full
  from public.delivery_options_at(now()) o
  where o.slot_id = p_slot_id and o.delivery_date = p_delivery_date;
  if v_is_full is null or v_is_full then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  -- RF-26: every product visible (active, with its type and format active).
  select coalesce(p.name, '') into v_product
  from unnest(v_ids) with ordinality as i (product_id, n)
  left join public.products p on p.id = i.product_id
  left join public.egg_types t on t.id = p.egg_type_id
  left join public.formats f on f.id = p.format_id
  where p.id is null or not (p.active and t.active and f.active)
  order by i.n
  limit 1;
  if found then
    raise exception 'product_unavailable' using errcode = 'P0001', hint = v_product;
  end if;

  -- RF-26, RF-30: lock the types, then the eggs asked of each type must fit in its stock minus what
  -- the active orders already reserve. The products of a type share its stock.
  perform 1
  from public.egg_types t
  where t.id in (select p.egg_type_id from public.products p where p.id = any (v_ids))
  order by t.id
  for update;

  with wanted as (
    select p.egg_type_id, p.name, i.n, i.quantity * f.eggs as eggs
    from unnest(v_ids, v_quantities) with ordinality as i (product_id, quantity, n)
    join public.products p on p.id = i.product_id
    join public.formats f on f.id = p.format_id
  ),
  short_types as (
    select w.egg_type_id
    from wanted w
    join public.egg_types t on t.id = w.egg_type_id
    left join public.egg_type_reservations r on r.egg_type_id = w.egg_type_id
    group by w.egg_type_id, t.stock, r.reserved_eggs
    having sum(w.eggs) > t.stock - coalesce(r.reserved_eggs, 0)
  )
  select w.name into v_product
  from wanted w
  join short_types s on s.egg_type_id = w.egg_type_id
  order by w.n
  limit 1;
  if found then
    raise exception 'not_enough_units' using errcode = 'P0001', hint = v_product;
  end if;

  -- RF-25: the total of the base must be the one the client saw.
  select sum(i.quantity::bigint * p.price) into v_total
  from unnest(v_ids, v_quantities) as i (product_id, quantity)
  join public.products p on p.id = i.product_id;
  if v_total is distinct from p_expected_total then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;

  -- RF-24, RF-37: the order with the slot hours and the address of now, and each line with the
  -- current price and eggs per unit. Creating the lines is what reserves the eggs.
  insert into public.orders
    (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address, address_notes)
  values
    (v_client.id, v_slot.id, p_delivery_date, v_slot.starts_at, v_slot.ends_at, v_total, v_client.address, v_client.address_notes)
  returning id into v_order;

  insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
  select v_order, p.id, i.quantity, p.price, f.eggs
  from unnest(v_ids, v_quantities) as i (product_id, quantity)
  join public.products p on p.id = i.product_id
  join public.formats f on f.id = p.format_id;

  return query select v_order, p_delivery_date, v_slot.starts_at, v_slot.ends_at, v_total::integer;
end;
$$;

revoke execute on function public.create_order(date, bigint, jsonb, integer) from public, anon;
grant execute on function public.create_order(date, bigint, jsonb, integer) to authenticated;
