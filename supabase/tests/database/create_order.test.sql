-- Spec 004 · T4: create_order, the only way to create an order. RF-24 to RF-30, RF-33, RF-37.
-- create_order uses the real clock, so the slots come from delivery_options_at(now()) and are kept in
-- settings (qa.*) that any role can read. The local database may hold QA data: products and orders are
-- removed inside this transaction (the rollback at the end brings them back). Two confirmations at the
-- same time (RF-30) need two sessions: here they are checked one after the other, and the race goes to
-- the manual QA.
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

truncate public.products cascade;
truncate public.orders cascade;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1", "address_notes": "Timbre B"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000004a1', 'qa-create-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000004b2', 'qa-create-b@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000004c3', 'qa-create-c@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000004d4', 'qa-create-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000004d4';

-- Catalog: "QA Pedido" has 400 eggs; the other products are not visible for one reason each.
insert into public.egg_types (name, stock) values ('QA Pedido', 400), ('QA Apagado', 400);
update public.egg_types set active = false where name = 'QA Apagado';
insert into public.formats (name, eggs) values ('QA Bandeja', 10), ('QA Caja', 100), ('QA Suelto', 5);
update public.formats set active = false where name = 'QA Suelto';
create function pg_temp.new_product(type_name text, format_name text, product_name text, product_price int, is_active boolean)
returns void language sql as $$
  insert into public.products (egg_type_id, format_id, name, price, active)
  select t.id, f.id, product_name, product_price, is_active
  from public.egg_types t, public.formats f where t.name = type_name and f.name = format_name;
$$;
select pg_temp.new_product('QA Pedido', 'QA Bandeja', 'QA Bandeja', 1500, true);
select pg_temp.new_product('QA Pedido', 'QA Caja', 'QA Caja', 12000, true);
select pg_temp.new_product('QA Pedido', 'QA Suelto', 'QA Formato apagado', 800, true);
select pg_temp.new_product('QA Apagado', 'QA Bandeja', 'QA Tipo apagado', 1500, true);
select pg_temp.new_product('QA Apagado', 'QA Caja', 'QA Producto apagado', 12000, false);

-- Clients cannot read products (RLS), so the ids go to a temporary table every role can read.
create temp table qa_products as select id, name from public.products;
grant select on qa_products to anon, authenticated;
create function pg_temp.p(product_name text) returns bigint language sql as
  $$ select id from pg_temp.qa_products where name = product_name $$;
create function pg_temp.items(variadic pairs text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('product_id', pg_temp.p(pairs[i]), 'quantity', pairs[i + 1]::int))
  from generate_series(1, array_length(pairs, 1), 2) as i;
$$;

-- Slots: the last one offered (surely 2 hours or more away) and the one before, which gets full.
create function pg_temp.today() returns date language sql as
  $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;
select set_config('qa.date', delivery_date::text, true), set_config('qa.slot', slot_id::text, true)
from (select * from public.delivery_options_at(now()) order by delivery_date desc, starts_at desc limit 1) o;
select set_config('qa.full_date', delivery_date::text, true), set_config('qa.full_slot', slot_id::text, true)
from (select * from public.delivery_options_at(now()) order by delivery_date desc, starts_at desc offset 1 limit 1) o;
select set_config('qa.sunday', d::date::text, true)
from generate_series(pg_temp.today(), pg_temp.today() + 6, interval '1 day') d where extract(dow from d) = 0;
-- The offered slot, for the expected values (clients cannot read delivery_slots).
create temp table qa_slot as
  select id, starts_at, ends_at from public.delivery_slots where id = current_setting('qa.slot')::bigint;
grant select on qa_slot to authenticated;
-- A slot of the same weekday as a date, or the offered one when that day has none (also not offered).
create function pg_temp.slot_on(day date) returns bigint language sql as $$
  select coalesce(
    (select id from public.delivery_slots where weekday = extract(dow from day) order by starts_at limit 1),
    current_setting('qa.slot')::bigint
  )
$$;

-- Five other clients fill the second slot.
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000049' || n)::uuid, 'qa-fill-' || n || '@example.com',
  '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}'
