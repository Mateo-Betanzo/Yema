-- Spec 007 · T1: the totals of the admin Home and Dashboard and the sales by type (RF-1 to RF-3, RF-6
-- to RF-8, RF-11, RF-20, RF-21). The internal functions receive "now", so the edges of the day, the
-- week, the month and the year in Buenos Aires are tested with a fixed moment; the public ones only
-- add the permission and the real clock. The local database may hold QA data: the catalog and the
-- orders are removed inside this transaction and the rollback brings them back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

truncate public.egg_types, public.orders cascade;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000008a1', 'qa-dashboard-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000008b1', 'qa-dashboard-b@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000008c1', 'qa-dashboard-c@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000008d1', 'qa-dashboard-d@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000008e1', 'qa-dashboard-e@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000008f1', 'qa-dashboard-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000008f1';

-- Types in the order the admin created them; QA Viejos sold this year and is no longer active.
insert into public.egg_types (name, stock) values ('QA Medianos', 900), ('QA Grandes', 900), ('QA Super', 900),
  ('QA Viejos', 0);
update public.egg_types set active = false where name = 'QA Viejos';
insert into public.formats (name, eggs) values ('QA Maple', 30), ('QA Pack', 180), ('QA Media', 6);
insert into public.products (egg_type_id, format_id, name, price)
select t.id, f.id, f.name || ' ' || t.name, 1000
from public.egg_types t cross join public.formats f where f.name like 'QA %';

-- An order of a client in a state, to be delivered on `day`, delivered at `delivered` (null if not),
-- with a total and lines as [[product, units], …]; each line keeps the eggs of its format.
create function pg_temp.new_order(client uuid, order_status public.order_status, day date, delivered timestamptz,
                                  order_total integer, lines text[][])
returns bigint language plpgsql as $$
declare
  v_order bigint;
begin
  insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, total,
                             address, accepted_at, on_the_way_at, delivered_at, cancelled_at, status_reason,
                             cancelled_by)
  select client, s.id, day, s.starts_at, s.ends_at, order_status, order_total, 'Calle 1',
         case when order_status in ('accepted', 'on_the_way', 'delivered', 'cancelled') then day - interval '1 day' end,
         case when order_status in ('on_the_way', 'delivered', 'cancelled') then day - interval '1 day' end,
         delivered,
         case when order_status = 'cancelled' then timestamptz '2026-11-14 14:00:00+00' end,
         case when order_status in ('cancelled', 'rejected') then 'No estaba nadie' end,
         case when order_status = 'cancelled' then 'admin'::public.user_role end
  from public.delivery_slots s order by s.id limit 1
  returning id into v_order;
  for i in 1 .. array_length(lines, 1) loop
    insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
    select v_order, p.id, lines[i][2]::int, 1000, f.eggs
    from public.products p join public.formats f on f.id = p.format_id where p.name = lines[i][1];
  end loop;
  return v_order;
end;
$$;

-- "Now" is Saturday 14 November 2026, 12:00 in Buenos Aires (15:00 UTC). Today starts at 03:00 UTC,
-- the week on Monday 9 at 03:00 UTC, the month on 1 November at 03:00 UTC, the year on 1 January at
-- 03:00 UTC. Client A delivered orders on each side of every edge.
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'delivered', '2026-11-13', '2026-11-14 03:01:00+00',
  10000, array[['QA Maple QA Medianos', '2']]);                                    -- today, agreed for yesterday
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'delivered', '2026-11-13', '2026-11-14 02:59:00+00',
  20000, array[['QA Pack QA Medianos', '1']]);                                     -- Friday 23:59
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'delivered', '2026-11-09', '2026-11-09 03:01:00+00',
  40000, array[['QA Maple QA Grandes', '3'], ['QA Media QA Grandes', '4']]);       -- Monday 00:01, half dozens
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'delivered', '2026-11-08', '2026-11-09 02:59:00+00',
  80000, array[['QA Pack QA Grandes', '1']]);                                      -- Sunday 23:59
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'delivered', '2026-11-01', '2026-11-01 03:01:00+00',
  160000, array[['QA Maple QA Medianos', '1']]);                                   -- 1 November 00:01
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'delivered', '2026-10-31', '2026-11-01 02:59:00+00',
  320000, array[['QA Maple QA Viejos', '1']]);                                     -- 31 October 23:59
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'delivered', '2026-06-15', '2026-06-15 15:00:00+00',
  50000, array[['QA Pack QA Medianos', '2']]);                                     -- June
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'delivered', '2025-12-31', '2026-01-01 02:59:00+00',
  640000, array[['QA Pack QA Medianos', '5']]);                                    -- 31 December 23:59, last year
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'delivered', '2026-11-14', '2026-11-14 16:00:00+00',
  1280000, array[['QA Maple QA Medianos', '1']]);                                  -- after "now"
-- Rejected and cancelled orders of today: never income nor sales.
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'rejected', '2026-11-14', null,
  2560000, array[['QA Pack QA Grandes', '5']]);
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'cancelled', '2026-11-14', null,
  2560000, array[['QA Pack QA Grandes', '5']]);
-- RF-20: the admin renames and stops selling a product after selling it: it still adds to its type.
update public.products set name = 'QA Maple renombrado', active = false where name = 'QA Maple QA Grandes';

