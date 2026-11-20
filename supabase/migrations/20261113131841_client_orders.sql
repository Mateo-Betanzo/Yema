-- Spec 006 · T2: the orders of the client (RF-2, RF-10, RF-13, RF-18, RF-19, RF-22, RF-23, RF-28) and
-- who cancelled in the admin overview (RF-31).

-- The orders of the caller, the newest first, for its Home (the card, "Volver a comprar" and the
-- history) and its order detail. Each order with its status, reason, who cancelled, the date of each
-- step, the day and slot, the address, the total, its units and its lines in the order they were added:
-- the current names of product, type and format (RF-22) and the price saved with the order. A client
-- cannot read products, egg_types or formats (spec 003), so this runs as its owner and filters by
-- auth.uid() itself, as shop_products(); it returns names only, never the stock. The admin, who has no
-- orders of its own, gets none here (it reads admin_order_overview).
create function public.client_orders()
returns table (
  id bigint,
  delivery_date date,
  slot_starts_at time,
  slot_ends_at time,
  status public.order_status,
  status_reason text,
  cancelled_by public.user_role,
  total integer,
  address text,
  address_notes text,
  created_at timestamptz,
  accepted_at timestamptz,
  on_the_way_at timestamptz,
  delivered_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  units integer,
  items jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.delivery_date,
    o.slot_starts_at,
    o.slot_ends_at,
    o.status,
    o.status_reason,
    o.cancelled_by,
    o.total,
    o.address,
    o.address_notes,
    o.created_at,
    o.accepted_at,
    o.on_the_way_at,
    o.delivered_at,
    o.rejected_at,
    o.cancelled_at,
    l.units,
    l.items
  from public.orders o
  cross join lateral (
    select
      coalesce(sum(i.quantity), 0)::integer as units,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'product_id', p.id,
            'name', p.name,
            'egg_type_name', t.name,
            'format_name', f.name,
            'quantity', i.quantity,
            'unit_price', i.unit_price
          )
          order by i.id
        ),
        '[]'::jsonb
      ) as items
    from public.order_items i
    join public.products p on p.id = i.product_id
    join public.egg_types t on t.id = p.egg_type_id
    join public.formats f on f.id = p.format_id
    where i.order_id = o.id
  ) l
  where o.client_id = auth.uid()
  order by o.created_at desc, o.id desc;
$$;

revoke execute on function public.client_orders() from public, anon;
grant execute on function public.client_orders() to authenticated;

-- RF-31: the admin detail says "Lo canceló el cliente". The view of spec 005 with cancelled_by at the
-- end (a view can only gain columns at the end); replaced in place, so it keeps security_invoker and
-- its grants.
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
  o.cancelled_by
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
