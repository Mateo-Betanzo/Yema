-- Spec 002 · T2: profiles table and automatic profile on sign-up.
-- RF-8, RF-14, RF-15, RF-16, RF-35, RF-37 and principle 7 (no cascade delete).
-- Change of 2026-11-19 (T11): RF-46, Google never creates an account.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- Sign-up metadata as the app sends it; each test overrides only what it checks.
create function pg_temp.sign_up(user_id uuid, email text, overrides jsonb default '{}')
returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (user_id, email, jsonb_build_object(
    'first_name', 'Ana',
    'last_name', 'Pérez',
    'phone', '1133445566',
    'address', 'Av. Rivadavia 4521, piso 3 "B"',
    'address_notes', 'Timbre B'
  ) || overrides);
$$;

-- Schema
select has_table('public', 'profiles', 'profiles exists');
select hasnt_column('public', 'profiles', 'email', 'the email is not part of the profile (RF-36)');

-- RF-4 / RF-14: every sign-up creates a client profile
select pg_temp.sign_up('00000000-0000-0000-0000-000000000001', 'ana@example.com');
select results_eq(
  $$ select first_name, last_name, phone, address, address_notes, role::text
     from public.profiles where id = '00000000-0000-0000-0000-000000000001' $$,
  $$ values ('Ana'::text, 'Pérez'::text, '1133445566'::text, 'Av. Rivadavia 4521, piso 3 "B"'::text, 'Timbre B'::text, 'client'::text) $$,
  'sign-up creates the profile from the metadata, as a client'
);

select pg_temp.sign_up('00000000-0000-0000-0000-000000000002', 'mallory@example.com', '{"role": "admin"}');
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-000000000002'),
  'client',
  'RF-14: a role sent in the metadata is ignored'
);

-- RF-8: normalization
select pg_temp.sign_up('00000000-0000-0000-0000-000000000003', 'trim@example.com',
  '{"first_name": "  Luz  ", "last_name": " Gómez ", "phone": "11 3344-5566", "address": "  Calle 1  ", "address_notes": "   "}');
select results_eq(
  $$ select first_name, last_name, phone, address, address_notes
     from public.profiles where id = '00000000-0000-0000-0000-000000000003' $$,
  $$ values ('Luz'::text, 'Gómez'::text, '1133445566'::text, 'Calle 1'::text, null::text) $$,
  'RF-8: texts are trimmed, the phone keeps only digits and empty notes become null'
);

-- RF-15 / RF-35: invalid data stops the sign-up (the account is not created either)
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000010', 'bad1@example.com', '{"phone": "0113344556"}') $$,
  '23514', null, 'a phone starting with 0 is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000011', 'bad2@example.com', '{"phone": "113344556"}') $$,
  '23514', null, 'a phone with 9 digits is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000012', 'bad3@example.com', '{"phone": "11 15 3344 5566"}') $$,
  '23514', null, 'a phone with the 15 (12 digits) is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000013', 'bad4@example.com', '{"phone": "11a3445566"}') $$,
  '23514', null, 'a phone with letters is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000014', 'bad5@example.com', '{"address": "   "}') $$,
  '23514', null, 'a client without address is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000015', 'bad6@example.com', '{"phone": null}') $$,
  '23514', null, 'a client without phone is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000016', 'bad7@example.com', '{"first_name": null}') $$,
  '23502', null, 'a profile without first name is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000017', 'bad8@example.com', '{"last_name": "  "}') $$,
  '23514', null, 'a last name with only spaces is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000018', 'bad9@example.com',
       jsonb_build_object('first_name', repeat('a', 51))) $$,
  '23514', null, 'a first name of 51 characters is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000019', 'bad10@example.com',
       jsonb_build_object('address', repeat('a', 121))) $$,
  '23514', null, 'an address of 121 characters is rejected'
);
select throws_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000020', 'bad11@example.com',
       jsonb_build_object('address_notes', repeat('a', 121))) $$,
  '23514', null, 'notes of 121 characters are rejected'
);
select is(
  (select count(*)::int from auth.users where email like 'bad%@example.com'),
  0,
  'RF-15: no account is left behind when the profile is rejected'
);
select lives_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000021', 'max@example.com',
       jsonb_build_object('first_name', repeat('a', 50), 'address', repeat('a', 120), 'address_notes', repeat('a', 120))) $$,
  'the maximum lengths are accepted'
);

-- RF-46: signing in with Google without an account would create one with Google's metadata (no
-- first or last name of ours, no phone, no address). The profile is rejected, so Auth rolls the account back.
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000030', 'google@example.com', jsonb_build_object(
       'iss', 'https://accounts.google.com',
       'sub', '108234567890123456789',
       'name', 'Ana Pérez',
       'full_name', 'Ana Pérez',
       'email', 'google@example.com',
       'email_verified', true,
       'picture', 'https://lh3.googleusercontent.com/a/photo',
       'avatar_url', 'https://lh3.googleusercontent.com/a/photo',
       'provider_id', '108234567890123456789')) $$,
  '23502', null, 'RF-46: an account with only the metadata of Google is rejected'
);
select is(
  (select count(*)::int from auth.users where email = 'google@example.com'),
  0,
  'RF-46: no account is left behind when Google has no account to enter'
);

-- RF-35: the same rules apply to updates
select throws_ok(
  $$ update public.profiles set phone = '12345' where id = '00000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'RF-35: an update with an invalid phone is rejected'
);

-- RF-16: two accounts may share a phone
select lives_ok(
  $$ select pg_temp.sign_up('00000000-0000-0000-0000-000000000022', 'family@example.com') $$,
  'RF-16: a second account with the same phone is accepted'
);

-- RF-37: the admin needs first and last name; contact data may be empty
select lives_ok(
  $$ update public.profiles set role = 'admin', phone = null, address = null, address_notes = null
     where id = '00000000-0000-0000-0000-000000000001' $$,
  'RF-37: an admin profile without phone or address is valid'
);

-- Principle 7: a profile cannot disappear by deleting its account
select throws_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-000000000001' $$,
  '23503', null, 'deleting an account with a profile is rejected'
);

select * from finish();
rollback;
