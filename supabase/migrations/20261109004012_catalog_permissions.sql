-- Spec 003 · T2: who reads and changes the catalog, the admin overview and the shop.
-- The stock RPC (load_stock, adjust_stock) come in T3.

-- Supabase grants every privilege on new tables to anon and authenticated by default: start from
-- nothing and give back only what is needed.
revoke all on public.egg_types, public.formats, public.products, public.stock_movements from anon, authenticated;

-- authenticated reads the four tables, but RLS lets only the admin see rows: a client reads the shop
-- through shop_products(), never the tables, so the stock never reaches the app (RF-33).
grant select on public.egg_types, public.formats, public.products, public.stock_movements to authenticated;

-- Writes, column by column (RF-14, RF-32, RF-35):
-- · the stock of a type changes only through the stock RPC, never by hand;
-- · nobody makes another format the load format;
-- · the type and the format of a product are fixed once created;
-- · movements are only created by the stock RPC, and nothing is ever deleted (RF-24, RF-34).
grant insert (name, active), update (name, active) on public.egg_types to authenticated;
grant insert (name, eggs, active), update (name, eggs, active) on public.formats to authenticated;
grant insert (egg_type_id, format_id, name, description, price, active),
  update (name, description, price, active) on public.products to authenticated;

-- RF-32: only the admin, even when the request does not come from the app.
create policy "egg_types: admin reads" on public.egg_types for select to authenticated
  using ((select public.is_admin()));
create policy "egg_types: admin creates" on public.egg_types for insert to authenticated
  with check ((select public.is_admin()));
create policy "egg_types: admin changes" on public.egg_types for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "formats: admin reads" on public.formats for select to authenticated
  using ((select public.is_admin()));
create policy "formats: admin creates" on public.formats for insert to authenticated
  with check ((select public.is_admin()));
create policy "formats: admin changes" on public.formats for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "products: admin reads" on public.products for select to authenticated
  using ((select public.is_admin()));
create policy "products: admin creates" on public.products for insert to authenticated
  with check ((select public.is_admin()));
create policy "products: admin changes" on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "stock_movements: admin reads" on public.stock_movements for select to authenticated
  using ((select public.is_admin()));

-- RF-16, RF-17, RF-35: every product with what the admin list shows, computed in the base. It runs
-- with the caller's permissions (security_invoker), so the RLS above still applies: a client gets no
-- rows.
create view public.product_overview
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
  t.stock / f.eggs as units_available,
  case
    when not p.active then 'inactive'
    when not t.active then 'type_inactive'
    when not f.active then 'format_inactive'
    else 'visible'
  end as status
from public.products p
join public.egg_types t on t.id = p.egg_type_id
join public.formats f on f.id = p.format_id;

comment on view public.product_overview is 'Admin list of products: units available and visibility (spec 003).';

revoke all on public.product_overview from anon, authenticated;
grant select on public.product_overview to authenticated;

-- RF-26, RF-27, RF-28, RF-33, RF-35: the shop. Only visible products (active, with active type and
-- format), by format eggs and name, with whether at least one unit is available. security definer so
-- it can read the stock without giving the client access to it; it never returns the quantity.
create function public.shop_products()
returns table (
  id bigint,
  name text,
  description text,
  price integer,
  format_id bigint,
  format_name text,
  format_eggs integer,
  available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.description, p.price, f.id, f.name, f.eggs, t.stock >= f.eggs
  from public.products p
  join public.egg_types t on t.id = p.egg_type_id
  join public.formats f on f.id = p.format_id
  where p.active and t.active and f.active
  order by f.eggs, p.name;
$$;

revoke execute on function public.shop_products() from public, anon;
grant execute on function public.shop_products() to authenticated;
