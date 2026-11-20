-- Spec 005 · T2: set_order_status, the only way to change the status of an order (RF-11 to RF-18,
-- RF-21, RF-22, RF-26). Only the admin, only along the admin's transitions:
--   pending → accepted or rejected · accepted → on_the_way or cancelled · on_the_way → delivered or cancelled
-- (cancelling a pending order is the client's, spec 006). Anything else, including the same change twice
-- (two taps on "Entregado"), is "order_changed" with the current status in the hint (RF-17, RF-22).
--
-- The order row is locked, so two changes of the same order go one after the other. Delivering locks the
-- types of its products in id order (as create_order) and subtracts their eggs only if each type has
-- enough for this order (RF-26); then it leaves one "sale" movement per type (RF-14). Rejected,
-- cancelled and delivered orders stop reserving and taking a place by themselves: the reservations and
-- the slot count only active (and, for the slot, delivered) orders (spec 004). Any error rolls back the
-- whole call.
--
-- Errors: forbidden (42501), and order_changed, reason_required, reason_too_long and not_enough_stock
-- (P0001; the last one with "<missing eggs>|<type name>" in the hint).
create function public.set_order_status(
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

  -- RF-16: a reason only for a rejection (optional) or a cancellation (required).
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

    -- RF-26: the first type (by name) without the eggs this order needs.
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

    -- RF-14: subtract the eggs of each type and leave its sale movement.
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
  end if;

  -- RF-18: the status, its date and, for a rejection or a cancellation, the reason.
  update public.orders
  set status = p_status,
      status_reason = case when p_status in ('rejected', 'cancelled') then v_reason else status_reason end,
      accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
      on_the_way_at = case when p_status = 'on_the_way' then now() else on_the_way_at end,
      delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
      rejected_at = case when p_status = 'rejected' then now() else rejected_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where id = p_order_id;

  return p_status;
end;
$$;

revoke execute on function public.set_order_status(bigint, public.order_status, text) from public, anon;
grant execute on function public.set_order_status(bigint, public.order_status, text) to authenticated;
