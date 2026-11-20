-- Spec 005: the status changes of an order. T1: the columns and rules they need (RF-14, RF-16, RF-18).
-- T2: set_order_status, the only way to change them (RF-11 to RF-18, RF-21, RF-22, RF-26). Runs as the table owner unless a block switches role. The local
-- database may hold QA data: products and orders are removed inside this transaction, and the rollback
-- at the end brings them back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(61);

truncate public.products cascade;
truncate public.orders cascade;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000005a1', 'qa-status-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000005c3', 'qa-status-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000005c3';

insert into public.egg_types (name, stock) values ('QA Estados', 300);
insert into public.formats (name, eggs) values ('QA Bandeja', 10);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, 'QA Bandeja Estados', 1000
from public.egg_types t, public.formats f where t.name = 'QA Estados' and f.name = 'QA Bandeja';

create function pg_temp.type_id() returns bigint language sql as
  $$ select id from public.egg_types where name = 'QA Estados' $$;

-- A pending order of client A with 3 trays (30 eggs).
insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address)
select '00000000-0000-0000-0000-0000000005a1', s.id, current_date + 1, s.starts_at, s.ends_at, 3000, 'Calle 1'
from public.delivery_slots s where s.weekday = 1 and s.starts_at = '09:00';
insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
select o.id, p.id, 3, 1000, 10 from public.orders o, public.products p where p.name = 'QA Bandeja Estados';

create function pg_temp.order_id() returns bigint language sql as
  $$ select id from public.orders where client_id = '00000000-0000-0000-0000-0000000005a1' $$;

-- Schema
select has_column('public', 'orders', 'status_reason', 'orders has the reason of a rejection or cancellation');
select has_column('public', 'orders', 'accepted_at', 'orders has when it was accepted');
select has_column('public', 'orders', 'on_the_way_at', 'orders has when it went on the way');
select has_column('public', 'orders', 'delivered_at', 'orders has when it was delivered');
select has_column('public', 'orders', 'rejected_at', 'orders has when it was rejected');
select has_column('public', 'orders', 'cancelled_at', 'orders has when it was cancelled');
select has_column('public', 'stock_movements', 'order_id', 'a stock movement can point to an order');
select enum_has_labels(
  'public', 'stock_movement_kind', array['load', 'adjustment', 'sale'],
  'RF-14: a stock movement can be a sale'
);

-- RF-18: a new order has none of the later dates
select results_eq(
  $$ select accepted_at, on_the_way_at, delivered_at, rejected_at, cancelled_at from public.orders where id = pg_temp.order_id() $$,
  $$ values (null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz) $$,
  'RF-18: the dates of the later states start empty'
);

-- RF-16: the reason
select throws_ok(
  $$ update public.orders set status = 'rejected', status_reason = repeat('m', 121) where id = pg_temp.order_id() $$,
  '23514', null, 'RF-16: a reason of 121 characters is rejected'
);
select throws_ok(
  $$ update public.orders set status = 'rejected', status_reason = '' where id = pg_temp.order_id() $$,
  '23514', null, 'RF-16: an empty text is never stored as a reason'
);
select lives_ok(
  $$ update public.orders set status = 'rejected', status_reason = repeat('m', 120) where id = pg_temp.order_id() $$,
  'RF-16: a reason of 120 characters is accepted'
);
select throws_ok(
  $$ update public.orders set status = 'cancelled', status_reason = null, cancelled_by = 'admin' where id = pg_temp.order_id() $$,
  '23514', null, 'RF-15, RF-16: a cancellation of the admin always has a reason (spec 006: the client''s has none)'
);
select lives_ok(
  $$ update public.orders set status = 'cancelled', status_reason = 'No estaba nadie', cancelled_by = 'admin' where id = pg_temp.order_id() $$,
  'RF-15: a cancelled order with its reason is accepted'
);

-- RF-14: sale movements
create function pg_temp.movement(movement_kind public.stock_movement_kind, packs int, note text, with_order boolean)
returns void language sql as $$
  insert into public.stock_movements (egg_type_id, kind, eggs, packs, note, order_id, created_by)
  values (pg_temp.type_id(), movement_kind, 30, packs, note,
          case when with_order then pg_temp.order_id() end, '00000000-0000-0000-0000-0000000005c3');
$$;
select throws_ok(
  $$ select pg_temp.movement('sale', null, null, false) $$,
  '23514', null, 'RF-14: a sale always points to its order'
);
select throws_ok(
  $$ select pg_temp.movement('sale', 1, null, true) $$,
  '23514', null, 'RF-14: a sale has no packs'
);
select throws_ok(
  $$ select pg_temp.movement('sale', null, 'Nota', true) $$,
  '23514', null, 'RF-14: a sale has no note'
);
select throws_ok(
  $$ select pg_temp.movement('adjustment', null, 'Rotura', true) $$,
  '23514', null, 'only a sale points to an order'
);
select lives_ok(
  $$ select pg_temp.movement('sale', null, null, true) $$,
  'RF-14: a sale with its order is accepted'
);


