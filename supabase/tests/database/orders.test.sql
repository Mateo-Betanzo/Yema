-- Spec 004 · T1: the delivery schedule, orders and their lines, with their rules and initial data.
-- RF-1, RF-27, RF-29, RF-37 and principle 7 (nothing is deleted). Runs as the table owner:
-- permissions are tested in orders_rls.test.sql, and creating orders through the RPC in
-- create_order.test.sql. The local database may hold real data: tests only look at what they create.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- Schema
select has_table('public', 'delivery_slots', 'delivery_slots exists');
select has_table('public', 'orders', 'orders exists');
select has_table('public', 'order_items', 'order_items exists');
select enum_has_labels(
  'public', 'order_status',
  array['pending', 'accepted', 'on_the_way', 'delivered', 'rejected', 'cancelled'],
  'order_status has the six states of the glossary'
);
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.delivery_slots'::regclass, 'public.orders'::regclass, 'public.order_items'::regclass)),
  'RLS is on in the three tables'
);

-- RF-1: the weekly schedule the business starts with
select results_eq(
  $$ select weekday, starts_at, ends_at, capacity, active from public.delivery_slots order by weekday, starts_at $$,
  $$ select d::smallint, s::time, e::time, 5, true
     from generate_series(1, 6) d, (values ('09:00', '11:00'), ('18:00', '21:00')) v (s, e)
     order by 1, 2 $$,
  'RF-1: Monday to Saturday, 9 to 11 and 18 to 21, with a capacity of 5'
);
select is((select count(*)::int from public.delivery_slots where weekday = 0), 0, 'RF-1: no slots on Sunday');

-- Slot rules
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (7, '10:00', '11:00', 5) $$,
  '23514', null, 'a weekday outside 0 to 6 is rejected'
);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '11:00', '11:00', 5) $$,
  '23514', null, 'a slot must end after it starts'
);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '10:00', '11:00', 0) $$,
  '23514', null, 'a capacity of 0 is rejected'
);
-- Inactive, so only the one-start-per-day index applies: an active one would also overlap, and since
-- spec 009 (cambio del 2026-11-19, the index is newer) the exclusion is reported first.
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity, active) values (1, '09:00', '10:00', 5, false) $$,
  '23505', null, 'two slots cannot start at the same time on the same weekday'
);

-- Fixtures: two clients and a product of a type of their own
create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1", "address_notes": "Timbre B"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000004a1', 'qa-orders-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000004b2', 'qa-orders-b@example.com');

insert into public.egg_types (name, stock) values ('QA Pedidos', 900);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, 'QA Maple Pedidos', 4000
from public.egg_types t, public.formats f
where t.name = 'QA Pedidos' and f.name = 'Maple';
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, 'QA Pack Pedidos', 20000
from public.egg_types t, public.formats f
where t.name = 'QA Pedidos' and f.name = 'Pack';

create function pg_temp.product_id(product_name text) returns bigint language sql as
  $$ select id from public.products where name = product_name $$;

-- An order of a client on a Monday morning slot, with the given status. Returns its id.
create function pg_temp.new_order(client uuid, order_status public.order_status default 'pending')
returns bigint language sql as $$
  insert into public.orders
    (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, total, address, address_notes)
  select client, s.id, current_date, s.starts_at, s.ends_at, order_status, 4000, 'Calle 1', 'Timbre B'
  from public.delivery_slots s
  where s.weekday = 1 and s.starts_at = '09:00'
  returning id;
$$;

-- Order rules
select pg_temp.new_order('00000000-0000-0000-0000-0000000004a1');
select is(
  (select status::text from public.orders where client_id = '00000000-0000-0000-0000-0000000004a1'),
  'pending', 'a new order starts pending'
);
select throws_ok(
  $$ insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address)
     select '00000000-0000-0000-0000-0000000004b2', id, current_date, starts_at, ends_at, 0, 'Calle 1'
     from public.delivery_slots where weekday = 1 and starts_at = '09:00' $$,
  '23514', null, 'a total of 0 is rejected'
);
select throws_ok(
  $$ insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address)
     select '00000000-0000-0000-0000-0000000004b2', id, current_date, starts_at, ends_at, 4000, null
     from public.delivery_slots where weekday = 1 and starts_at = '09:00' $$,
  -- Spec 008: the address may be null for a counter sale, so the check orders_counter_sale (23514) asks it.
  '23514', null, 'an order needs the delivery address'
);

