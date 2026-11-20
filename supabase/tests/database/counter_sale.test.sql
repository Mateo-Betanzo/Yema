-- Spec 008 · T1: a counter sale is an order (RF-6, RF-10, RF-11, RF-18, RF-20). It has no client, slot,
-- day, hours nor address, it is born delivered and its name is optional; an order of the app keeps all
-- of that and no loose name. A line takes up to 99 units (the 5 of the Shop stays in create_order). The
-- rules of what is available and of a delivery live in two internal functions that create_order,
-- set_order_status and create_counter_sale share; their own tests keep proving the first two. The local
-- database may hold QA data: catalog and orders are removed inside this transaction.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

truncate public.egg_types, public.orders cascade;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000009a1', 'qa-counter-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000009b1', 'qa-counter-b@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000009c1', 'qa-counter-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000009c1';

insert into public.egg_types (name, stock) values ('QA Medianos', 300), ('QA Viejos', 300);
update public.egg_types set active = false where name = 'QA Viejos';
insert into public.formats (name, eggs) values ('QA Maple', 30);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, 'QA Maple ' || t.name, 5000 from public.egg_types t, public.formats f where f.name = 'QA Maple';

create function pg_temp.product(product_name text) returns bigint language sql as
  $$ select id from public.products where name = product_name $$;
create function pg_temp.slot() returns bigint language sql as
  $$ select id from public.delivery_slots order by id limit 1 $$;

-- A counter sale as the RPC of T2 will leave it: delivered, no client nor slot, with an optional name.
create function pg_temp.counter_sale(name text) returns bigint language sql as $$
  insert into public.orders (counter_sale, status, delivered_at, total, customer_name)
  values (true, 'delivered', now(), 10000, name)
  returning id;
$$;
create temp table qa_orders (name text primary key, id bigint);
grant select on qa_orders to authenticated, anon;
insert into qa_orders values ('sale', pg_temp.counter_sale('Juan Gómez')), ('nameless', pg_temp.counter_sale(null));
create function pg_temp.o(order_name text) returns bigint language sql as
  $$ select id from pg_temp.qa_orders where qa_orders.name = order_name $$;

-- The shape of a counter sale (RF-6, RF-10, RF-18)
select ok(
  (select bool_and(counter_sale and client_id is null and delivery_slot_id is null and delivery_date is null
                   and slot_starts_at is null and slot_ends_at is null and address is null)
   from public.orders where id in (pg_temp.o('sale'), pg_temp.o('nameless'))),
  'RF-10, RF-18: a counter sale has no client, slot, day, hours nor address, with or without a name'
);
select throws_ok(
  $$ insert into public.orders (counter_sale, client_id, status, delivered_at, total)
     values (true, '00000000-0000-0000-0000-0000000009a1', 'delivered', now(), 1000) $$,
  '23514', null, 'a counter sale has no client'
);
select throws_ok(
  format($$ insert into public.orders (counter_sale, delivery_slot_id, status, delivered_at, total)
            values (true, %s, 'delivered', now(), 1000) $$, pg_temp.slot()),
  '23514', null, 'RF-18: a counter sale takes no slot'
);
select throws_ok(
  $$ insert into public.orders (counter_sale, status, total) values (true, 'pending', 1000) $$,
  '23514', null, 'RF-10: a counter sale is born delivered'
);
select throws_ok(
  $$ insert into public.orders (counter_sale, status, total) values (true, 'delivered', 1000) $$,
  '23514', null, 'RF-10: and with the moment it was delivered'
);
select throws_ok(
  format($$ insert into public.orders (delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address)
            values (%s, current_date, '09:00', '11:00', 1000, 'Calle 1') $$, pg_temp.slot()),
  '23514', null, 'an order of the app still needs its client'
);
select throws_ok(
  format($$ insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total,
                                       address, customer_name)
            values ('00000000-0000-0000-0000-0000000009a1', %s, current_date, '09:00', '11:00', 1000, 'Calle 1', 'Juan') $$,
         pg_temp.slot()),
  '23514', null, 'an order of the app has no loose name: its client is the profile'
);

