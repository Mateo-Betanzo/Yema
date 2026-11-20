-- Spec 003 · T1: catalog tables, their rules and the initial data.
-- Permissions (grants, RLS policies, the overview view and the RPC) come in the next migrations (T2,
-- T3); until then RLS is on with no policies, so the API can neither read nor write these tables.
-- Nothing has "on delete cascade": types, formats, products and movements are never deleted
-- (constitution, principle 7).

create type public.stock_movement_kind as enum ('load', 'adjustment');

-- A kind of egg. Its stock is in whole eggs, shared by every format, and only changes through
-- load_stock / adjust_stock (T3).
create table public.egg_types (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 30),
  active boolean not null default true,
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A presentation with a fixed, editable number of eggs. The load format (Pack) prices stock loads:
-- there is exactly one and it cannot be deactivated (RF-10).
create table public.formats (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 30),
  eggs integer not null check (eggs between 1 and 1000),
  active boolean not null default true,
  is_load_format boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint formats_load_format_active check (not is_load_format or active)
);

-- RF-3, RF-7: names are unique ignoring case (the trigger already trims them); accents count.
create unique index egg_types_name_key on public.egg_types (lower(name));
create unique index formats_name_key on public.formats (lower(name));
create unique index formats_single_load_format on public.formats ((true)) where is_load_format;

-- One product per type and format (RF-12), also when the existing one is inactive.
create table public.products (
  id bigint generated always as identity primary key,
  egg_type_id bigint not null references public.egg_types (id),
  format_id bigint not null references public.formats (id),
  name text not null check (char_length(name) between 1 and 50),
  description text check (char_length(description) between 1 and 120),
  price integer not null check (price between 1 and 10000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_type_format_key unique (egg_type_id, format_id)
);

-- A change in the stock of a type. "eggs" is always positive: the kind says whether it adds (load,
-- entered in packs) or subtracts (adjustment, with a reason in "note").
create table public.stock_movements (
  id bigint generated always as identity primary key,
  egg_type_id bigint not null references public.egg_types (id),
  kind public.stock_movement_kind not null,
  eggs integer not null check (eggs > 0),
  packs integer,
  note text check (char_length(note) between 1 and 120),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  -- "is not null" is explicit: a check that evaluates to null passes, so "packs between 1 and 100"
  -- alone would accept a load without packs.
  constraint stock_movements_kind_fields check (
    (kind = 'load' and packs is not null and packs between 1 and 100)
    or (kind = 'adjustment' and packs is null and note is not null)
  )
);

create index stock_movements_history on public.stock_movements (egg_type_id, created_at desc);

comment on column public.egg_types.stock is 'Whole eggs; changes only through load_stock and adjust_stock.';
comment on column public.formats.is_load_format is 'The format stock loads are entered in (Pack).';
comment on column public.stock_movements.eggs is 'Always positive; the kind says whether it adds or subtracts.';

alter table public.egg_types enable row level security;
alter table public.formats enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

-- Names without surrounding spaces; an empty description becomes null; updated_at follows changes.
create function public.normalize_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_table_name = 'products' then
    new.description := nullif(btrim(new.description), '');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger normalize_catalog before insert or update on public.egg_types
for each row execute function public.normalize_catalog();
create trigger normalize_catalog before insert or update on public.formats
for each row execute function public.normalize_catalog();
create trigger normalize_catalog before insert or update on public.products
for each row execute function public.normalize_catalog();

-- An empty note becomes null, so an adjustment without a real reason breaks the kind check (RF-21).
create function public.normalize_stock_movement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.note := nullif(btrim(new.note), '');
  return new;
end;
$$;

create trigger normalize_stock_movement before insert on public.stock_movements
for each row execute function public.normalize_stock_movement();

-- RF-1: the catalog the business starts with. In the migration, not in seed.sql, because production
-- needs it too.
insert into public.egg_types (name) values ('Medianos'), ('Grandes'), ('Super'), ('Cajitas');
insert into public.formats (name, eggs, is_load_format) values
  ('Maple', 30, false),
  ('Pack', 180, true),
  ('Media docena', 6, false);
