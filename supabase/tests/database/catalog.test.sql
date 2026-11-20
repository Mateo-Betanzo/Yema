-- Spec 003 · T1: catalog tables, their rules and the initial data.
-- RF-1, RF-3, RF-7, RF-10, RF-12, RF-13 and principle 7 (no cascade delete). Runs as the table owner:
-- permissions are tested in catalog_rls.test.sql and stock.test.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- Schema
select has_table('public', 'egg_types', 'egg_types exists');
select has_table('public', 'formats', 'formats exists');
select has_table('public', 'products', 'products exists');
select has_table('public', 'stock_movements', 'stock_movements exists');

-- RF-1: initial data. The local database may hold QA data (stock, products, more types or formats),
-- so this checks only what the migration created and use does not change: the first rows. "Stock 0"
-- and "no products" only hold on a fresh database (npx supabase db reset).
select results_eq(
  $$ select name from public.egg_types order by id limit 4 $$,
  $$ values ('Medianos'::text), ('Grandes'), ('Super'), ('Cajitas') $$,
  'RF-1: the four initial types'
);
select results_eq(
  $$ select name, eggs, is_load_format from (select * from public.formats order by id limit 3) f order by eggs $$,
  $$ values ('Media docena'::text, 6, false), ('Maple', 30, false), ('Pack', 180, true) $$,
  'RF-1: the three initial formats, with Pack as the load format'
);

-- From here on, an empty catalog: QA products and stock are removed inside this transaction, and the
-- rollback at the end brings them back.
truncate public.products cascade;
update public.egg_types set stock = 0;

-- RF-3: types
select throws_ok($$ insert into public.egg_types (name) values ('   ') $$, '23514', null, 'RF-3: a blank type name is rejected');
select throws_ok(
  $$ insert into public.egg_types (name) values (repeat('a', 31)) $$,
  '23514', null, 'RF-3: a type name of 31 characters is rejected'
);
select lives_ok($$ insert into public.egg_types (name) values (repeat('a', 30)) $$, 'RF-3: 30 characters are accepted');
select throws_ok(
  $$ insert into public.egg_types (name) values ('  medianos ') $$,
  '23505', null, 'RF-3: a name equal to another but for case and spaces is rejected'
);
select lives_ok($$ insert into public.egg_types (name) values ('Súper') $$, 'RF-3: accents count ("Súper" is not "Super")');
select is(
  (select name from public.egg_types where name = 'Súper'),
  'Súper',
  'names are stored trimmed'
);
select throws_ok(
  $$ update public.egg_types set stock = -1 where name = 'Medianos' $$,
  '23514', null, 'the stock of a type is never negative'
);

-- RF-7, RF-10: formats
select throws_ok($$ insert into public.formats (name, eggs) values ('Cero', 0) $$, '23514', null, 'RF-7: 0 eggs are rejected');
select throws_ok($$ insert into public.formats (name, eggs) values ('Mil uno', 1001) $$, '23514', null, 'RF-7: 1001 eggs are rejected');
select lives_ok($$ insert into public.formats (name, eggs) values ('Docena', 12) $$, 'RF-7: a valid format is accepted');
select throws_ok($$ insert into public.formats (name, eggs) values (' MAPLE', 30) $$, '23505', null, 'RF-7: a repeated format name is rejected');
select throws_ok(
  $$ insert into public.formats (name, eggs) values (repeat('f', 31), 10) $$,
  '23514', null, 'RF-7: a format name of 31 characters is rejected'
);
select throws_ok(
  $$ update public.formats set active = false where name = 'Pack' $$,
  '23514', null, 'RF-10: the load format cannot be deactivated'
);
select throws_ok(
  $$ update public.formats set is_load_format = true where name = 'Maple' $$,
  '23505', null, 'there is only one load format'
);
select lives_ok(
  $$ update public.formats set name = 'Cajón', eggs = 360 where name = 'Pack' $$,
  'RF-8: the load format can be renamed and change its eggs'
);
select lives_ok($$ update public.formats set active = false where name = 'Maple' $$, 'RF-9: another format can be deactivated');

-- RF-12, RF-13: products
create function pg_temp.type_id(type_name text) returns bigint language sql as
  $$ select id from public.egg_types where name = type_name $$;
