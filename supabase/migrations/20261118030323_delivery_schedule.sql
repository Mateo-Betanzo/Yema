-- Spec 009 · T1: the admin writes the delivery schedule (RF-4 to RF-9, RF-11 to RF-15, RF-17). As the
-- catalog of spec 003: direct writes on the table with RLS and column grants, and the rules of a slot
-- in the base. delivery_options() (spec 004) already offers only active slots against their current
-- capacity, and every order keeps a copy of its hours, so nothing else changes. The 12 slots loaded by
-- spec 004 (9 to 11 and 18 to 21, capacity 5) meet every new rule.

-- RF-8: the exclusion of overlapping active slots compares the weekday with "=" in a GiST index.
create extension if not exists btree_gist with schema extensions;

-- RF-5, RF-12, RF-17: the admin creates a slot with its day, and changes its hours, capacity and state,
-- never its day; nobody deletes a slot (principle 7: one that is no longer used stays inactive).
grant insert (weekday, starts_at, ends_at, capacity, active) on public.delivery_slots to authenticated;
grant update (starts_at, ends_at, capacity, active) on public.delivery_slots to authenticated;

create policy "delivery_slots: admin creates" on public.delivery_slots for insert to authenticated
  with check ((select public.is_admin()));
create policy "delivery_slots: admin changes" on public.delivery_slots for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- RF-6: hours on the hour or half hour, from 6:00 to 23:00. With delivery_slots_ends_after_start (spec
-- 004), a slot lasts at least 30 minutes.
alter table public.delivery_slots
  add constraint delivery_slots_half_hours check (
    extract(minute from starts_at) in (0, 30) and extract(second from starts_at) = 0
    and extract(minute from ends_at) in (0, 30) and extract(second from ends_at) = 0
  ),
  add constraint delivery_slots_day_hours check (starts_at >= '06:00' and ends_at <= '23:00');

-- RF-8, RF-11: two active slots of the same day never share a moment; [9, 11) and [11, 13) do not. The
-- hours are compared as minutes of the day. An inactive slot overlaps nobody until it is turned on.
alter table public.delivery_slots
  add constraint delivery_slots_no_overlap exclude using gist (
    weekday with =,
    int4range(
      (extract(hour from starts_at) * 60 + extract(minute from starts_at))::integer,
      (extract(hour from ends_at) * 60 + extract(minute from ends_at))::integer
    ) with &&
  ) where (active);

-- RF-2, RF-3, RF-13: the schedule of the admin, each slot with its orders in progress (pending, accepted
-- or on the way, of any day, also the late ones). security_invoker: with the RLS of delivery_slots and
-- orders, the admin gets every slot and counts every order, and a client gets nothing.
create view public.delivery_slot_overview
with (security_invoker = true)
as
select
  s.id,
  s.weekday,
  s.starts_at,
  s.ends_at,
  s.capacity,
  s.active,
  (
    select count(*)
    from public.orders o
    where o.delivery_slot_id = s.id and o.status in ('pending', 'accepted', 'on_the_way')
  ) as active_orders
from public.delivery_slots s;

comment on view public.delivery_slot_overview is 'The delivery schedule of the admin with the orders in progress of each slot (spec 009).';

revoke all on public.delivery_slot_overview from anon, authenticated;
grant select on public.delivery_slot_overview to authenticated;
