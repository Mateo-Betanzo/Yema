-- Spec 006 · T1: who cancelled an order (RF-25, RF-30, RF-31) and the cancellation of the client
-- (RF-5 to RF-8, RF-29). Until now only the admin cancelled, always with a reason (spec 005). From now
-- on the client also cancels its own pending order, without a reason, and the base keeps who did it.

-- RF-30: who cancelled, as a role (the enum of spec 002). Every cancelled order so far is the admin's.
alter table public.orders add column cancelled_by public.user_role;

update public.orders set cancelled_by = 'admin' where status = 'cancelled';

-- Only a cancelled order says who cancelled it, and it always does. The admin cancels with a reason
-- (spec 005, RF-15 and RF-16) and the client without one: this replaces the check of spec 005, which
-- asked every cancellation for a reason.
alter table public.orders drop constraint orders_cancel_reason;
alter table public.orders
  add constraint orders_cancelled_by check ((status = 'cancelled') = (cancelled_by is not null)),
  add constraint orders_cancel_reason check (status <> 'cancelled' or (cancelled_by = 'admin') = (status_reason is not null));

comment on column public.orders.cancelled_by is 'Who cancelled the order: the client (no reason) or the admin (with a reason). Spec 006.';
comment on column public.orders.status_reason is 'Reason of a rejection (optional) or of a cancellation by the admin (required).';

-- RF-30: set_order_status as in spec 005, and a cancellation now says it was the admin's. Replaced in
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

-- RF-5 to RF-8, RF-29: the client cancels its own pending order, without a reason. Only clients: the
-- admin rejects a pending order (spec 005). The order is locked, so a second tap, or an admin accepting
-- it at the same time, waits and then finds it is no longer pending (RF-8: order_changed with the
-- current status in the hint). An order of someone else, or one that does not exist, is order_changed
-- without a hint: the client learns nothing about it. The reservation and the place in the slot are
-- freed by themselves (they count only active orders, spec 004); the stock does not change.
--
-- Errors: forbidden (42501) and order_changed (P0001).
create function public.cancel_order(p_order_id bigint)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.order_status;
begin
  if auth.uid() is null or public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_current
  from public.orders
  where id = p_order_id and client_id = auth.uid()
  for update;
  if not found then
    raise exception 'order_changed' using errcode = 'P0001';
  end if;
  if v_current <> 'pending' then
    raise exception 'order_changed' using errcode = 'P0001', hint = v_current::text;
  end if;

  update public.orders
  set status = 'cancelled',
      status_reason = null,
      cancelled_by = 'client',
      cancelled_at = now()
  where id = p_order_id;

  return 'cancelled';
end;
$$;

revoke execute on function public.cancel_order(bigint) from public, anon;
grant execute on function public.cancel_order(bigint) to authenticated;
