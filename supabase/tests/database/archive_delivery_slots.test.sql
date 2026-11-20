-- Spec 009, cambio del 2026-11-19 · T7: "Eliminar" archives a delivery slot (RF-9, RF-12, RF-17, RF-20 to
-- RF-25). Only the admin, through archive_delivery_slot; never with orders in progress; an archived slot
-- is inactive for good, leaves the schedule and the checkout, frees its day and hour, and nobody edits,
-- reactivates or un-archives it through the API. Client A, client B, the admin and anon. The orders and
-- the Sunday slots of the local QA data go away inside this transaction (the rollback brings them back),
-- so the test builds its own Sunday.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

truncate public.orders cascade;
delete from public.delivery_slots where weekday = 0;

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
-- Clients A and B use the API; 111 to 117 only own orders (one active order per client).
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000a1', 'qa-archive-slot-a@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000b2', 'qa-archive-slot-b@example.com');
select pg_temp.sign_up(('00000000-0000-0000-0000-0000000' || n || 'a1')::uuid, 'qa-archive-slot-' || n || '@example.com')
from generate_series(111, 117) as n;
select pg_temp.sign_up('00000000-0000-0000-0000-000000000ac1', 'qa-archive-slot-admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000ac1';

create function pg_temp.client(n int) returns uuid language sql as
  $$ select ('00000000-0000-0000-0000-0000000' || n || 'a1')::uuid $$;
create function pg_temp.slot(starts time) returns bigint language sql as
  $$ select id from public.delivery_slots where weekday = 0 and starts_at = starts and archived_at is null $$;
create function pg_temp.as_user(user_id text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub": "' || user_id || '", "role": "authenticated"}', true);
$$;
-- What archive_delivery_slot raised, as "message|hint", or "ok".
create function pg_temp.archive_error(slot bigint) returns text language plpgsql as $$
declare
  v_message text;
  v_hint text;
begin
  perform public.archive_delivery_slot(slot);
  return 'ok';
exception when others then
  get stacked diagnostics v_message = message_text, v_hint = pg_exception_hint;
  return v_message || '|' || coalesce(v_hint, '');
end;
$$;
-- How many rows an update changed (an update cannot go inside a nested "with").
create function pg_temp.changed(statement text) returns integer language plpgsql as $$
declare
  v_rows integer;
begin
  execute statement;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- An order of the app in a slot on a date (copying its hours), in a status.
create function pg_temp.new_order(client uuid, slot bigint, day date, order_status public.order_status)
returns void language sql as $$
  insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, total,
                             address, accepted_at, on_the_way_at, delivered_at, rejected_at, cancelled_at,
                             status_reason, cancelled_by)
  select client, s.id, day, s.starts_at, s.ends_at, order_status, 1000, 'Calle 1',
         case when order_status in ('accepted', 'on_the_way', 'delivered', 'cancelled') then now() end,
         case when order_status in ('on_the_way', 'delivered') then now() end,
         case when order_status = 'delivered' then now() end,
         case when order_status = 'rejected' then now() end,
         case when order_status = 'cancelled' then now() end,
         case when order_status = 'cancelled' then 'No estaba nadie' end,
         case when order_status = 'cancelled' then 'admin'::public.user_role end
  from public.delivery_slots s where s.id = slot;
$$;

-- Sunday: 9 to 11 without orders; 12 to 14 with two pending; 15 to 17 with a late accepted one; 18 to 19
-- with one on the way; 20 to 22 with only finished orders; 6 to 7 inactive.
insert into public.delivery_slots (weekday, starts_at, ends_at, capacity, active) values
  (0, '09:00', '11:00', 5, true),
  (0, '12:00', '14:00', 5, true),
  (0, '15:00', '17:00', 5, true),
  (0, '18:00', '19:00', 5, true),
  (0, '20:00', '22:00', 5, true),
  (0, '06:00', '07:00', 5, false);
select pg_temp.new_order(pg_temp.client(111), pg_temp.slot('12:00'), '2026-11-22', 'pending');
select pg_temp.new_order(pg_temp.client(112), pg_temp.slot('12:00'), '2026-11-29', 'pending');
select pg_temp.new_order(pg_temp.client(113), pg_temp.slot('15:00'), '2026-11-15', 'accepted');
select pg_temp.new_order(pg_temp.client(114), pg_temp.slot('18:00'), '2026-11-22', 'on_the_way');
select pg_temp.new_order(pg_temp.client(115), pg_temp.slot('20:00'), '2026-11-15', 'delivered');
select pg_temp.new_order(pg_temp.client(116), pg_temp.slot('20:00'), '2026-11-15', 'rejected');
select pg_temp.new_order(pg_temp.client(117), pg_temp.slot('20:00'), '2026-11-15', 'cancelled');
-- The ids, before archiving (pg_temp.slot only finds what is not archived).
select set_config('test.s9', pg_temp.slot('09:00')::text, true);
select set_config('test.s20', pg_temp.slot('20:00')::text, true);
select set_config('test.s6', pg_temp.slot('06:00')::text, true);

select has_function('public', 'archive_delivery_slot', array['bigint'], 'archive_delivery_slot(bigint) exists');

-- The admin
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000ac1');

select is(pg_temp.archive_error(current_setting('test.s9')::bigint), 'ok',
  'RF-20, RF-21: the admin deletes an active slot without orders');
select results_eq(
  $$ select archived_at is not null, active from public.delivery_slots where id = current_setting('test.s9')::bigint $$,
  $$ values (true, false) $$,
  'RF-21: it is marked as deleted with the date, and it is inactive'
);
select is_empty(
  $$ select 1 from public.delivery_slot_overview where id = current_setting('test.s9')::bigint $$,
  'RF-21: it leaves the schedule of the admin'
);
select set_config('test.s9_archived_at',
  (select archived_at::text from public.delivery_slots where id = current_setting('test.s9')::bigint), true);

select is(pg_temp.archive_error(pg_temp.slot('12:00')), 'slot_has_active_orders|2',
  'RF-22: with two pending orders it is not deleted, and the hint counts them');
select is(pg_temp.archive_error(pg_temp.slot('15:00')), 'slot_has_active_orders|1',
  'RF-22: a late accepted order also blocks it');
select is(pg_temp.archive_error(pg_temp.slot('18:00')), 'slot_has_active_orders|1',
  'RF-22: an order on the way also blocks it');
select results_eq(
  $$ select count(*)::int from public.delivery_slot_overview where weekday = 0 and starts_at in ('12:00', '15:00', '18:00') $$,
  $$ values (3) $$,
  'RF-22: the blocked slots stay in the schedule'
);
select is(pg_temp.archive_error(current_setting('test.s20')::bigint), 'ok',
  'RF-22: only delivered, rejected and cancelled orders do not block it');

select lives_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '09:00', '11:00', 5) $$,
  'RF-23: another slot can take the day and the hour of a deleted one'
);
select throws_ok(
  $$ insert into public.delivery_slots (weekday, starts_at, ends_at, capacity) values (0, '06:00', '06:30', 5) $$,
  '23505', null, 'RF-9: an inactive slot that is not deleted still holds its hour'
);

