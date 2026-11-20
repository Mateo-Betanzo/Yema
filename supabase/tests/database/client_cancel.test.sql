-- Spec 006 · T1: who cancelled an order and the cancellation of the client (RF-7, RF-8, RF-29, RF-30).
-- Runs as the table owner unless a block switches role. The local database may hold QA data: products
-- and orders are removed inside this transaction, and the rollback at the end brings them back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

truncate public.products cascade;
truncate public.orders cascade;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
-- Client A, client B, the admin and four more clients that fill A's slot.
select pg_temp.sign_up('00000000-0000-0000-0000-0000000006a1', 'qa-cancel-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000006b1', 'qa-cancel-b@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000006c3', 'qa-cancel-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000006c3';
select pg_temp.sign_up(('00000000-0000-0000-0000-0000000006d' || n)::uuid, 'qa-cancel-' || n || '@example.com')
from generate_series(1, 5) as n;

insert into public.egg_types (name, stock) values ('QA Cancelar', 300);
insert into public.formats (name, eggs) values ('QA Bandeja Cancelar', 10);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, 'QA Bandeja Cancelar', 1000
from public.egg_types t, public.formats f where t.name = 'QA Cancelar' and f.name = 'QA Bandeja Cancelar';

-- A delivery day two to four days ahead that has slots (not a Sunday): inside the 7 delivery days and
-- far from the 2-hour limit, so delivery_options_at(now()) offers its slots.
create function pg_temp.day() returns date language sql as $$
  select d::date from generate_series(current_date + 2, current_date + 4, interval '1 day') d
  where extract(dow from d) <> 0 order by d limit 1
$$;
create function pg_temp.slot(starts text) returns bigint language sql as $$
  select id from public.delivery_slots where weekday = extract(dow from pg_temp.day()) and starts_at = starts::time
$$;

-- An order of a client in a state, at a slot of pg_temp.day(), with 2 trays (20 eggs).
create function pg_temp.new_order(client uuid, order_status public.order_status, starts text default '09:00')
returns bigint language plpgsql as $$
declare
  v_order bigint;
begin
  insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status,
                             total, address, status_reason, cancelled_by)
  select client, s.id, pg_temp.day(), s.starts_at, s.ends_at, order_status, 2000, 'Calle 1',
         case when order_status = 'cancelled' then 'No estaba nadie' end,
         case when order_status = 'cancelled' then 'admin'::public.user_role end
  from public.delivery_slots s where s.id = pg_temp.slot(starts)
  returning id into v_order;
  insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
  select v_order, p.id, 2, 1000, 10 from public.products p where p.name = 'QA Bandeja Cancelar';
  return v_order;
end;
$$;

create temp table qa_orders (name text primary key, id bigint);
grant select on qa_orders to authenticated, anon;
-- A's pending order and four more fill the 09:00 slot (capacity 5); B's goes at 18:00.
insert into qa_orders values
  ('a', pg_temp.new_order('00000000-0000-0000-0000-0000000006a1', 'pending')),
  ('b', pg_temp.new_order('00000000-0000-0000-0000-0000000006b1', 'pending', '18:00')),
  ('checks', pg_temp.new_order('00000000-0000-0000-0000-0000000006d5', 'pending', '18:00')),
  ('admin', pg_temp.new_order('00000000-0000-0000-0000-0000000006d1', 'accepted'));
select pg_temp.new_order(('00000000-0000-0000-0000-0000000006d' || n)::uuid, 'pending') from generate_series(2, 4) as n;

create function pg_temp.o(order_name text) returns bigint language sql as
  $$ select id from pg_temp.qa_orders where qa_orders.name = order_name $$;
create function pg_temp.status_of(order_name text) returns text language sql as
  $$ select status::text from public.orders where id = pg_temp.o(order_name) $$;
create function pg_temp.reserved() returns int language sql as $$
  select coalesce(reserved_eggs, 0) from public.egg_type_reservations r
  join public.egg_types t on t.id = r.egg_type_id where t.name = 'QA Cancelar'