create function pg_temp.format_id(format_name text) returns bigint language sql as
  $$ select id from public.formats where name = format_name $$;

select lives_ok(
  $$ insert into public.products (egg_type_id, format_id, name, description, price)
     values (pg_temp.type_id('Medianos'), pg_temp.format_id('Cajón'), ' Pack Mediano ', '6 maples medianos', 10500) $$,
  'RF-11: a valid product is accepted'
);
select results_eq(
  $$ select name, description, price, active from public.products $$,
  $$ values ('Pack Mediano'::text, '6 maples medianos'::text, 10500, true) $$,
  'the product is stored trimmed and active'
);
select throws_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Medianos'), pg_temp.format_id('Cajón'), 'Otro', 1) $$,
  '23505', null, 'RF-12: a second product with the same type and format is rejected'
);
update public.products set active = false where name = 'Pack Mediano';
select throws_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Medianos'), pg_temp.format_id('Cajón'), 'Otro', 1) $$,
  '23505', null, 'RF-12: also when the existing one is inactive'
);
select throws_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Grandes'), pg_temp.format_id('Maple'), 'Maple Grande', 0) $$,
  '23514', null, 'RF-13: price 0 is rejected'
);
select throws_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Grandes'), pg_temp.format_id('Maple'), 'Maple Grande', 10000001) $$,
  '23514', null, 'RF-13: a price above 10.000.000 is rejected'
);
select lives_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Grandes'), pg_temp.format_id('Maple'), repeat('n', 50), 10000000) $$,
  'RF-13: a name of 50 and a price of 10.000.000 are accepted'
);
select throws_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Super'), pg_temp.format_id('Maple'), repeat('n', 51), 100) $$,
  '23514', null, 'RF-13: a name of 51 characters is rejected'
);
select throws_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Super'), pg_temp.format_id('Maple'), '  ', 100) $$,
  '23514', null, 'RF-13: a blank product name is rejected'
);
select throws_ok(
  $$ insert into public.products (egg_type_id, format_id, name, description, price)
     values (pg_temp.type_id('Super'), pg_temp.format_id('Maple'), 'Maple Super', repeat('d', 121), 100) $$,
  '23514', null, 'RF-13: a description of 121 characters is rejected'
);
select lives_ok(
  $$ insert into public.products (egg_type_id, format_id, name, description, price)
     values (pg_temp.type_id('Super'), pg_temp.format_id('Maple'), 'Maple Super', '   ', 100) $$,
  'RF-13: the description is optional'
);
select is(
  (select description from public.products where name = 'Maple Super'),
  null,
  'a blank description becomes null'
);

-- Stock movements (the RPC that create them come in T3)
insert into auth.users (id, email, raw_user_meta_data) values (
  '00000000-0000-0000-0000-0000000000c3', 'admin@example.com',
  '{"first_name": "Admin", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}'
);
create function pg_temp.movement(kind text, eggs integer, packs integer, note text) returns void language sql as $$
  insert into public.stock_movements (egg_type_id, kind, eggs, packs, note, created_by)
  values (pg_temp.type_id('Medianos'), kind::public.stock_movement_kind, eggs, packs, note,
          '00000000-0000-0000-0000-0000000000c3');
$$;
select lives_ok($$ select pg_temp.movement('load', 360, 2, null) $$, 'a load with packs and no note is valid');
select throws_ok($$ select pg_temp.movement('load', 180, null, null) $$, '23514', null, 'a load without packs is rejected');
select throws_ok($$ select pg_temp.movement('load', 18180, 101, null) $$, '23514', null, 'a load of 101 packs is rejected');
select throws_ok($$ select pg_temp.movement('adjustment', 6, null, '  ') $$, '23514', null, 'an adjustment without reason is rejected');
select throws_ok($$ select pg_temp.movement('adjustment', 0, null, 'Rotura') $$, '23514', null, 'a movement of 0 eggs is rejected');

-- Principle 7: nothing disappears through a cascade
select throws_ok(
  $$ delete from public.egg_types where name = 'Grandes' $$,
  '23503', null, 'a type with products cannot be deleted'
);

select * from finish();
rollback;
