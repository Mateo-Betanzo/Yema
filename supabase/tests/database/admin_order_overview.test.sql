-- Spec 005 · T3: the orders of the admin Home and detail (RF-3, RF-7), and Realtime on orders (RF-5,
-- RF-23). admin_order_overview runs with the caller's permissions: the admin sees every order; a client
-- only its own, and without product names (it cannot read products). The local database may hold QA
-- data: products and orders are removed inside this transaction and the rollback brings them back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

truncate public.products cascade;
truncate public.orders cascade;

create function pg_temp.sign_up(user_id uuid, email text, first_name text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    jsonb_build_object('first_name', first_name, 'last_name', 'Pérez', 'phone', '1133445566', 'address', 'Calle 1'));
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000006a1', 'qa-overview-a@example.com', 'Ana');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000006b2', 'qa-overview-b@example.com', 'Beto');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000006c3', 'qa-overview-admin@example.com', 'Admin');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000006c3';

insert into public.egg_types (name, stock) values ('QA Vista', 900);
insert into public.formats (name, eggs) values ('QA Bandeja', 10), ('QA Caja', 100);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, 'QA ' || f.name || ' Vista', f.eggs * 100
from public.egg_types t, public.formats f where t.name = 'QA Vista' and f.name in ('QA Bandeja', 'QA Caja');

-- Client A: 3 boxes and 2 trays (5 units), added in that order. Client B: 1 tray.
create function pg_temp.new_order(client uuid, lines text[][]) returns void language plpgsql as $$
declare
  v_order bigint;
begin
  insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address, address_notes)
  select client, s.id, current_date + 1, s.starts_at, s.ends_at, 1000, 'Calle 1', 'Timbre B'
  from public.delivery_slots s where s.weekday = 3 and s.starts_at = '18:00'
  returning id into v_order;
  for i in 1 .. array_length(lines, 1) loop
    insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
    select v_order, p.id, lines[i][2]::int, p.price, f.eggs
    from public.products p join public.formats f on f.id = p.format_id where p.name = lines[i][1];
  end loop;
end;
$$;
select pg_temp.new_order('00000000-0000-0000-0000-0000000006a1', array[['QA QA Caja Vista', '3'], ['QA QA Bandeja Vista', '2']]);
select pg_temp.new_order('00000000-0000-0000-0000-0000000006b2', array[['QA QA Bandeja Vista', '1']]);

-- RF-7: the phone shown is the current one, not the one at the time of the order.
update public.profiles set phone = '1144556677' where id = '00000000-0000-0000-0000-0000000006a1';

-- Spec 006, RF-31: the admin detail says when the client cancelled
select has_column('public', 'admin_order_overview', 'cancelled_by', 'RF-31 (spec 006): the overview says who cancelled an order');

-- anon
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select * from public.admin_order_overview $$, '42501', null, 'anon cannot read the orders overview');

-- Admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000006c3", "role": "authenticated"}', true);

select is((select count(*)::int from public.admin_order_overview), 2, 'RF-1, RF-2: the admin sees every order');
select results_eq(
  $$ select client_first_name, client_last_name, client_phone, address, address_notes, units, status::text
     from public.admin_order_overview where client_id = '00000000-0000-0000-0000-0000000006a1' $$,
  $$ values ('Ana'::text, 'Pérez'::text, '1144556677'::text, 'Calle 1'::text, 'Timbre B'::text, 5, 'pending'::text) $$,
  'RF-3, RF-7: the current name and phone of the client, the address of the order and its units'
);
select is(
  (select items from public.admin_order_overview where client_id = '00000000-0000-0000-0000-0000000006a1'),
  '[{"name": "QA QA Caja Vista", "quantity": 3, "unit_price": 10000},
    {"name": "QA QA Bandeja Vista", "quantity": 2, "unit_price": 1000}]'::jsonb,
  'RF-7: the lines with name, quantity and price, in the order they were added'
);
select ok(
  (select delivery_date is not null and slot_starts_at is not null and total is not null and created_at is not null
   from public.admin_order_overview where client_id = '00000000-0000-0000-0000-0000000006a1'),
  'RF-3, RF-7: with the day, the slot, the total and when it was created'
);

-- Client A
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000006a1", "role": "authenticated"}', true);

select is((select count(*)::int from public.admin_order_overview), 1, 'RF-23: a client sees only its own order');
select is_empty(
  $$ select * from public.admin_order_overview where client_id = '00000000-0000-0000-0000-0000000006b2' $$,
  'RF-23: a client does not see the order of another client, nor its name or phone'
);
select is(
  (select items -> 0 ->> 'name' from public.admin_order_overview),
  null,
  'a client gets its lines without product names (it cannot read products; spec 006 decides)'
);

-- RF-5, RF-23: Realtime
reset role;
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'),
  'RF-5: orders is in the Realtime publication'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass),
  'RF-23: RLS is on in orders, so Realtime sends each client only its own orders'
);

select * from finish();
rollback;
