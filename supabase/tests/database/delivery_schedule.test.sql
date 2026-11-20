-- Spec 009 · T1: the admin writes the delivery schedule (RF-4 to RF-9, RF-11 to RF-15, RF-17). Hours on
-- the hour or half hour from 6:00 to 23:00, active slots of a day never overlap, a slot keeps its day and
-- is never deleted, and only the admin writes. The orders of the local QA data are removed inside this
-- transaction; the 12 slots of the schedule are used as they are, and new slots go on Sunday, which has
-- none.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

truncate public.orders cascade;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up(('00000000-0000-0000-0000-0000000' || n || 'a1')::uuid, 'qa-schedule-' || n || '@example.com')
from generate_series(101, 107) as n;
select pg_temp.sign_up('00000000-0000-0000-0000-000000000ac1', 'qa-schedule-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000ac1';

create function pg_temp.client(n int) returns uuid language sql as
  $$ select ('00000000-0000-0000-0000-0000000' || n || 'a1')::uuid $$;
create function pg_temp.slot(day int, starts time) returns bigint language sql as
  $$ select id from public.delivery_slots where weekday = day and starts_at = starts $$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000ac1", "role": "authenticated"}', true);
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- An order of the app in a slot on a date (copying its hours), in a status.
create function pg_temp.new_order(client uuid, slot bigint, day date, order_status public.order_status)
returns void language sql as $$
  insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, total,
                             address, accepted_at, on_the_way_at, delivered_at, cancelled_at, status_reason, cancelled_by)
  select client, s.id, day, s.starts_at, s.ends_at, order_status, 1000, 'Calle 1',
         case when order_status in ('accepted', 'on_the_way', 'delivered', 'cancelled') then now() end,
         case when order_status in ('on_the_way', 'delivered') then now() end,
         case when order_status = 'delivered' then now() end,
         case when order_status = 'cancelled' then now() end,
         case when order_status = 'cancelled' then 'No estaba nadie' end,
         case when order_status = 'cancelled' then 'admin'::public.user_role end
  from public.delivery_slots s where s.id = slot;
$$;

-- RF-13: Monday 9 to 11 has a pending order, a late accepted one and one on the way, plus finished ones.
select pg_temp.new_order(pg_temp.client(101), pg_temp.slot(1, '09:00'), '2026-11-23', 'pending');
select pg_temp.new_order(pg_temp.client(102), pg_temp.slot(1, '09:00'), '2026-11-16', 'accepted');
select pg_temp.new_order(pg_temp.client(103), pg_temp.slot(1, '09:00'), '2026-11-23', 'on_the_way');
select pg_temp.new_order(pg_temp.client(104), pg_temp.slot(1, '09:00'), '2026-11-16', 'delivered');
select pg_temp.new_order(pg_temp.client(105), pg_temp.slot(1, '09:00'), '2026-11-23', 'cancelled');
-- RF-15: Monday 18 to 21 has two orders on 23 November.
select pg_temp.new_order(pg_temp.client(106), pg_temp.slot(1, '18:00'), '2026-11-23', 'pending');
select pg_temp.new_order(pg_temp.client(107), pg_temp.slot(1, '18:00'), '2026-11-23', 'accepted');

-- The admin
set local role authenticated;
select pg_temp.as_admin();

select lives_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '09:00', '11:00', 5) $$,
  'RF-4: the admin creates a slot on Sunday from 9 to 11'
);
select lives_ok(
  $$ update public.delivery_slots set starts_at = '09:30', ends_at = '11:30', capacity = 8 where id = pg_temp.slot(0, '09:00') $$,
  'RF-5: and changes its hours and its capacity'
);
select throws_ok(
  $$ update public.delivery_slots set weekday = 6 where id = pg_temp.slot(0, '09:30') $$,
  '42501', null, 'RF-5: but not its day'
);
select throws_ok(
  $$ delete from public.delivery_slots where id = pg_temp.slot(0, '09:30') $$,
  '42501', null, 'RF-12: and never deletes a slot'
);

