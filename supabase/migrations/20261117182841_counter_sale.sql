-- Spec 008 · T1: a counter sale is an order (RF-6, RF-10, RF-11, RF-15, RF-17, RF-18, RF-20). Being a
-- delivered order, it adds by itself to the totals, sales by type and history of spec 007, to what the
-- Shop shows as available and to the stock history. It has no client, slot, day, hours nor address, so
-- the RLS of orders gives it to no client (RF-20) and the slots never count it (RF-18).

-- RF-6, RF-10, RF-18: a counter sale has none of the data of an order of the app, is born delivered and
-- may carry the name of whoever bought (1 to 60 characters; no name is null). An order of the app keeps
-- its client, slot, day, hours and address, and its client is the profile, never a loose name.
alter table public.orders
  add column counter_sale boolean not null default false,
  add column customer_name text check (char_length(customer_name) between 1 and 60),
  alter column client_id drop not null,
  alter column delivery_slot_id drop not null,
  alter column delivery_date drop not null,
  alter column slot_starts_at drop not null,
  alter column slot_ends_at drop not null,
  alter column address drop not null,
  add constraint orders_counter_sale check (
    case
      when counter_sale then
        client_id is null and delivery_slot_id is null and delivery_date is null and slot_starts_at is null
        and slot_ends_at is null and address is null and address_notes is null
        and status = 'delivered' and delivered_at is not null
      else
        client_id is not null and delivery_slot_id is not null and delivery_date is not null
        and slot_starts_at is not null and slot_ends_at is not null and address is not null
        and customer_name is null
    end
  );

comment on column public.orders.counter_sale is 'A sale the admin registered at the counter: no client, slot nor address, born delivered (spec 008).';
comment on column public.orders.customer_name is 'Optional name of whoever bought at the counter (spec 008).';

-- RF-3: a line takes up to 99 units. The 5 per product of the Shop is a rule of the client's order and
-- stays in create_order (spec 004, RF-29).
alter table public.order_items drop constraint order_items_quantity_check;
alter table public.order_items add constraint order_items_quantity_check check (quantity between 1 and 99);

