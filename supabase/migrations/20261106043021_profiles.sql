-- Spec 002 · T2: profiles and the automatic profile on sign-up.
-- Permissions (RLS policies and column grants) come in the next migration (T3); until then RLS is on
-- with no policies, so the API can neither read nor write profiles.

create type public.user_role as enum ('client', 'admin');

create table public.profiles (
  -- No "on delete cascade": deleting an account must not erase its profile (constitution, principle 7).
  id uuid primary key references auth.users (id),
  first_name text not null check (char_length(first_name) between 1 and 50),
  last_name text not null check (char_length(last_name) between 1 and 50),
  -- 10 digits with the area code, without the leading 0 or the 15 (RF-7).
  phone text check (phone ~ '^[1-9][0-9]{9}$'),
  address text check (char_length(address) between 1 and 120),
  address_notes text check (char_length(address_notes) between 1 and 120),
  role public.user_role not null default 'client',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A client needs contact data for the delivery; the admin may leave it empty (RF-35, RF-37).
  constraint profiles_client_contact check (role = 'admin' or (phone is not null and address is not null))
);

comment on table public.profiles is 'One row per account: delivery and contact data plus the role.';
comment on column public.profiles.address_notes is 'Optional references for the delivery person.';

alter table public.profiles enable row level security;

-- RF-8: texts without surrounding spaces, the phone with digits only, empty optional texts as null.
create function public.normalize_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_name := btrim(new.first_name);
  new.last_name := btrim(new.last_name);
  new.phone := nullif(regexp_replace(new.phone, '[ -]', '', 'g'), '');
  new.address := nullif(btrim(new.address), '');
  new.address_notes := nullif(btrim(new.address_notes), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger normalize_profile
before insert or update on public.profiles
for each row execute function public.normalize_profile();

-- RF-4, RF-14, RF-15: every account created through Auth gets a client profile from its sign-up data.
-- The role is always 'client', whatever the metadata says. If the data breaks a check, the insert into
-- auth.users fails in the same transaction, so no account is left without a profile.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, address, address_notes, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'address_notes',
    'client'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