$$;
create function pg_temp.slot_full() returns boolean language sql as $$
  select is_full from public.delivery_options_at(now()) where delivery_date = pg_temp.day() and slot_id = pg_temp.slot('09:00')
$$;
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
create function pg_temp.as_user(user_id text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub": "' || user_id || '", "role": "authenticated"}', true);
$$;

-- Schema
select has_column('public', 'orders', 'cancelled_by', 'orders keeps who cancelled it');
select col_type_is('public', 'orders', 'cancelled_by', 'user_role', 'RF-30: who cancelled is a role: client or admin');
select is((select cancelled_by::text from public.orders where id = pg_temp.o('a')), null, 'an order that is not cancelled has no one who cancelled it');

-- RF-30: the checks, on an order nobody else uses
select throws_ok(
  $$ update public.orders set status = 'cancelled', status_reason = 'x', cancelled_by = null where id = pg_temp.o('checks') $$,
  '23514', null, 'RF-30: a cancelled order always says who cancelled it'
);
select throws_ok(
  $$ update public.orders set cancelled_by = 'client' where id = pg_temp.o('checks') $$,
  '23514', null, 'RF-30: only a cancelled order says who cancelled it'
);
select throws_ok(
  $$ update public.orders set status = 'cancelled', status_reason = 'x', cancelled_by = 'client' where id = pg_temp.o('checks') $$,
  '23514', null, 'RF-30: a cancellation of the client has no reason'
);
select throws_ok(
  $$ update public.orders set status = 'cancelled', status_reason = null, cancelled_by = 'admin' where id = pg_temp.o('checks') $$,
  '23514', null, 'RF-30: a cancellation of the admin always has a reason'
);
select lives_ok(
  $$ update public.orders set status = 'cancelled', status_reason = null, cancelled_by = 'client' where id = pg_temp.o('checks') $$,
  'RF-30: a cancellation of the client without a reason is accepted'
);
select lives_ok(
  $$ update public.orders set status_reason = 'Pidió cancelar', cancelled_by = 'admin' where id = pg_temp.o('checks') $$,
  'RF-30: a cancellation of the admin with its reason is accepted'
);

-- RF-7: client A cancels its pending order
select results_eq(
  $$ select pg_temp.reserved(), pg_temp.slot_full() $$,
  $$ values (120, true) $$,
  'before: six active orders reserve 120 eggs and A''s slot is full'
);

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006a1');
select is(public.cancel_order(pg_temp.o('a')), 'cancelled'::public.order_status, 'RF-7: the client cancels its pending order');
select results_eq(
  $$ select status::text, cancelled_by::text, status_reason, cancelled_at from public.orders where id = pg_temp.o('a') $$,
  $$ values ('cancelled'::text, 'client'::text, null::text, now()) $$,
  'RF-7: cancelled by the client, with its date and without a reason'
);
select is(
  pg_temp.error_of($$ select public.cancel_order(pg_temp.o('a')) $$),
  'order_changed | cancelled',
  'RF-8: a second "Sí, cancelar" says the order changed'
);

reset role;
select results_eq(
  $$ select pg_temp.reserved(), pg_temp.slot_full(), (select stock from public.egg_types where name = 'QA Cancelar') $$,
  $$ values (100, false, 300) $$,
  'RF-7: its 20 eggs are no longer reserved, its place in the slot is free and the stock is untouched'
);

-- RF-29: never an order of someone else
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006a1');
select is(
  pg_temp.error_of($$ select public.cancel_order(pg_temp.o('b')) $$),
  'order_changed | ',
  'RF-29: A cannot cancel an order of B, and is not told its status'
);
select is(pg_temp.error_of($$ select public.cancel_order(-1) $$), 'order_changed | ', 'RF-29: an order that does not exist');
select throws_ok(
  $$ update public.orders set status = 'cancelled' where id = pg_temp.o('a') $$,
  '42501', null, 'RF-29: the client never changes an order by hand'
);
reset role;
select is(pg_temp.status_of('b'), 'pending', 'RF-29: B''s order did not change');

-- RF-8, RF-29: only a pending order. A gets a new order and it moves along.
insert into qa_orders values ('a2', pg_temp.new_order('00000000-0000-0000-0000-0000000006a1', 'accepted'));
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006a1');
select is(pg_temp.error_of($$ select public.cancel_order(pg_temp.o('a2')) $$), 'order_changed | accepted',
  'RF-8: an accepted order cannot be cancelled by the client (the admin accepted it first)');
reset role;
update public.orders set status = 'on_the_way' where id = pg_temp.o('a2');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006a1');
select is(pg_temp.error_of($$ select public.cancel_order(pg_temp.o('a2')) $$), 'order_changed | on_the_way',
  'RF-29: nor one on the way');
reset role;
update public.orders set status = 'delivered' where id = pg_temp.o('a2');
insert into qa_orders values
  ('a3', pg_temp.new_order('00000000-0000-0000-0000-0000000006a1', 'rejected')),
  ('a4', pg_temp.new_order('00000000-0000-0000-0000-0000000006a1', 'cancelled'));
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006a1');
select is(pg_temp.error_of($$ select public.cancel_order(pg_temp.o('a2')) $$), 'order_changed | delivered',
  'RF-29: nor a delivered one');
select is(pg_temp.error_of($$ select public.cancel_order(pg_temp.o('a3')) $$), 'order_changed | rejected',
  'RF-29: nor a rejected one');
select is(pg_temp.error_of($$ select public.cancel_order(pg_temp.o('a4')) $$), 'order_changed | cancelled',
  'RF-29: nor one the admin cancelled');
reset role;
select results_eq(
  $$ select pg_temp.status_of('a2'), pg_temp.status_of('a3'), pg_temp.status_of('a4'),
            (select cancelled_by::text from public.orders where id = pg_temp.o('a4')) $$,
  $$ values ('delivered'::text, 'rejected'::text, 'cancelled'::text, 'admin'::text) $$,
  'RF-29: and none of them changed'
);

-- RF-29: the admin rejects a pending order; it does not use the cancellation of the client
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006c3');
select throws_ok(
  $$ select public.cancel_order(pg_temp.o('b')) $$,
  '42501', null, 'RF-29: the admin cannot use the cancellation of the client'
);

-- RF-30: the cancellation of the admin keeps its reason and says it was the admin
select is(
  pg_temp.error_of($$ select public.set_order_status(pg_temp.o('admin'), 'cancelled') $$),
  'reason_required | ',
  'RF-30: the admin still cancels only with a reason'
);
select is(public.set_order_status(pg_temp.o('admin'), 'cancelled', 'No estaba nadie'), 'cancelled'::public.order_status,
  'RF-30: the admin cancels an accepted order with a reason');
select results_eq(
  $$ select cancelled_by::text, status_reason from public.orders where id = pg_temp.o('admin') $$,
  $$ values ('admin'::text, 'No estaba nadie'::text) $$,
  'RF-30: cancelled by the admin, with its reason'
);
select is(public.set_order_status(pg_temp.o('b'), 'rejected'), 'rejected'::public.order_status,
  'RF-29: the admin rejects B''s pending order instead');
select is((select cancelled_by::text from public.orders where id = pg_temp.o('b')), null,
  'a rejection does not say who cancelled');

-- RF-29: anon cannot call it
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.cancel_order(pg_temp.o('b')) $$,
  '42501', null, 'RF-29: anon cannot cancel an order'
);
reset role;
select ok(
  (select prosecdef from pg_proc where oid = 'public.cancel_order(bigint)'::regprocedure),
  'cancel_order runs as its owner, so the client needs no update on orders'
);
select ok(
  not has_function_privilege('anon', 'public.cancel_order(bigint)', 'execute')
  and has_function_privilege('authenticated', 'public.cancel_order(bigint)', 'execute'),
  'RF-29: only signed-in users can execute cancel_order'
);

select * from finish();
rollback;