-- RF-11 (and spec 004, RF-26, RF-30): every product visible (active, with its type and format active),
-- and the eggs asked of each type within its stock minus what the active orders reserve. The types are
-- locked in id order first, so two orders or sales of the same types go one after the other and never
-- wait for each other. The first product that fails is named in the hint. Taken from create_order, which
-- now calls it, as create_counter_sale does.
create function public.check_items_available(p_ids bigint[], p_quantities integer[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_product text;
begin
  select coalesce(p.name, '') into v_product
  from unnest(p_ids) with ordinality as i (product_id, n)
  left join public.products p on p.id = i.product_id
  left join public.egg_types t on t.id = p.egg_type_id
  left join public.formats f on f.id = p.format_id
  where p.id is null or not (p.active and t.active and f.active)
  order by i.n
  limit 1;
  if found then
    raise exception 'product_unavailable' using errcode = 'P0001', hint = v_product;
  end if;

  perform 1
  from public.egg_types t
  where t.id in (select p.egg_type_id from public.products p where p.id = any (p_ids))
  order by t.id
  for update;

  with wanted as (
    select p.egg_type_id, p.name, i.n, i.quantity * f.eggs as eggs
    from unnest(p_ids, p_quantities) with ordinality as i (product_id, quantity, n)
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
end;
$$;

-- RF-10 (and spec 005, RF-14): a delivery subtracts the eggs of each type of the order and leaves one
-- "sale" movement per type. The caller has already locked the types and checked there is enough. Taken
-- from set_order_status, which now calls it, as create_counter_sale does.
create function public.subtract_order_eggs(p_order_id bigint)
returns void
language sql
set search_path = ''
as $$
  with eggs_by_type as (
    select p.egg_type_id, sum(i.quantity * i.unit_eggs)::integer as eggs
    from public.order_items i
    join public.products p on p.id = i.product_id
    where i.order_id = p_order_id
    group by p.egg_type_id
  ),
  subtracted as (
    update public.egg_types t
    set stock = t.stock - e.eggs
    from eggs_by_type e
    where t.id = e.egg_type_id
    returning t.id, e.eggs
  )
  insert into public.stock_movements (egg_type_id, kind, eggs, order_id)
  select id, 'sale', eggs, p_order_id from subtracted;
$$;

-- Supabase grants execute on new functions to anon and authenticated by default: take it away. They run
-- only inside the RPCs, which execute them as their owner.
revoke execute on function public.check_items_available(bigint[], integer[]) from public, anon, authenticated;
revoke execute on function public.subtract_order_eggs(bigint) from public, anon, authenticated;

-- create_order as in spec 004, with the availability rule in check_items_available. Replaced in place, so
-- it keeps its grants.
create or replace function public.create_order(
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

  -- RF-26, RF-30: every product visible, and the eggs of each type within its stock minus what is reserved.
  perform public.check_items_available(v_ids, v_quantities);

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

-- set_order_status as in spec 006, with the subtraction of a delivery in subtract_order_eggs. Replaced in
-- place, so it keeps its grants.
create or replace function public.set_order_status(
  p_order_id bigint,
  p_status public.order_status,
  p_reason text default null
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.order_status;
  v_reason text := nullif(btrim(p_reason), '');
  v_missing record;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_current from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_changed' using errcode = 'P0001';
  end if;

  if not (
    (v_current = 'pending' and p_status in ('accepted', 'rejected'))
    or (v_current = 'accepted' and p_status in ('on_the_way', 'cancelled'))
    or (v_current = 'on_the_way' and p_status in ('delivered', 'cancelled'))
  ) then
    raise exception 'order_changed' using errcode = 'P0001', hint = v_current::text;
  end if;

  -- RF-16 (spec 005): a reason only for a rejection (optional) or a cancellation (required).
  if p_status not in ('rejected', 'cancelled') then
    v_reason := null;
  end if;
  if p_status = 'cancelled' and v_reason is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if char_length(v_reason) > 120 then
    raise exception 'reason_too_long' using errcode = 'P0001';
  end if;

  if p_status = 'delivered' then
    perform 1
    from public.egg_types t
    where t.id in (
      select p.egg_type_id from public.order_items i join public.products p on p.id = i.product_id
      where i.order_id = p_order_id
    )
    order by t.id
    for update;

    -- RF-26 (spec 005): the first type (by name) without the eggs this order needs.
    select t.name, sum(i.quantity * i.unit_eggs)::integer - t.stock as missing
    into v_missing
    from public.order_items i
    join public.products p on p.id = i.product_id
    join public.egg_types t on t.id = p.egg_type_id
    where i.order_id = p_order_id
    group by t.id, t.name, t.stock
    having sum(i.quantity * i.unit_eggs) > t.stock
    order by t.name
    limit 1;
    if found then
      raise exception 'not_enough_stock' using errcode = 'P0001', hint = v_missing.missing || '|' || v_missing.name;
    end if;

    -- RF-14 (spec 005): subtract the eggs of each type and leave its sale movement.
    perform public.subtract_order_eggs(p_order_id);
  end if;

  -- RF-18 (spec 005): the status, its date and, for a rejection or a cancellation, the reason; RF-30
  -- (spec 006): a cancellation here is the admin's.
  update public.orders
  set status = p_status,
      status_reason = case when p_status in ('rejected', 'cancelled') then v_reason else status_reason end,
      cancelled_by = case when p_status = 'cancelled' then 'admin' else cancelled_by end,
      accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
      on_the_way_at = case when p_status = 'on_the_way' then now() else on_the_way_at end,
      delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
      rejected_at = case when p_status = 'rejected' then now() else rejected_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where id = p_order_id;

  return p_status;
end;
$$;

-- RF-15, RF-17: the admin list and detail say whether an order is a counter sale and its name. The view
-- of spec 006 with both columns at the end (a view can only gain columns at the end); replaced in place,
-- so it keeps security_invoker and its grants.
create or replace view public.admin_order_overview
with (security_invoker = true)
as
select
  o.id,
  o.client_id,
  o.delivery_slot_id,
  o.delivery_date,
  o.slot_starts_at,
  o.slot_ends_at,
  o.status,
  o.status_reason,
  o.total,
  o.address,
  o.address_notes,
  o.created_at,
  o.accepted_at,
  o.on_the_way_at,
  o.delivered_at,
  o.rejected_at,
  o.cancelled_at,
  c.first_name as client_first_name,
  c.last_name as client_last_name,
  c.phone as client_phone,
  l.units,
  l.items,
  o.cancelled_by,
  o.counter_sale,
  o.customer_name
from public.orders o
left join public.profiles c on c.id = o.client_id
cross join lateral (
  select
    coalesce(sum(i.quantity), 0)::integer as units,
    coalesce(
      jsonb_agg(jsonb_build_object('name', p.name, 'quantity', i.quantity, 'unit_price', i.unit_price) order by i.id),
      '[]'::jsonb
    ) as items
  from public.order_items i
  left join public.products p on p.id = i.product_id
  where i.order_id = o.id
) l;