-- T2: set_order_status. Fixtures as the owner: four QA types, one product each (10 eggs per unit) and
-- one order per client in the state each test needs.
-- Type D sells boxes of 30 eggs, so two orders of 3 boxes reserve 90 eggs each.
insert into public.egg_types (name, stock) values ('QA Estados B', 25), ('QA Estados C', 1000), ('QA Estados D', 150);
insert into public.formats (name, eggs) values ('QA Caja Estados', 30);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, 'QA Bandeja ' || t.name, 1000
from public.egg_types t, public.formats f
where (t.name in ('QA Estados B', 'QA Estados C') and f.name = 'QA Bandeja')
   or (t.name = 'QA Estados D' and f.name = 'QA Caja Estados');

create function pg_temp.stock(type_name text) returns int language sql as
  $$ select stock from public.egg_types where name = type_name $$;
create function pg_temp.reserved(type_name text) returns int language sql as $$
  select coalesce(sum(i.quantity * i.unit_eggs), 0)::int
  from public.order_items i
  join public.orders o on o.id = i.order_id
  join public.products p on p.id = i.product_id
  join public.egg_types t on t.id = p.egg_type_id
  where t.name = type_name and o.status in ('pending', 'accepted', 'on_the_way')
$$;

-- An order of client n (a new client each) in a state, with lines as [[type name, units], …]; each
-- line keeps the eggs per unit of its product's format.
create function pg_temp.new_order(n int, order_status public.order_status, lines text[][]) returns bigint
language plpgsql as $$
declare
  v_client uuid := ('00000000-0000-0000-0000-0000000005b' || lpad(n::text, 1, '0'))::uuid;
  v_order bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (v_client, 'qa-status-' || n || '@example.com',
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}')
  on conflict (id) do nothing;
  insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, total, address)
  select v_client, s.id, current_date + 1, s.starts_at, s.ends_at, order_status, 1000, 'Calle 1'
  from public.delivery_slots s where s.weekday = 2 and s.starts_at = '09:00'
  returning id into v_order;
  for i in 1 .. array_length(lines, 1) loop
    insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
    select v_order, p.id, lines[i][2]::int, 1000, f.eggs
    from public.products p
    join public.egg_types t on t.id = p.egg_type_id
    join public.formats f on f.id = p.format_id
    where t.name = lines[i][1] and p.name like 'QA Bandeja %';
  end loop;
  return v_order;
end;
$$;

create temp table qa_orders (n int primary key, id bigint);
grant select on qa_orders to authenticated, anon;
insert into qa_orders values
  (1, pg_temp.new_order(1, 'pending', array[['QA Estados', '3'], ['QA Estados C', '2']])),
  (2, pg_temp.new_order(2, 'pending', array[['QA Estados', '2']])),
  (3, pg_temp.new_order(3, 'pending', array[['QA Estados', '1']])),
  (4, pg_temp.new_order(4, 'accepted', array[['QA Estados', '4']])),
  (5, pg_temp.new_order(5, 'on_the_way', array[['QA Estados', '5']])),
  (6, pg_temp.new_order(6, 'pending', array[['QA Estados', '1']])),
  (7, pg_temp.new_order(7, 'delivered', array[['QA Estados', '1']])),
  (8, pg_temp.new_order(8, 'on_the_way', array[['QA Estados B', '3']])),
  (9, pg_temp.new_order(9, 'on_the_way', array[['QA Estados D', '3']]));
-- Client 0 is the second order of type D: 90 + 90 eggs reserved with 150 in stock.
insert into qa_orders values (0, pg_temp.new_order(0, 'on_the_way', array[['QA Estados D', '3']]));

create function pg_temp.o(n int) returns bigint language sql as $$ select id from pg_temp.qa_orders where qa_orders.n = $1 $$;
create function pg_temp.status_of(n int) returns text language sql as
  $$ select status::text from public.orders where id = pg_temp.o(n) $$;
-- The message and hint of the error a statement raises, as "message | hint".
create function pg_temp.error_of(statement text) returns text language plpgsql as $$
declare
  v_message text;
  v_hint text;
begin
  execute statement;
  return 'no error';
exception when others then
  get stacked diagnostics v_message = message_text, v_hint = pg_exception_hint;
  return v_message || ' | ' || coalesce(v_hint, '');
end;
$$;

