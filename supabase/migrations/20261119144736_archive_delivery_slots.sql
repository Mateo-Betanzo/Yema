-- Spec 009, cambio del 2026-11-19 · T7: "Eliminar" archives a delivery slot (RF-12, RF-20 to RF-25), as
-- spec 003 archives products, types and formats: nothing is deleted from the base (principle 7) and only
-- archive_delivery_slot writes archived_at, after checking that the caller is the admin and that the
-- slot has no orders in progress. Orders keep their day and a copy of the hours (spec 004), and
-- delivery_options() offers only active slots, so neither changes.

-- RF-21: when the admin deleted it; null = not deleted. Final: the column grants of the schedule (T1)
-- do not include it, so no API role writes it.
alter table public.delivery_slots add column archived_at timestamptz;
comment on column public.delivery_slots.archived_at is 'When the admin deleted it from the app (spec 009, RF-20 to RF-25); null = not deleted. Final.';

-- RF-21, RF-23: a deleted slot is never offered again and never counts for delivery_slots_no_overlap,
-- which only compares active slots.
alter table public.delivery_slots
  add constraint delivery_slots_archived_inactive check (archived_at is null or not active);

-- RF-9, RF-23: one start per day among the slots that are not deleted; a deleted one frees its day and
-- hour. Same name as the constraint it replaces, so the app still recognizes the 23505.
alter table public.delivery_slots drop constraint delivery_slots_weekday_start_key;
create unique index delivery_slots_weekday_start_key on public.delivery_slots (weekday, starts_at)
  where archived_at is null;

-- RF-21, RF-25: a deleted slot is neither edited nor turned on again through the API.
drop policy "delivery_slots: admin changes" on public.delivery_slots;
create policy "delivery_slots: admin changes" on public.delivery_slots for update to authenticated
  using ((select public.is_admin()) and archived_at is null)
  with check ((select public.is_admin()) and archived_at is null);

-- RF-21: the schedule of the admin leaves out what is deleted (same columns as spec 009, T1).
create or replace view public.delivery_slot_overview
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
from public.delivery_slots s
where s.archived_at is null;

-- RF-20 to RF-22, RF-25: the only way to delete a slot, active or inactive. Security definer, as
-- archive_product: it writes archived_at after checking that the caller is the admin. It locks the slot,
-- as create_order and create_counter_sale do, so an order and the deletion of its slot go one after the
-- other and only one of them gets in. Deleting what is already deleted changes nothing. Errors as the
-- other RPC: P0001 with the reason in the message and the count in the hint, P0002 when it does not exist.
create function public.archive_delivery_slot(p_slot_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
  v_active_orders integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select archived_at into v_archived_at from public.delivery_slots where id = p_slot_id for update;
  if not found then
    raise exception 'slot_not_found' using errcode = 'P0002';
  end if;
  if v_archived_at is not null then
    return;
  end if;

  -- RF-22: pending, accepted or on the way, of any day (also the late ones), as delivery_slot_overview.
  select count(*) into v_active_orders
  from public.orders
  where delivery_slot_id = p_slot_id and status in ('pending', 'accepted', 'on_the_way');
  if v_active_orders > 0 then
    raise exception 'slot_has_active_orders' using errcode = 'P0001', hint = v_active_orders::text;
  end if;

  update public.delivery_slots set archived_at = now(), active = false where id = p_slot_id;
end;
$$;

revoke execute on function public.archive_delivery_slot(bigint) from public, anon;
grant execute on function public.archive_delivery_slot(bigint) to authenticated;
