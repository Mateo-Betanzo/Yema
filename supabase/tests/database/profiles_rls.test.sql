-- Spec 002 · T3: who can read and change profiles through the API.
-- RF-32, RF-33, RF-34, RF-35, RF-36, RF-38. Each block switches to the role of the API caller
-- (anon or authenticated with the user's id in the JWT claims) and goes back with "reset role".
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

create function pg_temp.sign_up(user_id uuid, email text, first_name text)
returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (user_id, email, jsonb_build_object(
    'first_name', first_name,
    'last_name', 'Pérez',
    'phone', '1133445566',
    'address', 'Av. Rivadavia 4521',
    'address_notes', 'Timbre B'
  ));
$$;

-- Two clients and the admin (registered as a client and promoted with SQL, like in the README).
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000a1', 'ana@example.com', 'Ana');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000b2', 'beto@example.com', 'Beto');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000c3', 'admin@example.com', 'Admin');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000c3';
-- The local database may hold real accounts (manual QA): tests look only at their own users, and
-- "every profile" is compared with the count the table owner sees.
select set_config('test.profile_count', (select count(*) from public.profiles)::text, true);

-- anon: no access at all (RF-38)
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok(
  $$ insert into public.profiles (id, first_name, last_name, phone, address)
     values ('00000000-0000-0000-0000-0000000000a1', 'X', 'Y', '1133445566', 'Z') $$,
  '42501', null, 'anon cannot create profiles'
);
select throws_ok(
  $$ update public.profiles set first_name = 'X' $$,
  '42501', null, 'anon cannot change profiles'
);
select is(public.is_admin(), false, 'is_admin() is false without a session');

-- Client Ana
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'RF-32: a client reads only their own profile'
);
select is(public.is_admin(), false, 'is_admin() is false for a client');

select lives_ok(
  $$ update public.profiles
     set first_name = 'Ana María', last_name = 'Gómez', phone = '11 5566-7788',
         address = 'Corrientes 1234', address_notes = null
     where id = '00000000-0000-0000-0000-0000000000a1' $$,
  'RF-33: a client updates the allowed columns of their profile'
);
select results_eq(
  $$ select first_name, last_name, phone, address, address_notes from public.profiles $$,
  $$ values ('Ana María'::text, 'Gómez'::text, '1155667788'::text, 'Corrientes 1234'::text, null::text) $$,
  'RF-33: the changes are saved and normalized'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'RF-34: a client cannot change their role'
);
select throws_ok(
  $$ update public.profiles set id = '00000000-0000-0000-0000-0000000000d4' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'RF-34: a client cannot change the id of their profile'
);
select lives_ok(
  $$ update public.profiles set first_name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000b2' $$,
  'RF-34: updating another profile matches no rows'
);

select throws_ok(
  $$ update public.profiles set phone = '12345' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'RF-35: an invalid phone is rejected through the API'
);
select throws_ok(
  $$ update public.profiles set address = '  ' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'RF-35: a client cannot leave the address empty'
);
select throws_ok(
  $$ update public.profiles set last_name = repeat('a', 51) where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'RF-35: a last name longer than 50 characters is rejected'
);

select throws_ok(
  $$ insert into public.profiles (id, first_name, last_name, phone, address)
     values ('00000000-0000-0000-0000-0000000000d4', 'X', 'Y', '1133445566', 'Z') $$,
  '42501', null, 'RF-38: a client cannot create profiles'
);
select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'a client cannot delete profiles'
);
select throws_ok(
  $$ truncate public.profiles $$,
  '42501', null, 'a client cannot truncate profiles'
);
select throws_ok(
  $$ select email from auth.users $$,
  '42501', null, 'RF-36: a client cannot read the emails of the accounts'
);

-- Admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);

select is(public.is_admin(), true, 'is_admin() is true for the admin');
select is(
  (select count(*)::text from public.profiles),
  current_setting('test.profile_count'),
  'RF-36: the admin reads every profile'
);
select throws_ok(
  $$ select email from auth.users $$,
  '42501', null, 'RF-36: the admin cannot read the emails of the clients'
);
select lives_ok(
  $$ update public.profiles set first_name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000b2' $$,
  'the admin updating a client profile matches no rows'
);
select throws_ok(
  $$ update public.profiles set role = 'client' where id = '00000000-0000-0000-0000-0000000000c3' $$,
  '42501', null, 'RF-38: not even the admin changes a role through the API'
);

-- Back to the owner: nothing changed where it should not
reset role;

select is(
  (select first_name from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'),
  'Beto',
  'RF-34: the profile of another account stays unchanged'
);
select results_eq(
  $$ select id, role::text from public.profiles where id::text like '00000000-0000-0000-0000-0000000000%' order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'client'::text),
            ('00000000-0000-0000-0000-0000000000b2'::uuid, 'client'::text),
            ('00000000-0000-0000-0000-0000000000c3'::uuid, 'admin'::text) $$,
  'RF-34 / RF-38: the roles stay as they were'
);

select * from finish();
rollback;
