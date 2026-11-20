-- Spec 004 · T3: the slots a client can pick. RF-2, RF-3, RF-4, RF-21, RF-35.
-- delivery_options_at(now) is tested with a fixed "now" (Monday 2026-11-16 in Buenos Aires, UTC−3);
-- delivery_options() is the same with the real clock. The local database may hold QA orders: they are
-- removed inside this transaction (the rollback at the end brings them back).
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

truncate public.orders cascade;

-- RF-2: days and hours
select results_eq(
  $$ select distinct delivery_date from public.delivery_options_at('2026-11-16 06:00-03') order by 1 $$,
  $$ select d::date from generate_series(date '2026-11-16', date '2026-11-21', interval '1 day') d $$,
  'RF-2: from today to today + 6, Monday to Saturday (Sunday 22 has no slots)'
);
select is(
  (select count(*)::int from public.delivery_options_at('2026-11-16 06:00-03')),
  12, 'RF-2: two slots on each of the six days'
);
select results_eq(
  $$ select starts_at, ends_at from public.delivery_options_at('2026-11-16 06:00-03')
     where delivery_date = '2026-11-16' order by starts_at $$,
  $$ values ('09:00'::time, '11:00'::time), ('18:00', '21:00') $$,
  'RF-2: each day offers 9 to 11 and 18 to 21'
);
select is_empty(
  $$ select * from public.delivery_options_at('2026-11-22 06:00-03') where delivery_date = '2026-11-22' $$,
  'RF-2: no slots on Sunday'
);
select ok(
  exists (select 1 from public.delivery_options_at('2026-11-16 07:00-03')
          where delivery_date = '2026-11-16' and starts_at = '09:00'),
  'RF-2: a slot that starts in exactly 2 hours is offered'
);
select ok(
  not exists (select 1 from public.delivery_options_at('2026-11-16 07:01-03')
              where delivery_date = '2026-11-16' and starts_at = '09:00'),
  'RF-2: a slot that starts in less than 2 hours is not shown'
);
select ok(
  not exists (select 1 from public.delivery_options_at('2026-11-16 19:00-03')
              where delivery_date = '2026-11-16'),
  'RF-2: slots that already started are not shown'
);
select ok(
  not exists (select 1 from public.delivery_options_at('2026-11-17 02:59+00') where delivery_date = '2026-11-23'),
  'RF-2: at 23:59 in Buenos Aires (02:59 UTC) the next Monday is still 7 days away'
);
select ok(
  exists (select 1 from public.delivery_options_at('2026-11-17 03:00+00') where delivery_date = '2026-11-23'),
  'RF-2: at 00:00 in Buenos Aires (03:00 UTC) the day changes and the next Monday enters'
);

-- RF-3, RF-4: capacity. Five clients, each with one order on Wednesday 18 at 9.
create function pg_temp.sign_up(n int) returns uuid language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (('00000000-0000-0000-0000-00000000040' || n)::uuid, 'qa-slots-' || n || '@example.com',
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}')
  returning id;
$$;
create function pg_temp.new_order(n int, order_status public.order_status) returns void language sql as $$
  insert into public.orders
    (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, total, address)
  select pg_temp.sign_up(n), s.id, '2026-11-18', s.starts_at, s.ends_at, order_status, 1000, 'Calle 1'
  from public.delivery_slots s where s.weekday = 3 and s.starts_at = '09:00';
$$;
create function pg_temp.wednesday_full() returns boolean language sql as $$
  select is_full from public.delivery_options_at('2026-11-16 06:00-03')
  where delivery_date = '2026-11-18' and starts_at = '09:00';
$$;

select pg_temp.new_order(1, 'pending');
select pg_temp.new_order(2, 'accepted');
select pg_temp.new_order(3, 'on_the_way');
select pg_temp.new_order(4, 'pending');
select is(pg_temp.wednesday_full(), false, 'RF-3: with 4 of 5 places taken, the slot is not full');

select pg_temp.new_order(5, 'delivered');
select is(pg_temp.wednesday_full(), true, 'RF-3: a delivered order keeps its place, so 5 of 5 is full');
select ok(
  not (select bool_or(is_full) from public.delivery_options_at('2026-11-16 06:00-03')
       where not (delivery_date = '2026-11-18' and starts_at = '09:00')),
  'RF-3: the orders of one slot do not fill the others'
);

-- A cancellation of the admin always has a reason and says who (orders_cancel_reason, spec 005 and 006).
update public.orders set status = 'cancelled', status_reason = 'QA', cancelled_by = 'admin'
where client_id = '00000000-0000-0000-0000-000000000401';
select is(pg_temp.wednesday_full(), false, 'RF-4: a cancelled order frees its place');

update public.orders set status = 'rejected'
where client_id = '00000000-0000-0000-0000-000000000402';
update public.orders set status = 'pending', cancelled_by = null
where client_id = '00000000-0000-0000-0000-000000000401';
select is(pg_temp.wednesday_full(), false, 'RF-4: a rejected order frees its place');

-- An inactive slot is not offered
update public.delivery_slots set active = false where weekday = 2 and starts_at = '18:00';
select ok(
  not exists (select 1 from public.delivery_options_at('2026-11-16 06:00-03')
              where delivery_date = '2026-11-17' and starts_at = '18:00'),
  'an inactive slot is not offered'
);

-- RF-35: who calls what
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select * from public.delivery_options() $$, '42501', null, 'RF-35: anon cannot read the slots');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000401", "role": "authenticated"}', true);
select ok(
  (select coalesce(bool_and(
     delivery_date between (now() at time zone 'America/Argentina/Buenos_Aires')::date
                       and (now() at time zone 'America/Argentina/Buenos_Aires')::date + 6
     and (delivery_date + starts_at) at time zone 'America/Argentina/Buenos_Aires' >= now() + interval '2 hours'
   ), true) from public.delivery_options()),
  'RF-2, RF-21: a client gets the slots of the next 7 days that start in 2 hours or more'
);
select throws_ok(
  $$ select * from public.delivery_options_at(now() - interval '1 day') $$,
  '42501', null, 'RF-35: a client cannot ask with another "now"'
);

select * from finish();
rollback;
