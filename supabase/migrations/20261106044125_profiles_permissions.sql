-- Spec 002 · T3: who can read and change profiles through the API.

-- Supabase grants every privilege on new tables to anon and authenticated by default.
-- anon gets nothing; authenticated keeps select (filtered by RLS) and may only update the
-- contact columns, so nobody changes "role" or "id" through the API (RF-33, RF-34, RF-38).
-- Profiles are only created by the handle_new_user trigger and are never deleted (principle 7).
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant update (first_name, last_name, phone, address, address_notes) on public.profiles to authenticated;

-- RF-36: whether the current user is the admin. security definer so it reads profiles without
-- going through its own RLS policy (which calls this function).
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- RF-32, RF-36: each client reads their own profile; the admin reads all of them.
create policy "profiles: read own, admin reads all"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

-- RF-33, RF-34: each account changes only its own profile.
create policy "profiles: update own"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));