-- RF-27: one active order per client
select throws_ok(
  $$ select pg_temp.new_order('00000000-0000-0000-0000-0000000004a1') $$,
  '23505', null, 'RF-27: a client cannot have two active orders'
);
select throws_ok(
  $$ select pg_temp.new_order('00000000-0000-0000-0000-0000000004a1', 'on_the_way') $$,
  '23505', null, 'RF-27: on_the_way also counts as active'
);
select lives_ok(
  $$ select pg_temp.new_order('00000000-0000-0000-0000-0000000004b2') $$,
  'RF-27: another client can have an active order at the same time'
);
select lives_ok(
  $$ select pg_temp.new_order('00000000-0000-0000-0000-0000000004a1', 'delivered') $$,
  'RF-27: a delivered order is not active'
);
select lives_ok(
  $$ update public.orders set status = 'cancelled', status_reason = 'QA', cancelled_by = 'admin'
     where client_id = '00000000-0000-0000-0000-0000000004a1' and status = 'pending' $$,
  'the active order is cancelled'
);
select lives_ok(
  $$ select pg_temp.new_order('00000000-0000-0000-0000-0000000004a1') $$,
  'RF-27: after cancelling, the client can have a new active order'
);

-- updated_at follows changes
update public.orders set updated_at = '2000-01-01' where client_id = '00000000-0000-0000-0000-0000000004b2';
update public.orders set status = 'accepted' where client_id = '00000000-0000-0000-0000-0000000004b2';
select is(
  (select updated_at from public.orders where client_id = '00000000-0000-0000-0000-0000000004b2'),
  now(), 'updated_at changes with the order'
);

-- RF-29, RF-37: order lines
create function pg_temp.active_order(client uuid) returns bigint language sql as $$
  select id from public.orders
  where client_id = client and status in ('pending', 'accepted', 'on_the_way')
$$;
select lives_ok(
  $$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
     values (pg_temp.active_order('00000000-0000-0000-0000-0000000004a1'), pg_temp.product_id('QA Maple Pedidos'), 5, 4000, 30) $$,
  'RF-29: 5 units of a product are accepted'
);
select throws_ok(
  $$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
     values (pg_temp.active_order('00000000-0000-0000-0000-0000000004a1'), pg_temp.product_id('QA Pack Pedidos'), 100, 20000, 180) $$,
  -- Spec 008: a line takes up to 99 units (a counter sale); the 5 of the Shop is create_order's (RF-29).
  '23514', null, 'a line takes at most 99 units'
);
select throws_ok(
  $$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
     values (pg_temp.active_order('00000000-0000-0000-0000-0000000004a1'), pg_temp.product_id('QA Pack Pedidos'), 0, 20000, 180) $$,
  '23514', null, 'RF-29: 0 units are rejected'
);
select throws_ok(
  $$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
     values (pg_temp.active_order('00000000-0000-0000-0000-0000000004a1'), pg_temp.product_id('QA Maple Pedidos'), 1, 4000, 30) $$,
  '23505', null, 'RF-29: a product is not repeated in an order'
);
select throws_ok(
  $$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
     values (pg_temp.active_order('00000000-0000-0000-0000-0000000004a1'), pg_temp.product_id('QA Pack Pedidos'), 1, 0, 180) $$,
  '23514', null, 'a line keeps a price above 0'
);
select throws_ok(
  $$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
     values (pg_temp.active_order('00000000-0000-0000-0000-0000000004a1'), pg_temp.product_id('QA Pack Pedidos'), 1, 20000, 0) $$,
  '23514', null, 'RF-37: a line keeps its eggs per unit, above 0'
);
select throws_ok(
  $$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
     values (pg_temp.active_order('00000000-0000-0000-0000-0000000004a1'), pg_temp.product_id('QA Pack Pedidos'), 1, 20000, null) $$,
  '23502', null, 'RF-37: the eggs per unit are required'
);

-- RF-37: changing the format later does not change what a line kept
update public.formats set eggs = 24 where name = 'Maple';
select is(
  (select unit_eggs from public.order_items where product_id = pg_temp.product_id('QA Maple Pedidos')),
  30, 'RF-37: a line keeps the eggs per unit it was created with'
);
update public.formats set eggs = 30 where name = 'Maple';

-- Principle 7: nothing referenced is deleted (no cascade)
select throws_ok(
  $$ delete from public.orders where id = pg_temp.active_order('00000000-0000-0000-0000-0000000004a1') $$,
  '23503', null, 'an order with lines cannot be deleted'
);
select throws_ok(
  $$ delete from public.products where id = pg_temp.product_id('QA Maple Pedidos') $$,
  '23503', null, 'a product in an order cannot be deleted'
);
select throws_ok(
  $$ delete from public.delivery_slots where weekday = 1 and starts_at = '09:00' $$,
  '23503', null, 'a slot with orders cannot be deleted'
);
select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-0000-0000-0000000004a1' $$,
  '23503', null, 'a client with orders cannot be deleted'
);

select * from finish();
rollback;
