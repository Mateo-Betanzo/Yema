-- Spec 006 · T2: the orders of the client for its Home and its order detail (RF-22, RF-23, RF-28).
-- client_orders() runs as its owner and returns only the orders of the caller, with the current names
-- of product, type and format (a client cannot read those tables) and never the stock. The local
-- database may hold QA data: products and orders are removed inside this transaction and the rollback
-- brings them back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

truncate public.products cascade;
truncate public.orders cascade;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000007a1', 'qa-client-orders-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000007b1', 'qa-client-orders-b@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000007c3', 'qa-client-orders-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000007c3';

insert into public.egg_types (name, stock) values ('QA Medianos', 900);
insert into public.formats (name, eggs) values ('QA Maple', 30), ('QA Pack', 180);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, f.name || ' Medianos', case when f.name = 'QA Maple' then 5000 else 28000 end
from public.egg_types t, public.formats f where t.name = 'QA Medianos' and f.name in ('QA Maple', 'QA Pack');

-- An order of a client in a state, created `age` ago, with lines as [[product, units, unit price], …].
create function pg_temp.new_order(client uuid, order_status public.order_status, age interval, lines text[][])
returns bigint language plpgsql as $$
declare
  v_order bigint;
begin
  insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, total,
                             address, address_notes, created_at, accepted_at, on_the_way_at, delivered_at,
                             rejected_at, cancelled_at, status_reason, cancelled_by)
  select client, s.id, current_date + 1, s.starts_at, s.ends_at, order_status, 1000, 'Calle 1', 'Timbre B',
         now() - age,
         case when order_status in ('accepted', 'on_the_way', 'delivered') then now() - age + interval '10 minutes' end,
         case when order_status in ('on_the_way', 'delivered') then now() - age + interval '1 hour' end,
         case when order_status = 'delivered' then now() - age + interval '2 hours' end,
         case when order_status = 'rejected' then now() - age + interval '5 minutes' end,
         case when order_status = 'cancelled' then now() - age + interval '5 minutes' end,
         case when order_status = 'rejected' then 'Fuera de zona' end,
         case when order_status = 'cancelled' then 'client'::public.user_role end
  from public.delivery_slots s where s.weekday = 3 and s.starts_at = '18:00'
  returning id into v_order;
  for i in 1 .. array_length(lines, 1) loop
    insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
    select v_order, p.id, lines[i][2]::int, lines[i][3]::int, f.eggs
    from public.products p join public.formats f on f.id = p.format_id where p.name = lines[i][1];
  end loop;
  return v_order;
end;
$$;

create temp table qa_orders (name text primary key, id bigint);
grant select on qa_orders to authenticated, anon;
-- Client A: a delivered order (a pack at an older price, then 2 maples), a rejected one, one it
-- cancelled and its pending one. Client B: a pending order.
insert into qa_orders values
  ('delivered', pg_temp.new_order('00000000-0000-0000-0000-0000000007a1', 'delivered', interval '3 days',
     array[['QA Pack Medianos', '1', '27000'], ['QA Maple Medianos', '2', '5000']])),
  ('rejected', pg_temp.new_order('00000000-0000-0000-0000-0000000007a1', 'rejected', interval '2 days',
     array[['QA Maple Medianos', '1', '5000']])),
  ('cancelled', pg_temp.new_order('00000000-0000-0000-0000-0000000007a1', 'cancelled', interval '1 day',
     array[['QA Maple Medianos', '1', '5000']])),
  ('pending', pg_temp.new_order('00000000-0000-0000-0000-0000000007a1', 'pending', interval '1 hour',
     array[['QA Maple Medianos', '3', '5000']])),
  ('b', pg_temp.new_order('00000000-0000-0000-0000-0000000007b1', 'pending', interval '2 hours',
     array[['QA Maple Medianos', '1', '5000']]));

create function pg_temp.o(order_name text) returns bigint language sql as
  $$ select id from pg_temp.qa_orders where qa_orders.name = order_name $$;
-- Product ids are kept as the owner: a client cannot read products.
insert into qa_orders select 'product ' || name, id from public.products;
create function pg_temp.product(product_name text) returns bigint language sql as
  $$ select id from pg_temp.qa_orders where qa_orders.name = 'product ' || product_name $$;

