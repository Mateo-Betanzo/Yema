-- Spec 005 · T3: the orders of the admin Home and of the order detail (RF-1 to RF-3, RF-7, RF-24), and
-- Realtime on orders (RF-5, RF-23).

-- One row per order with what the Home and the detail show: the order (with its status dates and
-- reason), the current name and phone of the client (RF-7: from the profile, not a copy), the units
-- (RF-3) and the lines with name, quantity and price, in the order they were added. security_invoker:
-- the RLS of orders, profiles and products applies, so the admin sees every order and a client only its
-- own, with the product names empty (a client cannot read products; spec 006 decides how to show them).
create view public.admin_order_overview
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
  l.items
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

comment on view public.admin_order_overview is 'Orders with the client, units and lines, for the admin Home and detail (spec 005).';

revoke all on public.admin_order_overview from anon, authenticated;
grant select on public.admin_order_overview to authenticated;

-- RF-5, RF-23: the admin Home listens to orders. Postgres Changes authorizes every event against each
-- subscriber, so the RLS of orders decides who receives what: a client, only its own orders. Orders are
-- never deleted, so the caveat of DELETE events and RLS does not apply.
alter publication supabase_realtime add table public.orders;