-- Active orders, one per client: two to deliver today (one late), one for tomorrow and one pending.
select pg_temp.new_order('00000000-0000-0000-0000-0000000008a1', 'accepted', '2026-11-14', null,
  1000, array[['QA Maple QA Medianos', '1']]);
select pg_temp.new_order('00000000-0000-0000-0000-0000000008b1', 'on_the_way', '2026-11-12', null,
  1000, array[['QA Maple QA Medianos', '1']]);
select pg_temp.new_order('00000000-0000-0000-0000-0000000008c1', 'accepted', '2026-11-15', null,
  1000, array[['QA Maple QA Medianos', '1']]);
select pg_temp.new_order('00000000-0000-0000-0000-0000000008d1', 'pending', '2026-11-14', null,
  1000, array[['QA Maple QA Medianos', '1']]);

-- The totals
select is(
  (select row(income_today, delivered_today) from public.admin_totals_at('2026-11-14 15:00:00+00')),
  row(10000::bigint, 1),
  'RF-1, RF-2: today is from 00:00 in Buenos Aires, by the real delivery: 23:59 of Friday is not today, and an order agreed for yesterday delivered today is'
);
select is(
  (select to_deliver from public.admin_totals_at('2026-11-14 15:00:00+00')),
  2,
  'RF-3: to deliver are the accepted and on the way orders of today and of past days, not tomorrow''s nor pending ones'
);
select is(
  (select income_week from public.admin_totals_at('2026-11-14 15:00:00+00')),
  70000::bigint,
  'RF-6: the week starts on Monday at 00:00 in Buenos Aires; rejected and cancelled orders are not income'
);
select is(
  (select income_month from public.admin_totals_at('2026-11-14 15:00:00+00')),
  310000::bigint,
  'RF-6: the month starts on the 1st at 00:00 in Buenos Aires, and nothing after "now" counts'
);
select is(
  (select row(income_today, delivered_today, to_deliver, income_week, income_month)
   from public.admin_totals_at('2026-11-09 03:30:00+00')),
  row(40000::bigint, 1, 0, 40000::bigint, 280000::bigint),
  'RF-6: on Monday at 00:30 the week has only that day; the month keeps the 1st and Sunday'
);

-- The sales by type
select results_eq(
  $$ select name, active, eggs_week, eggs_month, eggs_year
     from public.admin_sales_by_type_at('2026-11-14 15:00:00+00') $$,
  $$ values ('QA Medianos'::text, true, 240::bigint, 270::bigint, 630::bigint),
            ('QA Grandes', true, 90, 270, 270),
            ('QA Super', true, 0, 0, 0),
            ('QA Viejos', false, 0, 0, 30) $$,
  'RF-7, RF-8, RF-11, RF-20: eggs of maples and packs per type and period, every type in its order, half dozens left out, a renamed product still counts'
);
select is(
  (select eggs_year from public.admin_sales_by_type_at('2026-11-14 15:00:00+00') where name = 'QA Medianos'),
  630::bigint,
  'RF-8: the year starts on 1 January at 00:00 in Buenos Aires: 31 December 23:59 is last year'
);

-- The functions and who can call them
select ok(
  (select bool_and(prosecdef) from pg_proc
   where oid in ('public.admin_totals()'::regprocedure, 'public.admin_sales_by_type()'::regprocedure)),
  'the public functions run as their owner, to call the internal ones'
);
select ok(
  not has_function_privilege('anon', 'public.admin_totals()', 'execute')
  and not has_function_privilege('anon', 'public.admin_sales_by_type()', 'execute')
  and has_function_privilege('authenticated', 'public.admin_totals()', 'execute')
  and has_function_privilege('authenticated', 'public.admin_sales_by_type()', 'execute'),
  'RF-21: only signed-in users can execute the totals and the sales by type'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_totals_at(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.admin_totals_at(timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_sales_by_type_at(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.admin_sales_by_type_at(timestamptz)', 'execute'),
  'RF-21: nobody asks the totals with another "now" through the API'
);

-- What the admin gets with the real clock, kept as the owner.
create temp table qa_expected as
select (select row(t.*)::text from public.admin_totals_at(now()) t) as totals,
       (select array_agg(row(s.*)::text order by s.egg_type_id) from public.admin_sales_by_type_at(now()) s) as sales;
grant select on qa_expected to authenticated, anon;

set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select * from public.admin_totals() $$, '42501', null, 'RF-21: anon gets no totals');

-- Client A and client B
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000008a1", "role": "authenticated"}', true);
select throws_ok($$ select * from public.admin_totals() $$, '42501', null, 'RF-21: a client gets no totals');
select throws_ok($$ select * from public.admin_sales_by_type() $$, '42501', null, 'RF-21: a client gets no sales by type');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000008b1", "role": "authenticated"}', true);
select throws_ok($$ select * from public.admin_totals() $$, '42501', null, 'RF-21: nor does another client');

-- The admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000008f1", "role": "authenticated"}', true);
select is(
  (select row(t.*)::text from public.admin_totals() t),
  (select totals from pg_temp.qa_expected),
  'RF-1 to RF-3, RF-6: the admin gets the totals of now'
);
select is(
  (select array_agg(row(s.*)::text order by s.egg_type_id) from public.admin_sales_by_type() s),
  (select sales from pg_temp.qa_expected),
  'RF-7: the admin gets the sales by type of now'
);

select * from finish();
rollback;
