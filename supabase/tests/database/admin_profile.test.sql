-- Spec 011 · T1: what the admin menu needs from the base, without changing it. "Editar perfil" of the
-- admin leaves the contact optional (RF-17, RF-18): profiles_client_contact asks for phone and address
-- only of clients, and normalize_profile keeps blanks as null. The "Historial de stock" reads the loads
-- and adjustments of every type, archived ones too, with the type name (RF-10, RF-12), and only the
-- admin reads them (RF-23). A client, another client and the admin; each block switches to the role of
-- the API caller and goes back with "reset role". Tests only look at what they create.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

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

-- A type with a load and an adjustment, archived afterwards (spec 003, cambio del RF-34). Written as
-- the table owner: only the RPC write movements and archived_at through the API.
insert into public.egg_types (name) values ('QA Archivado');
insert into public.stock_movements (egg_type_id, kind, eggs, packs, note, created_by)
select id, 'load'::public.stock_movement_kind, 180, 1, null, '00000000-0000-0000-0000-0000000000c3'::uuid from public.egg_types where name = 'QA Archivado'
union all
select id, 'adjustment'::public.stock_movement_kind, 12, null, 'Rotos', '00000000-0000-0000-0000-0000000000c3'::uuid from public.egg_types where name = 'QA Archivado';
update public.egg_types set archived_at = now() where name = 'QA Archivado';

-- Admin
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);

select lives_ok(
  $$ update public.profiles set phone = null, address = null, address_notes = null
     where id = '00000000-0000-0000-0000-0000000000c3' $$,
  'RF-18: the admin empties their phone, address and notes'
);
select results_eq(
  $$ select phone, address, address_notes from public.profiles where id = '00000000-0000-0000-0000-0000000000c3' $$,
  $$ values (null::text, null::text, null::text) $$,
  'RF-18: the empty contact of the admin is stored as null'
);
select lives_ok(
  $$ update public.profiles set phone = ' 11 3344-5566 ', address = ' Calle 1 ', address_notes = ' Timbre '
     where id = '00000000-0000-0000-0000-0000000000c3' $$,
  'RF-18: the admin fills their contact again'
);
select lives_ok(
  $$ update public.profiles set phone = ' - - ', address = '   ', address_notes = '  '
     where id = '00000000-0000-0000-0000-0000000000c3' $$,
  'RF-17: the admin saves a contact with only spaces and hyphens'
);
select results_eq(
  $$ select phone, address, address_notes from public.profiles where id = '00000000-0000-0000-0000-0000000000c3' $$,
  $$ values (null::text, null::text, null::text) $$,
  'RF-17: only spaces (and hyphens in the phone) count as empty and are stored as null'
);
select results_eq(
  $$ select t.name, m.kind::text, m.eggs, m.packs, m.note
     from public.stock_movements m join public.egg_types t on t.id = m.egg_type_id
     where t.name = 'QA Archivado' order by m.kind $$,
  $$ values ('QA Archivado'::text, 'load'::text, 180, 1, null::text),
            ('QA Archivado'::text, 'adjustment'::text, 12, null::integer, 'Rotos'::text) $$,
  'RF-10, RF-12: the admin reads the loads and adjustments of an archived type, with its name'
);

-- Client Ana
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);

select throws_ok(
  $$ update public.profiles set phone = null where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'RF-23: a client cannot empty their phone'
);
select throws_ok(
  $$ update public.profiles set address = '   ' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'RF-23: a client cannot leave their address blank'
);
select lives_ok(
  $$ update public.profiles set first_name = 'Hacked', phone = null where id = '00000000-0000-0000-0000-0000000000b2' $$,
  'RF-23: a client updating another client profile matches no rows'
);
select is_empty(
  $$ select * from public.stock_movements $$,
  'RF-23: a client reads no stock movements'
);

-- Back to the owner: nothing changed where it should not
reset role;

select results_eq(
  $$ select first_name, phone from public.profiles where id = '00000000-0000-0000-0000-0000000000b2' $$,
  $$ values ('Beto'::text, '1133445566'::text) $$,
  'RF-23: the profile of the other client stays unchanged'
);
select results_eq(
  $$ select phone, address from public.profiles where id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('1133445566'::text, 'Av. Rivadavia 4521'::text) $$,
  'RF-23: the client keeps their phone and address'
);

select * from finish();
rollback;