from generate_series(1, 5) n;
insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address)
select ('00000000-0000-0000-0000-00000000049' || n)::uuid, s.id, current_setting('qa.full_date')::date,
  s.starts_at, s.ends_at, 1000, 'Calle 1'
from generate_series(1, 5) n, public.delivery_slots s where s.id = current_setting('qa.full_slot')::bigint;

-- create_order on the offered slot.
create function pg_temp.create(items jsonb, expected_total int)
returns table (order_id bigint, delivery_date date, starts_at time, ends_at time, total integer)
language sql as $$
  select * from public.create_order(current_setting('qa.date')::date, current_setting('qa.slot')::bigint, items, expected_total)
$$;
-- The hint of the error a statement raises (create_order puts the product name there).
create function pg_temp.hint_of(statement text) returns text language plpgsql as $$
declare
  v_hint text;
begin
  execute statement;
  return null;
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return v_hint;
end;
$$;

-- RF-33: who can create orders
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select * from public.create_order(current_setting('qa.date')::date, current_setting('qa.slot')::bigint,
       '[{"product_id": 1, "quantity": 1}]', 1500) $$,
  '42501', null, 'RF-33: anon cannot create orders'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004d4", "role": "authenticated"}', true);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Bandeja', '1'), 1500) $$,
  '42501', 'forbidden', 'RF-33: the admin is not a client and cannot create orders'
);
select ok(
  not exists (select 1 from pg_proc p, unnest(p.proargnames) arg
              where p.proname = 'create_order' and (arg ilike '%client%' or arg ilike '%price%')),
  'RF-33: create_order takes no client and no price: the client is the caller and prices come from the base'
);

-- Client A
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004a1", "role": "authenticated"}', true);

-- RF-29: the lines
select throws_ok($$ select * from pg_temp.create('[]', 0) $$, 'P0001', 'invalid_items', 'RF-29: an order without lines is rejected');
select throws_ok(
  $$ select * from pg_temp.create('{"product_id": 1, "quantity": 1}', 1500) $$,
  'P0001', 'invalid_items', 'RF-29: the lines must be a list'
);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Bandeja', '1', 'QA Bandeja', '2'), 4500) $$,
  'P0001', 'invalid_items', 'RF-29: a product cannot be repeated'
);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Bandeja', '6'), 9000) $$,
  'P0001', 'invalid_items', 'RF-29: more than 5 units of a product are rejected'
);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Bandeja', '0'), 0) $$,
  'P0001', 'invalid_items', 'RF-29: 0 units are rejected'
);

-- RF-28: the slot
select throws_ok(
  $$ select * from public.create_order(current_setting('qa.date')::date, -1, pg_temp.items('QA Bandeja', '1'), 1500) $$,
  'P0001', 'slot_unavailable', 'RF-28: a slot that does not exist is rejected'
);
select throws_ok(
  $$ select * from public.create_order(pg_temp.today() - 1, pg_temp.slot_on(pg_temp.today() - 1), pg_temp.items('QA Bandeja', '1'), 1500) $$,
  'P0001', 'slot_unavailable', 'RF-28: a slot of yesterday is rejected'
);
select throws_ok(
  $$ select * from public.create_order(pg_temp.today() + 7, pg_temp.slot_on(pg_temp.today() + 7), pg_temp.items('QA Bandeja', '1'), 1500) $$,
  'P0001', 'slot_unavailable', 'RF-28: a slot 7 days away (8 days counting today) is rejected'
);
select throws_ok(
  $$ select * from public.create_order(current_setting('qa.sunday')::date, current_setting('qa.slot')::bigint, pg_temp.items('QA Bandeja', '1'), 1500) $$,
  'P0001', 'slot_unavailable', 'RF-28: a slot on a day of another weekday (Sunday) is rejected'
);
select throws_ok(
  $$ select * from public.create_order(current_setting('qa.full_date')::date, current_setting('qa.full_slot')::bigint, pg_temp.items('QA Bandeja', '1'), 1500) $$,
  'P0001', 'slot_unavailable', 'RF-28: a full slot is rejected'
);

