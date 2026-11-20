-- Spec 003, cambio del RF-34 (2026-11-18) · T17: what is archived leaves the lists, the Shop and the
-- sales (RF-45); the history keeps it (RF-51): admin_order_overview, client_orders() and
-- admin_sales_by_type() do not change. A product that is not archived has its type and format not
-- archived either (archive_egg_type and archive_format refuse while they have products), so filtering
-- the product is enough. Views and functions keep their columns: replaced in place, with their grants.

-- RF-45: Productos and the counter sale.
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
left join public.egg_type_reservations r on r.egg_type_id = t.id
where p.archived_at is null;

-- RF-45: Stock and the inventory of the Dashboard.
create or replace view public.egg_type_overview
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
left join public.egg_type_reservations r on r.egg_type_id = t.id
where t.archived_at is null;

-- RF-45: the Shop.
create or replace function public.shop_products()
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
  where p.active and t.active and f.active and p.archived_at is null
  order by f.eggs, p.name;
$$;

-- RF-45 (and spec 004, RF-26): orders and counter sales do not sell what is archived. The types are now
-- locked before the check, so an order and the archive of one of its products never both get in.
create or replace function public.check_items_available(p_ids bigint[], p_quantities integer[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_product text;
begin
  -- The types first: archive_product locks the type of the product it archives, so once these locks
  -- are taken, the check below sees a product archived in the meantime.
  perform 1
  from public.egg_types t
  where t.id in (select p.egg_type_id from public.products p where p.id = any (p_ids))
  order by t.id
  for update;

  select coalesce(p.name, '') into v_product
  from unnest(p_ids) with ordinality as i (product_id, n)
  left join public.products p on p.id = i.product_id
  left join public.egg_types t on t.id = p.egg_type_id
  left join public.formats f on f.id = p.format_id
  where p.id is null or p.archived_at is not null or not (p.active and t.active and f.active)
  order by i.n
  limit 1;
  if found then
    raise exception 'product_unavailable' using errcode = 'P0001', hint = v_product;
  end if;

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