-- RF-22: the admin renames the pack and stops selling it after the order.
update public.products set name = 'QA Pack Grandes', active = false where name = 'QA Pack Medianos';

-- The function
select ok(
  (select prosecdef from pg_proc where oid = 'public.client_orders()'::regprocedure),
  'client_orders runs as its owner, so the client gets names without reading the catalog'
);
select ok(
  not has_function_privilege('anon', 'public.client_orders()', 'execute')
  and has_function_privilege('authenticated', 'public.client_orders()', 'execute'),
  'RF-28: only signed-in users can execute client_orders'
);
select ok(
  pg_get_function_result('public.client_orders()'::regprocedure) not like '%stock%',
  'the client never gets the stock'
);

set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select * from public.client_orders() $$, '42501', null, 'RF-28: anon cannot read orders');

-- Client A
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}', true);

select results_eq(
  $$ select id from public.client_orders() $$,
  $$ values (pg_temp.o('pending')), (pg_temp.o('cancelled')), (pg_temp.o('rejected')), (pg_temp.o('delivered')) $$,
  'RF-28: the client gets only its own orders, the newest first'
);
select results_eq(
  $$ select status::text, status_reason, cancelled_by::text, units from public.client_orders() $$,
  $$ values ('pending'::text, null::text, null::text, 3), ('cancelled', null, 'client', 1),
            ('rejected', 'Fuera de zona', null, 1), ('delivered', null, null, 3) $$,
  'RF-24, RF-25: the status, the reason and who cancelled, with the units of each order'
);
select results_eq(
  $$ select total, address, address_notes, delivery_date, slot_starts_at, slot_ends_at
     from public.client_orders() where id = pg_temp.o('delivered') $$,
  $$ values (1000, 'Calle 1'::text, 'Timbre B'::text, current_date + 1, '18:00'::time, '21:00'::time) $$,
  'RF-22: the total, the address and the day and slot of the order'
);
select results_eq(
  $$ select created_at, accepted_at, on_the_way_at, delivered_at, rejected_at, cancelled_at
     from public.client_orders() where id = pg_temp.o('delivered') $$,
  $$ values (now() - interval '3 days', now() - interval '3 days' + interval '10 minutes',
             now() - interval '3 days' + interval '1 hour', now() - interval '3 days' + interval '2 hours',
             null::timestamptz, null::timestamptz) $$,
  'RF-23: the date of each step'
);
select is(
  (select items from public.client_orders() where id = pg_temp.o('delivered')),
  jsonb_build_array(
    jsonb_build_object('product_id', pg_temp.product('QA Pack Medianos'), 'name', 'QA Pack Grandes',
      'egg_type_name', 'QA Medianos', 'format_name', 'QA Pack', 'quantity', 1, 'unit_price', 27000),
    jsonb_build_object('product_id', pg_temp.product('QA Maple Medianos'), 'name', 'QA Maple Medianos',
      'egg_type_name', 'QA Medianos', 'format_name', 'QA Maple', 'quantity', 2, 'unit_price', 5000)
  ),
  'RF-22: the lines in order, with the current names of product, type and format and the saved price, even if the product is no longer sold'
);
select is(
  (select count(*)::int from public.client_orders() where id = pg_temp.o('b')),
  0,
  'RF-28: A does not get the order of B'
);

-- Client B
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000007b1", "role": "authenticated"}', true);
select results_eq(
  $$ select id from public.client_orders() $$,
  $$ values (pg_temp.o('b')) $$,
  'RF-28: B gets only its order'
);
select is(
  (select count(*)::int from public.client_orders() where id in (pg_temp.o('pending'), pg_temp.o('delivered'))),
  0,
  'RF-28: B does not get the orders of A'
);

-- Admin: no orders of its own, and the orders of the clients are not read through this function
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000007c3", "role": "authenticated"}', true);
select is((select count(*)::int from public.client_orders()), 0, 'the admin gets no orders of clients here');

-- A client with no orders
reset role;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000007d1', 'qa-client-orders-new@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000007d1", "role": "authenticated"}', true);
select is((select count(*)::int from public.client_orders()), 0, 'RF-20: a new client has no orders');

select * from finish();
rollback;