-- RF-21: as the admin from here on
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005c3", "role": "authenticated"}', true);

-- RF-11, RF-13, RF-14, RF-18: the way of an order
select is(public.set_order_status(pg_temp.o(1), 'accepted', 'se ignora'), 'accepted'::public.order_status,
  'RF-11: the admin accepts a pending order');
select results_eq(
  $$ select accepted_at, status_reason from public.orders where id = pg_temp.o(1) $$,
  $$ values (now(), null::text) $$,
  'RF-18: accepting keeps its date, and a reason is ignored outside a rejection or a cancellation'
);
select is(public.set_order_status(pg_temp.o(1), 'on_the_way'), 'on_the_way'::public.order_status,
  'RF-13: the admin marks it on the way');
select is((select on_the_way_at from public.orders where id = pg_temp.o(1)), now(), 'RF-18: with its date');

select is(pg_temp.reserved('QA Estados'), 160, 'before delivering, the active orders reserve 160 eggs of QA Estados');
select is(public.set_order_status(pg_temp.o(1), 'delivered'), 'delivered'::public.order_status,
  'RF-14: the admin marks it delivered');
select results_eq(
  $$ select pg_temp.stock('QA Estados'), pg_temp.stock('QA Estados C'), pg_temp.reserved('QA Estados') $$,
  $$ values (270, 980, 130) $$,
  'RF-14: delivering subtracts its eggs from each type and stops reserving them'
);
select results_eq(
  $$ select t.name, m.eggs, m.kind::text from public.stock_movements m join public.egg_types t on t.id = m.egg_type_id
     where m.order_id = pg_temp.o(1) order by t.name $$,
  $$ values ('QA Estados'::text, 30, 'sale'::text), ('QA Estados C', 20, 'sale') $$,
  'RF-14: one sale movement per type, with the eggs and the order'
);
select is((select delivered_at from public.orders where id = pg_temp.o(1)), now(), 'RF-18: delivered with its date');

select is(
  pg_temp.error_of($$ select public.set_order_status(pg_temp.o(1), 'delivered') $$),
  'order_changed | delivered',
  'RF-17: a second "Entregado" says the order changed'
);
select results_eq(
  $$ select pg_temp.stock('QA Estados'), (select count(*)::int from public.stock_movements where order_id = pg_temp.o(1)) $$,
  $$ values (270, 2) $$,
  'RF-17: and the stock went down only once'
);

-- RF-12: rejecting
select is(public.set_order_status(pg_temp.o(2), 'rejected'), 'rejected'::public.order_status,
  'RF-12: the admin rejects without a reason');
select results_eq(
  $$ select status_reason, rejected_at, pg_temp.reserved('QA Estados'), pg_temp.stock('QA Estados') from public.orders where id = pg_temp.o(2) $$,
  $$ values (null::text, now(), 110, 270) $$,
  'RF-12: no reason, its date, its 20 eggs no longer reserved and the stock untouched'
);
select is(public.set_order_status(pg_temp.o(3), 'rejected', '   '), 'rejected'::public.order_status,
  'RF-12: a blank reason counts as no reason');
select is(
  pg_temp.error_of($$ select public.set_order_status(pg_temp.o(6), 'rejected', repeat('m', 121)) $$),
  'reason_too_long | ',
  'RF-16: a rejection with a reason of 121 characters is refused'
);
select is(public.set_order_status(pg_temp.o(6), 'rejected', '  Fuera de zona  '), 'rejected'::public.order_status,
  'RF-12: the admin rejects with a reason');
select is((select status_reason from public.orders where id = pg_temp.o(6)), 'Fuera de zona',
  'RF-12: the reason is kept trimmed');
select is(
  (select count(*)::int from public.orders where delivery_slot_id = (select delivery_slot_id from public.orders where id = pg_temp.o(6))
     and delivery_date = current_date + 1 and status not in ('rejected', 'cancelled')
     and client_id::text like '00000000-0000-0000-0000-0000000005b%'),
  7, 'RF-12: rejected orders free their place in the slot (3 rejected: 7 of the 10 QA orders still take one)'
);

-- RF-15, RF-16: cancelling
select is(
  pg_temp.error_of($$ select public.set_order_status(pg_temp.o(4), 'cancelled') $$),
  'reason_required | ',
  'RF-16: cancelling without a reason is refused'
);
select is(
  pg_temp.error_of($$ select public.set_order_status(pg_temp.o(4), 'cancelled', '  ') $$),
  'reason_required | ',
  'RF-16: a blank reason does not count when cancelling'
);
select is(
  pg_temp.error_of($$ select public.set_order_status(pg_temp.o(4), 'cancelled', repeat('m', 121)) $$),
  'reason_too_long | ',
  'RF-16: a reason of 121 characters is refused'
);
select is(pg_temp.status_of(4), 'accepted', 'RF-16: a refused cancellation leaves the order as it was');
select is(public.set_order_status(pg_temp.o(4), 'cancelled', 'Pidió cancelar'), 'cancelled'::public.order_status,
  'RF-15: the admin cancels an accepted order with a reason');
