-- Spec 004 · T2: who reads orders, lines and the schedule, the reservations and the views that use them.
-- RF-5, RF-6, RF-7, RF-33, RF-34, RF-35, RF-37, RF-38. Each block switches to the role of the API caller
-- (anon or authenticated with the user's id in the JWT claims) and goes back with "reset role". The local
-- database may hold QA data: tests use a type and formats of their own, and the products are removed
-- inside this transaction (the rollback at the end brings them back).
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- Spec 009: how many slots the caller managed to change (a client's RLS hides them all).
create function pg_temp.raise_capacity() returns integer language plpgsql as $$
declare
  changed integer;
begin
  update public.delivery_slots set capacity = 100;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
grant execute on function pg_temp.raise_capacity() to authenticated;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000004a1', 'qa-rls-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000004b2', 'qa-rls-b@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000004c3', 'qa-rls-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000004c3';

truncate public.products cascade;
insert into public.egg_types (name, stock) values ('QA Reservas', 400);
insert into public.formats (name, eggs) values ('QA Bandeja', 10), ('QA Caja', 100);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, 'QA ' || f.name, f.eggs * 100
from public.egg_types t, public.formats f
where t.name = 'QA Reservas' and f.name in ('QA Bandeja', 'QA Caja');

create function pg_temp.product_id(product_name text) returns bigint language sql as
  $$ select id from public.products where name = product_name $$;
create function pg_temp.type_id() returns bigint language sql as
  $$ select id from public.egg_types where name = 'QA Reservas' $$;

-- An order with one or two lines (quantity × eggs per unit), as create_order will make it (T4).
create function pg_temp.new_order(client uuid, order_status public.order_status, lines jsonb)
returns void language plpgsql as $$
declare
  v_order bigint;
begin
  -- A cancellation of the admin always has a reason and says who (orders_cancel_reason, spec 005 and 006).
  insert into public.orders
    (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, status_reason, cancelled_by, total, address)
  select client, s.id, current_date + 1, s.starts_at, s.ends_at, order_status,
    case when order_status = 'cancelled' then 'QA' end,
    case when order_status = 'cancelled' then 'admin'::public.user_role end, 1000, 'Calle 1'
  from public.delivery_slots s where s.weekday = 1 and s.starts_at = '09:00'
  returning id into v_order;
  insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
  select v_order, pg_temp.product_id(line ->> 'product'), (line ->> 'quantity')::int, 1000, (line ->> 'eggs')::int
  from jsonb_array_elements(lines) as line;
end;
$$;

-- Client A: one active order that reserves 3 × 10 + 2 × 100 = 230 eggs.
select pg_temp.new_order('00000000-0000-0000-0000-0000000004a1', 'pending',
  '[{"product": "QA QA Bandeja", "quantity": 3, "eggs": 10}, {"product": "QA QA Caja", "quantity": 2, "eggs": 100}]');
-- Client B: an active order of 100 eggs, and three that reserve nothing.
select pg_temp.new_order('00000000-0000-0000-0000-0000000004b2', 'accepted', '[{"product": "QA QA Caja", "quantity": 1, "eggs": 100}]');
select pg_temp.new_order('00000000-0000-0000-0000-0000000004b2', 'delivered', '[{"product": "QA QA Bandeja", "quantity": 5, "eggs": 10}]');
select pg_temp.new_order('00000000-0000-0000-0000-0000000004b2', 'cancelled', '[{"product": "QA QA Caja", "quantity": 5, "eggs": 100}]');
select pg_temp.new_order('00000000-0000-0000-0000-0000000004b2', 'rejected', '[{"product": "QA QA Caja", "quantity": 5, "eggs": 100}]');
-- Reserved: 230 + 100 = 330 of 400, so 70 eggs left: 7 trays of 10 and 0 boxes of 100.

-- anon: no access at all
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok($$ select * from public.delivery_slots $$, '42501', null, 'anon cannot read the schedule');
select throws_ok($$ select * from public.orders $$, '42501', null, 'anon cannot read orders');
select throws_ok($$ select * from public.order_items $$, '42501', null, 'anon cannot read order lines');
select throws_ok($$ select * from public.egg_type_reservations $$, '42501', null, 'anon cannot read reservations');
select throws_ok($$ select * from public.egg_type_overview $$, '42501', null, 'anon cannot read the stock overview');

-- Client A
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004a1", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.orders), 1, 'RF-34: client A reads its own order'
);
select is_empty(
  $$ select * from public.orders where client_id = '00000000-0000-0000-0000-0000000004b2' $$,
  'RF-34: client A does not read the orders of client B'
);
select is((select count(*)::int from public.order_items), 2, 'RF-34: client A reads only the lines of its order');
select is_empty($$ select * from public.delivery_slots $$, 'RF-35: a client does not read the schedule table');
select is_empty($$ select * from public.egg_type_overview $$, 'RF-38: a client does not read the stock overview');
select is_empty($$ select * from public.egg_type_reservations $$, 'RF-35: a client reads no reservations');

select results_eq(
  $$ select name, units_available, available from public.shop_products() where name like 'QA %' order by name $$,
  $$ values ('QA QA Bandeja'::text, 7, true), ('QA QA Caja', 0, false) $$,
  'RF-5, RF-6: the shop gives the units left after the active orders of every client'
);

select throws_ok(
  $$ insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address)
     select '00000000-0000-0000-0000-0000000004a1', id, current_date + 1, starts_at, ends_at, 1, 'Calle 1'
     from public.delivery_slots limit 1 $$,
  '42501', null, 'RF-33: a client cannot insert orders directly'
);
select throws_ok(
  $$ update public.orders set total = 1 $$,
  '42501', null, 'RF-33: a client cannot change its order (price, total or status)'
);
select throws_ok(
  $$ delete from public.orders $$,
  '42501', null, 'RF-33: a client cannot delete orders'
);
select throws_ok(
  $$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
     select id, pg_temp.product_id('QA QA Bandeja'), 1, 1, 1 from public.orders limit 1 $$,
  '42501', null, 'RF-33: a client cannot add lines to an order'
);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '10:00', '11:00', 5) $$,
  '42501', null, 'RF-35: a client cannot create slots'
);
-- Spec 009: the admin may now update slots; a client still cannot, and its RLS hides every slot.
select is(
  pg_temp.raise_capacity(),
  0,
  'RF-35: a client cannot change the capacity of a slot'
);

