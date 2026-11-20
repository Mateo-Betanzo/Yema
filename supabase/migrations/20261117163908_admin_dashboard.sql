-- Spec 007 · T1: the totals of the admin Home and Dashboard and the sales by type (RF-1 to RF-3, RF-6
-- to RF-8, RF-11, RF-20, RF-21). Nothing new is stored: everything comes from what orders and their
-- lines already keep (the total, the real delivery moment, the units and the eggs per unit).
--
-- As delivery_options_at (spec 004), the internal *_at functions receive "now" so the tests can fix it,
-- and nobody but their owner can call them. The public functions check that the caller is the admin and
-- use the real clock. Day, week (from Monday), month and year are calendar periods in Buenos Aires.

-- RF-1 to RF-3, RF-6: income of today, of this week and of this month (the totals saved in the orders
-- delivered in each period, by their real delivery moment), the orders delivered today and the orders
-- still to deliver today: accepted or on the way for today or a past day (the "Para hoy" section of
-- spec 005). Delivered orders are cash collected (decision of 2026-11-05).
create function public.admin_totals_at(p_now timestamptz)
returns table (
  income_today bigint,
  delivered_today integer,
  to_deliver integer,
  income_week bigint,
  income_month bigint
)
language sql
stable
set search_path = ''
as $$
  with local as (
    select p_now at time zone 'America/Argentina/Buenos_Aires' as moment
  ),
  periods as (
    select
      date_trunc('day', moment) at time zone 'America/Argentina/Buenos_Aires' as day_start,
      date_trunc('week', moment) at time zone 'America/Argentina/Buenos_Aires' as week_start,
      date_trunc('month', moment) at time zone 'America/Argentina/Buenos_Aires' as month_start,
      moment::date as today
    from local
  ),
  delivered as (
    select o.total, o.delivered_at
    from public.orders o, periods p
    where o.status = 'delivered'
      and o.delivered_at >= least(p.week_start, p.month_start)
      and o.delivered_at <= p_now
  )
  select
    coalesce((select sum(d.total) from delivered d where d.delivered_at >= p.day_start), 0)::bigint,
    (select count(*) from delivered d where d.delivered_at >= p.day_start)::integer,
    (
      select count(*)
      from public.orders o
      where o.status in ('accepted', 'on_the_way') and o.delivery_date <= p.today
    )::integer,
    coalesce((select sum(d.total) from delivered d where d.delivered_at >= p.week_start), 0)::bigint,
    coalesce((select sum(d.total) from delivered d where d.delivered_at >= p.month_start), 0)::bigint
  from periods p;
$$;

-- RF-7, RF-8, RF-11, RF-20: per egg type (active or not, in the order they were created), the eggs sold
-- this week, this month and this year in maple and pack lines (30 and 180 eggs per unit; half dozens
-- are left out, spec 007) of the orders delivered in each period. The type comes from the product of
-- the line, so a renamed or deactivated product still adds to its type. The three periods come
-- together, so switching period in the app asks nothing again (RF-9).
create function public.admin_sales_by_type_at(p_now timestamptz)
returns table (
  egg_type_id bigint,
  name text,
  active boolean,
  eggs_week bigint,
  eggs_month bigint,
  eggs_year bigint
)
language sql
stable
set search_path = ''
as $$
  with local as (
    select p_now at time zone 'America/Argentina/Buenos_Aires' as moment
  ),
  periods as (
    select
      date_trunc('week', moment) at time zone 'America/Argentina/Buenos_Aires' as week_start,
      date_trunc('month', moment) at time zone 'America/Argentina/Buenos_Aires' as month_start,
      date_trunc('year', moment) at time zone 'America/Argentina/Buenos_Aires' as year_start
    from local
  ),
  sold as (
    select pr.egg_type_id, o.delivered_at, i.quantity * i.unit_eggs as eggs
    from public.orders o
    join public.order_items i on i.order_id = o.id
    join public.products pr on pr.id = i.product_id
    cross join periods p
    where o.status = 'delivered'
      and o.delivered_at >= least(p.week_start, p.year_start)
      and o.delivered_at <= p_now
      and i.unit_eggs in (30, 180)
  )
  select
    t.id,
    t.name,
    t.active,
    coalesce(sum(s.eggs) filter (where s.delivered_at >= p.week_start), 0)::bigint,
    coalesce(sum(s.eggs) filter (where s.delivered_at >= p.month_start), 0)::bigint,
    coalesce(sum(s.eggs), 0)::bigint
  from public.egg_types t
  cross join periods p
  left join sold s on s.egg_type_id = t.id
  group by t.id, t.name, t.active, p.week_start, p.month_start
  order by t.id;
$$;

-- Supabase grants execute on new functions to anon and authenticated by default: take it away.
revoke execute on function public.admin_totals_at(timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_sales_by_type_at(timestamptz) from public, anon, authenticated;

-- RF-21: only the admin gets totals and sales by type; anyone else gets 42501. They run as their owner
-- to call the internal functions with the real clock.
create function public.admin_totals()
returns table (
  income_today bigint,
  delivered_today integer,
  to_deliver integer,
  income_week bigint,
  income_month bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only the admin reads the totals' using errcode = '42501';
  end if;
  return query select * from public.admin_totals_at(now());
end;
$$;

create function public.admin_sales_by_type()
returns table (
  egg_type_id bigint,
  name text,
  active boolean,
  eggs_week bigint,
  eggs_month bigint,
  eggs_year bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only the admin reads the sales by type' using errcode = '42501';
  end if;
  return query select * from public.admin_sales_by_type_at(now());
end;
$$;

revoke execute on function public.admin_totals() from public, anon;
revoke execute on function public.admin_sales_by_type() from public, anon;
grant execute on function public.admin_totals() to authenticated;
grant execute on function public.admin_sales_by_type() to authenticated;
