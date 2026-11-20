-- Spec 008 · T2: create_counter_sale, the only way to register a counter sale (RF-3, RF-6, RF-10, RF-11,
-- RF-14, RF-18, RF-19). Only the admin; up to 99 units per product of the Shop at its current price,
-- within its stock minus what active orders reserve; all or nothing. The local database may hold QA
-- data: catalog and orders are removed inside this transaction.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

truncate public.egg_types, public.orders cascade;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-00000000aaa1', 'qa-sale-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-00000000aab1', 'qa-sale-b@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-00000000aac1', 'qa-sale-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000aac1';

insert into public.egg_types (name, stock) values ('QA Medianos', 900), ('QA Grandes', 360), ('QA Super', 1800);
insert into public.formats (name, eggs) values ('QA Maple', 30), ('QA Pack', 180);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, f.name || ' ' || t.name, case when f.name = 'QA Maple' then 5000 else 28000 end
from public.egg_types t, public.formats f;
update public.products set active = false where name = 'QA Pack QA Grandes';

create function pg_temp.p(product_name text) returns bigint language sql as
  $$ select id from public.products where name = product_name $$;
create function pg_temp.items(variadic lines text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('product_id', pg_temp.p(split_part(l, '=', 1)), 'quantity', split_part(l, '=', 2)::int))
  from unnest(lines) as l
$$;
create function pg_temp.stock(type_name text) returns integer language sql as
  $$ select stock from public.egg_types where name = type_name $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Client A has an accepted order for today that reserves 5 maples of Grandes (150 of its 360 eggs).
insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, total,
                           address, accepted_at)
select '00000000-0000-0000-0000-00000000aaa1', s.id, (now() at time zone 'America/Argentina/Buenos_Aires')::date,
       s.starts_at, s.ends_at, 'accepted', 30000, 'Calle 1', now()
from public.delivery_slots s order by s.id limit 1;
insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
select o.id, pg_temp.p('QA Maple QA Grandes'), 5, 6000, 30 from public.orders o;

select ok(
  (select prosecdef from pg_proc where oid = 'public.create_counter_sale(jsonb, integer, text)'::regprocedure)
  and not has_function_privilege('anon', 'public.create_counter_sale(jsonb, integer, text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_counter_sale(jsonb, integer, text)', 'execute'),
  'RF-19: create_counter_sale runs as its owner and only signed-in users can execute it'
);

-- RF-19: a client cannot register a sale
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000aaa1", "role": "authenticated"}', true);
select throws_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Maple QA Medianos=1'), 5000) $$,
  '42501', null, 'RF-19: client A cannot register a counter sale'
);
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Maple QA Medianos=1'), 5000) $$,
  '42501', null, 'RF-19: nor can anon'
);

-- The admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000aac1", "role": "authenticated"}', true);

select results_eq(
  $$ select total from public.create_counter_sale(pg_temp.items('QA Maple QA Medianos=2', 'QA Pack QA Medianos=1'), 38000, '  Juan Gómez  ') $$,
  $$ values (38000) $$,
  'RF-10: the admin registers a sale and gets its total'
);
reset role;
select results_eq(
  $$ select counter_sale, status::text, delivered_at is not null, client_id is null, delivery_slot_id is null,
            address is null, customer_name, total
     from public.orders where counter_sale $$,
  $$ values (true, 'delivered'::text, true, true, true, true, 'Juan Gómez'::text, 38000) $$,
  'RF-6, RF-10: delivered now, without client, slot nor address, with the name trimmed and the total of the base'
);
select results_eq(
  $$ select p.name, i.quantity, i.unit_price, i.unit_eggs from public.order_items i
     join public.orders o on o.id = i.order_id join public.products p on p.id = i.product_id
     where o.counter_sale order by i.id $$,
  $$ values ('QA Maple QA Medianos'::text, 2, 5000, 30), ('QA Pack QA Medianos', 1, 28000, 180) $$,
  'RF-10: each line keeps its current price and the eggs of its format'
);
select is(pg_temp.stock('QA Medianos'), 660, 'RF-10: the 240 eggs are subtracted from the stock');
select results_eq(
  $$ select m.kind::text, m.eggs from public.stock_movements m
     join public.orders o on o.id = m.order_id where o.counter_sale $$,
  $$ values ('sale'::text, 240) $$,
  'RF-10: one sale movement per type, with the sale'
);

-- RF-14, RF-18: it adds to the totals and sales, takes no place and is not "to deliver"
select results_eq(
  $$ select income_today, delivered_today, to_deliver from public.admin_totals_at(now()) $$,
  $$ values (38000::bigint, 1, 1) $$,
  'RF-14, RF-18: the sale adds to the income and the orders of today, but not to what is to deliver'
);
select is(
  (select eggs_week from public.admin_sales_by_type_at(now()) where name = 'QA Medianos'),
  240::bigint,
  'RF-14: and to the sales by type'
);
select is(
  (select count(*)::int from public.orders where counter_sale and delivery_slot_id is not null),
  0,
  'RF-18: no counter sale has a slot, so none takes a place'
);

-- RF-6: the name
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000aac1", "role": "authenticated"}', true);
select lives_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Maple QA Medianos=1'), 5000, '   ') $$,
  'RF-6: a name of only spaces is accepted'
);
select lives_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Maple QA Medianos=1'), 5000) $$,
  'RF-6: and so is no name at all'
);
reset role;
select is(
  (select count(*)::int from public.orders where counter_sale and customer_name is null),
  2,
  'RF-6: both have no name'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000aac1", "role": "authenticated"}', true);
select throws_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Maple QA Medianos=1'), 5000, repeat('a', 61)) $$,
  'P0001', 'name_too_long', 'RF-6: a name of 61 characters is rejected'
);

-- RF-3: up to 99 units, no product twice
select lives_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Pack QA Super=10'), 280000) $$,
  'RF-3: 10 packs, past the 5 of the Shop, when there is stock'
);
select throws_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Maple QA Super=100'), 500000) $$,
  'P0001', 'invalid_items', 'RF-3: 100 units are rejected'
);
select throws_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Maple QA Super=1', 'QA Maple QA Super=1'), 10000) $$,
  'P0001', 'invalid_items', 'RF-3: a product twice is rejected'
);

-- RF-11: what changed since the admin built the sale
select throws_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Pack QA Grandes=1'), 28000) $$,
  'P0001', 'product_unavailable', 'RF-11: a product no longer in the Shop is rejected'
);
select throws_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Maple QA Grandes=8'), 40000) $$,
  'P0001', 'not_enough_units', 'RF-11: 8 maples of Grandes do not fit: 150 of its 360 eggs are reserved'
);
select throws_ok(
  $$ select * from public.create_counter_sale(pg_temp.items('QA Maple QA Grandes=7'), 1) $$,
  'P0001', 'price_changed', 'RF-11: a total other than the one of the base is rejected'
);
reset role;
select results_eq(
  $$ select pg_temp.stock('QA Grandes'), (select count(*)::int from public.orders where counter_sale) $$,
  $$ values (360, 4) $$,
  'RF-11: and none of the three changed the stock or registered a sale'
);

select * from finish();
rollback;
