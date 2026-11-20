-- Spec 004 · T1: the weekly delivery schedule, orders and their lines, and the initial schedule.
-- Permissions (grants, RLS policies, reservations and views) come in the next migration (T2), and
-- the RPC that creates orders in T3 and T4; until then RLS is on with no policies, so the API can
-- neither read nor write these tables. Nothing has "on delete cascade": orders are never deleted
-- (constitution, principle 7).

create type public.order_status as enum ('pending', 'accepted', 'on_the_way', 'delivered', 'rejected', 'cancelled');

-- A delivery slot that repeats every week (RF-1). weekday follows extract(dow): 0 = Sunday. The
-- client picks a slot on a concrete date; capacity is how many orders fit in it (RF-3).
create table public.delivery_slots (
  id bigint generated always as identity primary key,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  capacity integer not null check (capacity between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint delivery_slots_ends_after_start check (ends_at > starts_at),
  constraint delivery_slots_weekday_start_key unique (weekday, starts_at)
);

-- An order of a client. It keeps the slot hours and the address it was made with (RF-24), because
-- the schedule (spec 009) and the profile can change later. Only create_order inserts orders (T4).
create table public.orders (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.profiles (id),
  delivery_slot_id bigint not null references public.delivery_slots (id),
  delivery_date date not null,
  slot_starts_at time not null,
  slot_ends_at time not null,
  status public.order_status not null default 'pending',
  total integer not null check (total > 0),
  address text not null,
  address_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RF-27: one active order per client, also when two confirmations race.
create unique index orders_one_active_per_client on public.orders (client_id)
  where status in ('pending', 'accepted', 'on_the_way');
-- RF-3: counting the orders that take a place in a slot on a date.
create index orders_slot_places on public.orders (delivery_slot_id, delivery_date)
  where status not in ('rejected', 'cancelled');

-- A line of an order: the price and the eggs per unit it was confirmed with (RF-24, RF-37).
create table public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id),
  product_id bigint not null references public.products (id),
  quantity integer not null check (quantity between 1 and 5),
  unit_price integer not null check (unit_price > 0),
  unit_eggs integer not null check (unit_eggs > 0),
  constraint order_items_order_product_key unique (order_id, product_id)
);

create index order_items_product on public.order_items (product_id);

comment on column public.orders.slot_starts_at is 'Copy of the slot hours when the order was made.';
comment on column public.orders.address is 'Copy of the profile address when the order was made.';
comment on column public.order_items.unit_eggs is 'Eggs per unit of the format when the order was made; reservations use it (RF-37).';

alter table public.delivery_slots enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- updated_at follows the changes of an order.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

-- RF-1: Monday to Saturday, 9 to 11 and 18 to 21, 5 orders each; no deliveries on Sunday. In the
-- migration, not in seed.sql, because production needs it too.
insert into public.delivery_slots (weekday, starts_at, ends_at, capacity)
select weekday, starts_at::time, ends_at::time, 5
from generate_series(1, 6) as weekday,
  (values ('09:00', '11:00'), ('18:00', '21:00')) as hours (starts_at, ends_at);