-- RF-26: the products
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Producto apagado', '1'), 12000) $$,
  'P0001', 'product_unavailable', 'RF-26: an inactive product is rejected'
);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Bandeja', '1', 'QA Tipo apagado', '1'), 3000) $$,
  'P0001', 'product_unavailable', 'RF-26: a product of an inactive type is rejected'
);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Formato apagado', '1'), 800) $$,
  'P0001', 'product_unavailable', 'RF-26: a product of an inactive format is rejected'
);
select is(
  pg_temp.hint_of($$ select * from pg_temp.create(pg_temp.items('QA Bandeja', '1', 'QA Tipo apagado', '1'), 3000) $$),
  'QA Tipo apagado', 'RF-26: the error names the product that is not for sale'
);
select throws_ok(
  $$ select * from pg_temp.create('[{"product_id": -1, "quantity": 1}]', 1500) $$,
  'P0001', 'product_unavailable', 'RF-26: a product that does not exist is rejected'
);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Caja', '5'), 60000) $$,
  'P0001', 'not_enough_units', 'RF-26: 500 eggs of a type with 400 are rejected'
);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Caja', '4', 'QA Bandeja', '1'), 49500) $$,
  'P0001', 'not_enough_units', 'RF-26: two products of the same type that do not fit together are rejected'
);
select is(
  pg_temp.hint_of($$ select * from pg_temp.create(pg_temp.items('QA Caja', '4', 'QA Bandeja', '1'), 49500) $$),
  'QA Caja', 'RF-26: the error names the first product of the type that does not fit'
);

-- RF-25: the total the client saw
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Caja', '3', 'QA Bandeja', '5'), 43000) $$,
  'P0001', 'price_changed', 'RF-25: a total different from the one of the base is rejected'
);
select is(
  (select count(*)::int from public.orders), 0,
  'RF-25, RF-26, RF-28, RF-29: a rejected order creates and reserves nothing'
);

-- RF-24, RF-37: the order
select is(
  (select total from pg_temp.create(pg_temp.items('QA Caja', '3', 'QA Bandeja', '5'), 43500)),
  43500, 'RF-24: the order is created with the total computed in the base'
);
select results_eq(
  $$ select o.status::text, o.delivery_date, o.delivery_slot_id, o.slot_starts_at, o.slot_ends_at, o.total, o.address, o.address_notes
     from public.orders o $$,
  $$ select 'pending'::text, current_setting('qa.date')::date, s.id, s.starts_at, s.ends_at, 43500, 'Calle 1'::text, 'Timbre B'::text
     from pg_temp.qa_slot s $$,
  'RF-24: the order is pending, with the slot, its hours, the total and the address of the profile'
);
select results_eq(
  $$ select p.name, i.quantity, i.unit_price, i.unit_eggs
     from public.order_items i join pg_temp.qa_products p on p.id = i.product_id order by p.name $$,
  $$ values ('QA Bandeja'::text, 5, 1500, 10), ('QA Caja', 3, 12000, 100) $$,
  'RF-24, RF-37: each line keeps its quantity, the current price and the eggs per unit'
);
select results_eq(
  $$ select name, units_available from public.shop_products() where name in ('QA Bandeja', 'QA Caja') order by name $$,
  $$ values ('QA Bandeja'::text, 5), ('QA Caja', 0) $$,
  'RF-24: the order reserves its 350 eggs: 50 are left'
);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Bandeja', '1'), 1500) $$,
  'P0001', 'active_order_exists', 'RF-27: a client with an active order cannot create another'
);
update public.profiles set address = 'Calle 2' where id = '00000000-0000-0000-0000-0000000004a1';
select is(
  (select address from public.orders), 'Calle 1',
  'RF-24: changing the profile later does not change the address of the order'
);

-- RF-30: client B takes the last 50 eggs and client C finds none
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004b2", "role": "authenticated"}', true);
select lives_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Bandeja', '5'), 7500) $$,
  'RF-30: client B takes the last 50 eggs'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004c3", "role": "authenticated"}', true);
select throws_ok(
  $$ select * from pg_temp.create(pg_temp.items('QA Bandeja', '1'), 1500) $$,
  'P0001', 'not_enough_units', 'RF-30: then client C finds no units left'
);

select * from finish();
rollback;
