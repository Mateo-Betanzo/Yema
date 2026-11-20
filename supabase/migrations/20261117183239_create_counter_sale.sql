-- Spec 008 · T2: create_counter_sale, the only way to register a counter sale (RF-3, RF-6, RF-9 to
-- RF-12, RF-14, RF-18, RF-19). The app sends only product ids, quantities, the total the admin saw and
-- an optional name; the base checks everything else and computes prices, total and eggs. All or nothing:
-- any error rolls back the whole call, so a rejected sale registers and subtracts nothing.
--
-- What is available is the same rule as the Shop (check_items_available: visible products, eggs within
-- the stock minus what active orders reserve, types locked in id order), so a sale never takes the eggs
-- of an accepted order and a sale and an order of the same types go one after the other. The sale is
-- born delivered: it subtracts its eggs and leaves one "sale" movement per type (subtract_order_eggs),
-- as a delivery of spec 005. Having no slot, it takes no place (RF-18).
--
-- Errors, in this order: forbidden (42501), and invalid_items, name_too_long, product_unavailable,
-- not_enough_units and price_changed (P0001). product_unavailable and not_enough_units name the product
-- in the hint.
create function public.create_counter_sale(
  p_items jsonb,
  p_expected_total integer,
  p_customer_name text default null
)
returns table (order_id bigint, total integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ids bigint[];
  v_quantities integer[];
  v_name text := nullif(btrim(p_customer_name), '');
  v_total bigint;
  v_order bigint;
begin
  -- RF-19: only the admin.
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- RF-3: a non-empty list of { product_id, quantity }, 1 to 99 units, no product twice.
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0
    or exists (
      select 1
      from jsonb_array_elements(p_items) e
      where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'product_id') is distinct from 'number'
        or jsonb_typeof(e -> 'quantity') is distinct from 'number'
        or (e ->> 'product_id') !~ '^-?[0-9]+$'
        or (e ->> 'quantity') !~ '^[1-9][0-9]?$'
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

  -- RF-6: the name without spaces around, empty is no name, up to 60 characters.
  if char_length(v_name) > 60 then
    raise exception 'name_too_long' using errcode = 'P0001';
  end if;

  -- RF-11: every product in the Shop, and the eggs of each type within its stock minus what is reserved.
  perform public.check_items_available(v_ids, v_quantities);

  -- RF-11: the total of the base must be the one the admin saw.
  select sum(i.quantity::bigint * p.price) into v_total
  from unnest(v_ids, v_quantities) as i (product_id, quantity)
  join public.products p on p.id = i.product_id;
  if v_total is distinct from p_expected_total then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;

  -- RF-10: the sale, delivered now, and each line with the current price and eggs per unit.
  insert into public.orders (counter_sale, status, delivered_at, total, customer_name)
  values (true, 'delivered', now(), v_total, v_name)
  returning id into v_order;

  insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
  select v_order, p.id, i.quantity, p.price, f.eggs
  from unnest(v_ids, v_quantities) as i (product_id, quantity)
  join public.products p on p.id = i.product_id
  join public.formats f on f.id = p.format_id;

  -- RF-10: the eggs leave the stock with their sale movement. They fit: they were checked against the
  -- stock minus what is reserved, with the types locked.
  perform public.subtract_order_eggs(v_order);

  return query select v_order, v_total::integer;
end;
$$;

revoke execute on function public.create_counter_sale(jsonb, integer, text) from public, anon;
grant execute on function public.create_counter_sale(jsonb, integer, text) to authenticated;