-- Client B
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004b2", "role": "authenticated"}', true);

select is((select count(*)::int from public.orders), 4, 'RF-34: client B reads its four orders');
select is_empty(
  $$ select * from public.order_items i join public.orders o on o.id = i.order_id
     where o.client_id = '00000000-0000-0000-0000-0000000004a1' $$,
  'RF-34: client B does not read the lines of client A'
);

-- Admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004c3", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.orders
   where client_id in ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004b2')),
  5, 'RF-34: the admin reads every order'
);
select is(
  (select count(*)::int from public.order_items i join public.orders o on o.id = i.order_id
   where o.client_id in ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004b2')),
  6, 'RF-34: the admin reads every line'
);
select ok((select count(*) from public.delivery_slots) >= 12, 'the admin reads the schedule');
select is(
  (select reserved_eggs from public.egg_type_reservations where egg_type_id = pg_temp.type_id()),
  330, 'RF-6: only pending, accepted and on_the_way orders reserve (delivered, cancelled and rejected do not)'
);
select results_eq(
  $$ select name, units_available from public.product_overview where name like 'QA %' order by name $$,
  $$ values ('QA QA Bandeja'::text, 7), ('QA QA Caja', 0) $$,
  'RF-7: the admin list gives the units left after the reservations'
);
select results_eq(
  $$ select stock, reserved_eggs, shortfall from public.egg_type_overview where id = pg_temp.type_id() $$,
  $$ values (400, 330, 0) $$,
  'RF-38: the stock overview gives the stock, the reserved eggs and no shortfall'
);
select throws_ok(
  $$ insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address)
     select '00000000-0000-0000-0000-0000000004c3', id, current_date + 1, starts_at, ends_at, 1, 'Calle 1'
     from public.delivery_slots limit 1 $$,
  '42501', null, 'RF-33: the admin cannot insert orders directly either'
);
-- Spec 009 changes this rule on purpose: the admin edits the schedule (its own tests are delivery_schedule).
select lives_ok(
  $$ update public.delivery_slots set capacity = capacity $$,
  'spec 009: the admin changes the schedule through the API'
);

-- RF-38: a breakage can leave the stock below what is reserved
select lives_ok(
  $$ select public.adjust_stock(pg_temp.type_id(), 100, 'Rotura') $$,
  'RF-38: an adjustment below the reserved eggs is saved'
);
select results_eq(
  $$ select stock, reserved_eggs, shortfall from public.egg_type_overview where id = pg_temp.type_id() $$,
  $$ values (300, 330, 30) $$,
  'RF-38: the overview shows the 30 eggs missing for the active orders'
);
select results_eq(
  $$ select name, units_available from public.product_overview where name like 'QA %' order by name $$,
  $$ values ('QA QA Bandeja'::text, 0), ('QA QA Caja', 0) $$,
  'RF-38: with a shortfall, the products of the type have 0 units (never negative)'
);

-- RF-37: changing the eggs of a format later does not change what an order reserves
reset role;
update public.formats set eggs = 12 where name = 'QA Bandeja';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004c3", "role": "authenticated"}', true);
select is(
  (select reserved_eggs from public.egg_type_reservations where egg_type_id = pg_temp.type_id()),
  330, 'RF-37: reservations use the eggs per unit kept by each line'
);

select * from finish();
rollback;