select is(public.set_order_status(pg_temp.o(5), 'cancelled', 'No estaba nadie'), 'cancelled'::public.order_status,
  'RF-15: the admin cancels an order on the way with a reason');
select results_eq(
  $$ select o.status_reason, o.cancelled_at, o.cancelled_by::text, pg_temp.reserved('QA Estados'), pg_temp.stock('QA Estados')
     from public.orders o where o.id = pg_temp.o(5) $$,
  $$ values ('No estaba nadie'::text, now(), 'admin'::text, 0, 270) $$,
  'RF-15: reason, date and who cancelled (spec 006) kept, nothing reserved any more and the stock untouched'
);

-- RF-17, RF-22: only the transitions of the admin
select is(pg_temp.error_of($$ select public.set_order_status(pg_temp.o(4), 'accepted') $$), 'order_changed | cancelled',
  'RF-22: a cancelled order does not come back');
select is(pg_temp.error_of($$ select public.set_order_status(pg_temp.o(7), 'cancelled', 'x') $$), 'order_changed | delivered',
  'RF-22: a delivered order is final');
select is(pg_temp.error_of($$ select public.set_order_status(pg_temp.o(2), 'accepted') $$), 'order_changed | rejected',
  'RF-17: a rejected order cannot be accepted (for example, opened before the change)');
select is(pg_temp.error_of($$ select public.set_order_status(pg_temp.o(9), 'accepted') $$), 'order_changed | on_the_way',
  'RF-22: an order does not go back');
select is(pg_temp.error_of($$ select public.set_order_status(pg_temp.o(3), 'pending') $$), 'order_changed | rejected',
  'RF-22: nothing goes back to pending');
select is(pg_temp.error_of($$ select public.set_order_status(-1, 'accepted') $$), 'order_changed | ',
  'RF-17: an order that does not exist');

-- Transitions that skip a step or that are the client's, on a fresh pending order
reset role;
insert into qa_orders values (10, pg_temp.new_order(5, 'pending', array[['QA Estados', '1']]));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005c3", "role": "authenticated"}', true);
select is(pg_temp.error_of($$ select public.set_order_status(pg_temp.o(10), 'on_the_way') $$), 'order_changed | pending',
  'RF-22: a pending order is not put on the way without being accepted');
select is(pg_temp.error_of($$ select public.set_order_status(pg_temp.o(10), 'delivered') $$), 'order_changed | pending',
  'RF-22: a pending order is not delivered without being accepted');
select is(pg_temp.error_of($$ select public.set_order_status(pg_temp.o(10), 'cancelled', 'x') $$), 'order_changed | pending',
  'RF-22: the admin rejects a pending order; cancelling it is the client''s (spec 006)');

-- RF-26: delivering needs the eggs of that order
select is(
  pg_temp.error_of($$ select public.set_order_status(pg_temp.o(8), 'delivered') $$),
  'not_enough_stock | 5|QA Estados B',
  'RF-26: 30 eggs with 25 in stock: 5 eggs missing of that type'
);
select results_eq(
  $$ select pg_temp.status_of(8), pg_temp.stock('QA Estados B'),
            (select count(*)::int from public.stock_movements where order_id = pg_temp.o(8)) $$,
  $$ values ('on_the_way'::text, 25, 0) $$,
  'RF-26: and nothing changed'
);
select is(public.set_order_status(pg_temp.o(9), 'delivered'), 'delivered'::public.order_status,
  'RF-26: with 150 eggs and two orders of 90, the first is delivered');
select is(
  pg_temp.error_of($$ select public.set_order_status(pg_temp.o(0), 'delivered') $$),
  'not_enough_stock | 30|QA Estados D',
  'RF-26: and the second says 30 eggs are missing'
);
select is(pg_temp.stock('QA Estados D'), 60, 'the stock never goes below 0');

-- RF-21, RF-22: nobody else, and never by hand
select throws_ok(
  $$ update public.orders set status = 'accepted' where id = pg_temp.o(10) $$,
  '42501', null, 'RF-22: not even the admin changes an order by hand'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.set_order_status(pg_temp.o(10), 'accepted') $$,
  '42501', null, 'RF-21: a client cannot change the status of an order'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.set_order_status(pg_temp.o(10), 'accepted') $$,
  '42501', null, 'RF-21: anon cannot change the status of an order'
);

select * from finish();
rollback;