select is(
  pg_temp.changed('update public.delivery_slots set active = true where id = ' || current_setting('test.s20')),
  0, 'RF-21: a deleted slot cannot be turned on again'
);
select is(
  pg_temp.changed('update public.delivery_slots set capacity = 9 where id = ' || current_setting('test.s20')),
  0, 'RF-21: nor edited'
);
select throws_ok(
  $$ update public.delivery_slots set archived_at = null where id = current_setting('test.s9')::bigint $$,
  '42501', null, 'RF-25: nobody undoes a deletion through the API'
);
select throws_ok(
  $$ update public.delivery_slots set archived_at = now() where id = pg_temp.slot('06:00') $$,
  '42501', null, 'RF-25: nor deletes by writing archived_at'
);
select throws_ok(
  $$ delete from public.delivery_slots where id = pg_temp.slot('06:00') $$,
  '42501', null, 'RF-12: and nobody deletes a slot from the base'
);

select is(pg_temp.archive_error(current_setting('test.s9')::bigint), 'ok', 'deleting it again does not fail');
select is(
  (select archived_at::text from public.delivery_slots where id = current_setting('test.s9')::bigint),
  current_setting('test.s9_archived_at'),
  'and it keeps the date of the first deletion'
);
select is(pg_temp.archive_error(-1), 'slot_not_found|', 'a slot that does not exist gives slot_not_found');

-- Client A
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select public.archive_delivery_slot(pg_temp.slot('06:00')) $$,
  '42501', null, 'RF-17, RF-25: a client cannot delete a slot'
);

-- Client B
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok(
  $$ select public.archive_delivery_slot(pg_temp.slot('06:00')) $$,
  '42501', null, 'RF-17, RF-25: another client cannot either'
);

-- anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.archive_delivery_slot(1) $$,
  '42501', null, 'RF-17, RF-25: without a session, nobody deletes a slot'
);

-- The owner: what the checkout offers, the orders and the checks
reset role;

select is_empty(
  $$ select 1 from public.delivery_options_at(now())
     where slot_id in (current_setting('test.s9')::bigint, current_setting('test.s20')::bigint) $$,
  'RF-21: a deleted slot is not offered in the checkout'
);
select results_eq(
  $$ select delivery_date, slot_starts_at, slot_ends_at from public.orders
     where delivery_slot_id = current_setting('test.s20')::bigint order by status $$,
  $$ values ('2026-11-15'::date, '20:00'::time, '22:00'::time),
            ('2026-11-15'::date, '20:00'::time, '22:00'::time),
            ('2026-11-15'::date, '20:00'::time, '22:00'::time) $$,
  'RF-24: the orders of a deleted slot keep their day and hours'
);
select throws_ok(
  $$ update public.delivery_slots set active = true where id = current_setting('test.s9')::bigint $$,
  '23514', null, 'RF-21: not even the owner leaves a deleted slot active'
);
select is(
  (select count(*)::int from public.delivery_slots where weekday = 0 and archived_at is null and starts_at = '12:00'),
  1, 'RF-22: a refused deletion changes nothing'
);

select * from finish();
rollback;
