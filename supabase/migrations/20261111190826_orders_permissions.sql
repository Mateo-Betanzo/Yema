-- Spec 004 · T2: who reads the schedule, orders and their lines; the eggs reserved by active orders
-- and the views and shop that subtract them. The RPC that offers slots and creates orders come in T3
-- and T4.

-- Supabase grants every privilege on new tables to anon and authenticated by default: start from
-- nothing and give back only what is needed.
revoke all on public.delivery_slots, public.orders, public.order_items from anon, authenticated;

-- RF-33, RF-35: authenticated only reads. Orders are created only by create_order (T4) and the
-- schedule changes only by migrations until spec 009; nothing is ever deleted (principle 7).
grant select on public.delivery_slots, public.orders, public.order_items to authenticated;

-- RF-35: the schedule table is the admin's; a client sees the slots through delivery_options() (T3),
-- which never shows other clients' orders.
create policy "delivery_slots: admin reads" on public.delivery_slots for select to authenticated
  using ((select public.is_admin()));

-- RF-34: each client reads its own orders and lines; the admin reads all.
create policy "orders: client reads own, admin reads all" on public.orders for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_admin()));
create policy "order_items: client reads own, admin reads all" on public.order_items for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o where o.id = order_id and o.client_id = (select auth.uid()))
  );

-- RF-6, RF-37: eggs reserved per type by the active orders, with the eggs per unit each line kept.
-- A delivered order no longer reserves (its stock was already subtracted, spec 005); a rejected or
-- cancelled one frees its eggs. security_invoker: the admin sums every order; a client cannot read
-- products, so it gets no rows. shop_products() (security definer) sums every client's orders.
create view public.egg_type_reservations
with (security_invoker = true)
as
select p.egg_type_id, sum(i.quantity * i.unit_eggs)::integer as reserved_eggs
from public.order_items i
join public.orders o on o.id = i.order_id
join public.products p on p.id = i.product_id
where o.status in ('pending', 'accepted', 'on_the_way')
group by p.egg_type_id;

comment on view public.egg_type_reservations is 'Eggs reserved per type by active orders (spec 004).';

-- RF-38: the stock of each type with its reserved eggs and how many are missing for the active orders
-- (an adjustment can leave the stock below the reservations). Only the admin gets rows (RLS of
-- egg_types).
create view public.egg_type_overview
with (security_invoker = true)
as
select
  t.id,
  t.name,
  t.active,
  t.stock,
  t.created_at,
  t.updated_at,
  coalesce(r.reserved_eggs, 0) as reserved_eggs,
  greatest(coalesce(r.reserved_eggs, 0) - t.stock, 0) as shortfall
from public.egg_types t
left join public.egg_type_reservations r on r.egg_type_id = t.id;

comment on view public.egg_type_overview is 'Admin stock list: stock, reserved eggs and shortfall (spec 004).';

revoke all on public.egg_type_reservations, public.egg_type_overview from anon, authenticated;
grant select on public.egg_type_reservations, public.egg_type_overview to authenticated;

-- RF-7, RF-38: the units of the admin list subtract the reserved eggs and are never negative. Same
-- columns as in spec 003, so the view is replaced in place and keeps its grants.
create or replace view public.product_overview
with (security_invoker = true)
as
select
  p.id,
  p.egg_type_id,
  p.format_id,
  p.name,
  p.description,
  p.price,
  p.active,
  p.created_at,
  p.updated_at,
  t.name as type_name,
  t.active as type_active,
  f.name as format_name,
  f.eggs as format_eggs,
  f.active as format_active,
  greatest(t.stock - coalesce(r.reserved_eggs, 0), 0) / f.eggs as units_available,
  case
    when not p.active then 'inactive'
    when not t.active then 'type_inactive'
    when not f.active then 'format_inactive'
    else 'visible'
  end as status
from public.products p
join public.egg_types t on t.id = p.egg_type_id
join public.formats f on f.id = p.format_id
left join public.egg_type_reservations r on r.egg_type_id = t.id;

-- RF-5, RF-6, RF-10: the shop now gives the units left of each product (spec 004 changes RF-33 of
-- spec 003: the client sees units, never the stock in eggs). The return type changes, so the function
-- is dropped and created again. As security definer it reads the reservations of every client.
drop function public.shop_products();

create function public.shop_products()
returns table (
  id bigint,
  name text,
  description text,
  price integer,
  format_id bigint,
  format_name text,
  format_eggs integer,
  units_available integer,
  available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.description, p.price, f.id, f.name, f.eggs, u.units, u.units > 0
  from public.products p
  join public.egg_types t on t.id = p.egg_type_id
  join public.formats f on f.id = p.format_id
  left join public.egg_type_reservations r on r.egg_type_id = t.id
  cross join lateral (select greatest(t.stock - coalesce(r.reserved_eggs, 0), 0) / f.eggs as units) u
  where p.active and t.active and f.active
  order by f.eggs, p.name;
$$;

revoke execute on function public.shop_products() from public, anon;
grant execute on function public.shop_products() to authenticated;