-- RF-6, RF-7: the hours
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '05:30', '07:00', 5) $$,
  '23514', null, 'RF-6: a slot does not start before 6:00'
);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '22:30', '23:30', 5) $$,
  '23514', null, 'RF-6: nor ends after 23:00'
);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '14:15', '16:00', 5) $$,
  '23514', null, 'RF-6: hours are on the hour or half hour'
);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '16:00', '14:00', 5) $$,
  '23514', null, 'RF-7: a slot ends after it starts'
);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '14:00', '16:00', 101) $$,
  '23514', null, 'RF-6: the capacity is at most 100'
);
select lives_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '06:00', '06:30', 1) $$,
  'RF-6: from 6:00, 30 minutes and a capacity of 1 are fine'
);

-- RF-8, RF-11: active slots of a day never overlap
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '10:00', '12:00', 5) $$,
  '23P01', null, 'RF-8: an active slot cannot overlap another active one of the same day'
);
select lives_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '11:30', '13:00', 5) $$,
  'RF-8: one that starts when the other ends does not overlap'
);
select lives_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity, active) values (0, '10:00', '12:00', 5, false) $$,
  'RF-8: an inactive slot overlaps nobody'
);
select throws_ok(
  $$ update public.delivery_slots set active = true where id = pg_temp.slot(0, '10:00') $$,
  '23P01', null, 'RF-11: and turning it on while it overlaps is rejected'
);
select lives_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (1, '11:00', '13:00', 5) $$,
  'RF-8: Monday 11 to 13 does not overlap Monday 9 to 11'
);

-- RF-9: one slot per day and start, active or not
select lives_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity, active) values (0, '18:00', '19:00', 5, false) $$,
  'an inactive slot on Sunday at 18:00'
);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '18:00', '20:00', 5) $$,
  '23505', null, 'RF-9: another slot on Sunday at 18:00 is rejected, even if the first one is inactive'
);

-- RF-13: the orders in progress of each slot
select is(
  (select active_orders from public.delivery_slot_overview where id = pg_temp.slot(1, '09:00')),
  3::bigint,
  'RF-13: pending, accepted (also late) and on the way orders are in progress; delivered and cancelled are not'
);

-- RF-11, RF-14, RF-15: what the checkout offers after a change ("now" is Sunday 22 November, 12:00)
update public.delivery_slots set active = false where id = pg_temp.slot(1, '09:00');
update public.delivery_slots set capacity = 1, starts_at = '18:30' where id = pg_temp.slot(1, '18:00');
reset role;
select is(
  (select count(*)::int from public.delivery_options_at('2026-11-22 15:00:00+00') where slot_id = pg_temp.slot(1, '09:00')),
  0,
  'RF-11: an inactive slot is no longer offered'
);
select is(
  (select is_full from public.delivery_options_at('2026-11-22 15:00:00+00')
   where slot_id = pg_temp.slot(1, '18:30') and delivery_date = '2026-11-23'),
  true,
  'RF-15: with 2 orders and a capacity of 1, the slot is full that day'
);
select results_eq(
  $$ select slot_starts_at, slot_ends_at from public.orders where delivery_slot_id = pg_temp.slot(1, '18:30') $$,
  $$ values ('18:00'::time, '21:00'::time), ('18:00'::time, '21:00'::time) $$,
  'RF-14: the orders keep the hours they copied'
);

-- RF-17: only the admin writes the schedule
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', pg_temp.client(101)), true);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '15:00', '16:00', 5) $$,
  '42501', null, 'RF-17: a client cannot create a slot'
);
update public.delivery_slots set capacity = 99 where weekday = 2;
select is(
  (select count(*)::int from public.delivery_slot_overview),
  0,
  'RF-17: a client reads no slot of the schedule nor its orders'
);
reset role;
select is(
  (select max(capacity) from public.delivery_slots where weekday = 2),
  5,
  'RF-17: and its change touched nothing'
);
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '15:00', '16:00', 5) $$,
  '42501', null, 'RF-17: anon cannot create a slot'
);

select * from finish();
rollback;