-- The name (RF-6)
select throws_ok(
  $$ select pg_temp.counter_sale('') $$, '23514', null, 'RF-6: an empty name is no name (null), never empty text'
);
select throws_ok(
  $$ select pg_temp.counter_sale(repeat('a', 61)) $$, '23514', null, 'RF-6: a name has up to 60 characters'
);
select lives_ok(
  $$ select pg_temp.counter_sale(repeat('a', 60)) $$, 'RF-6: 60 characters are fine'
);

-- The units of a line (RF-3: up to 99; the 5 of the Shop stays in create_order)
select lives_ok(
  format($$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
            values (%s, %s, 99, 5000, 30) $$, pg_temp.o('sale'), pg_temp.product('QA Maple QA Medianos')),
  'RF-3: a line takes 99 units'
);
select throws_ok(
  format($$ insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
            values (%s, %s, 100, 5000, 30) $$, pg_temp.o('nameless'), pg_temp.product('QA Maple QA Medianos')),
  '23514', null, 'RF-3: but not 100'
);

-- The admin overview
select results_eq(
  format($$ select counter_sale, customer_name from public.admin_order_overview where id in (%s, %s) order by id $$,
         pg_temp.o('sale'), pg_temp.o('nameless')),
  $$ values (true, 'Juan Gómez'::text), (true, null::text) $$,
  'RF-15, RF-17: the admin overview says it is a counter sale and its name'
);

-- The shared rules (RF-10, RF-11), called as their owner
select throws_ok(
  format($$ select public.check_items_available(array[%s]::bigint[], array[1]) $$, pg_temp.product('QA Maple QA Viejos')),
  'P0001', 'product_unavailable', 'RF-11: a product not in the Shop is not available'
);
select throws_ok(
  format($$ select public.check_items_available(array[%s]::bigint[], array[11]) $$, pg_temp.product('QA Maple QA Medianos')),
  'P0001', 'not_enough_units', 'RF-11: 11 maples do not fit in 300 eggs'
);
select lives_ok(
  format($$ select public.check_items_available(array[%s]::bigint[], array[10]) $$, pg_temp.product('QA Maple QA Medianos')),
  'RF-11: 10 maples do'
);
delete from public.order_items where order_id = pg_temp.o('sale');
insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
values (pg_temp.o('sale'), pg_temp.product('QA Maple QA Medianos'), 2, 5000, 30);
-- As inside the RPCs: with the admin's session, which the movement keeps as its author.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000009c1", "role": "authenticated"}', true);
select public.subtract_order_eggs(pg_temp.o('sale'));
select set_config('request.jwt.claims', '', true);
select results_eq(
  format($$ select t.stock, m.kind::text, m.eggs from public.egg_types t
            join public.stock_movements m on m.egg_type_id = t.id and m.order_id = %s
            where t.name = 'QA Medianos' $$, pg_temp.o('sale')),
  $$ values (240, 'sale'::text, 60) $$,
  'RF-10: delivering subtracts the eggs of each type and leaves its sale movement'
);
select ok(
  not has_function_privilege('authenticated', 'public.check_items_available(bigint[], integer[])', 'execute')
  and not has_function_privilege('anon', 'public.check_items_available(bigint[], integer[])', 'execute')
  and not has_function_privilege('authenticated', 'public.subtract_order_eggs(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.subtract_order_eggs(bigint)', 'execute'),
  'nobody calls the shared rules through the API'
);

-- RF-20: no client sees a counter sale
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000009a1", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.orders where counter_sale) + (select count(*)::int from public.admin_order_overview where counter_sale),
  0,
  'RF-20: client A sees no counter sale, in orders nor in the overview'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000009b1", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.orders where counter_sale) + (select count(*)::int from public.order_items),
  0,
  'RF-20: nor does client B, nor their lines'
);

select * from finish();
rollback;
