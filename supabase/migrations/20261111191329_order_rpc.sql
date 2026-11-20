-- Spec 004 · T3: the delivery slots a client can pick (RF-2, RF-3, RF-4, RF-21, RF-35).
-- delivery_options_at receives "now" so the tests can fix it; nobody but its owner can call it, so a
-- client can never ask with another time. delivery_options() calls it with the real clock.

-- The slots of a concrete date from today to today + 6 in Buenos Aires that start at least 2 hours
-- after p_now, with whether they are full. A place is taken by every order of that slot and date but
-- the rejected and cancelled ones: a delivered order keeps its place (spec 004, definition of capacity).
-- Runs with the owner's rights when called from delivery_options(), so it counts every client's
-- orders, and returns only the count's outcome, never the orders.
create function public.delivery_options_at(p_now timestamptz)
returns table (delivery_date date, slot_id bigint, starts_at time, ends_at time, is_full boolean)
language sql
stable
set search_path = ''
as $$
  select
    d.day,
    s.id,
    s.starts_at,
    s.ends_at,
    (
      select count(*)
      from public.orders o
      where o.delivery_slot_id = s.id
        and o.delivery_date = d.day
        and o.status not in ('rejected', 'cancelled')
    ) >= s.capacity
  from generate_series(
    (p_now at time zone 'America/Argentina/Buenos_Aires')::date,
    (p_now at time zone 'America/Argentina/Buenos_Aires')::date + 6,
    interval '1 day'
  ) as g (instant)
  cross join lateral (select g.instant::date as day) d
  join public.delivery_slots s on s.active and s.weekday = extract(dow from d.day)
  where (d.day + s.starts_at) at time zone 'America/Argentina/Buenos_Aires' >= p_now + interval '2 hours'
  order by d.day, s.starts_at;
$$;

-- Supabase grants execute on new functions to anon and authenticated by default: take it away.
revoke execute on function public.delivery_options_at(timestamptz) from public, anon, authenticated;

-- RF-2, RF-3, RF-21, RF-35: what the checkout shows, with the real clock.
create function public.delivery_options()
returns table (delivery_date date, slot_id bigint, starts_at time, ends_at time, is_full boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.delivery_options_at(now());
$$;

revoke execute on function public.delivery_options() from public, anon;
grant execute on function public.delivery_options() to authenticated;
