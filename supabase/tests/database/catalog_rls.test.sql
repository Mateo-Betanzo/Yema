-- Spec 003 · T2: who reads and changes the catalog, the admin overview and the shop.
-- RF-14, RF-16, RF-17, RF-26, RF-27, RF-28, RF-32, RF-33, RF-34, RF-35. Each block switches to the
-- role of the API caller (anon or authenticated with the user's id in the JWT claims) and goes back
-- with "reset role". The local database may hold real data: tests only look at what they create.
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000a1', 'cliente@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000c3', 'admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000c3';

create function pg_temp.type_id(type_name text) returns bigint language sql as
  $$ select id from public.egg_types where name = type_name $$;
create function pg_temp.format_id(format_name text) returns bigint language sql as
  $$ select id from public.formats where name = format_name $$;

-- The local database may hold QA products: remove them inside this transaction (the rollback at the
-- end brings them back), so the shop shows only the products below.
truncate public.products cascade;

-- A catalog with one product in each state, named "QA …" so the tests can tell them apart.
insert into public.formats (name, eggs, active) values ('QA Docena', 12, false);
update public.egg_types set active = false where name = 'Cajitas';
update public.egg_types set stock = 360 where name = 'Medianos';
update public.egg_types set stock = 0 where name = 'Grandes';
update public.egg_types set stock = 6 where name = 'Super';
insert into public.products (egg_type_id, format_id, name, description, price, active) values
  (pg_temp.type_id('Medianos'), pg_temp.format_id('Pack'), 'QA Pack Mediano', '6 maples medianos', 10500, true),
  (pg_temp.type_id('Grandes'), pg_temp.format_id('Maple'), 'QA Maple Grande', null, 4000, true),
  (pg_temp.type_id('Super'), pg_temp.format_id('Media docena'), 'QA Media docena Super', null, 1200, true),
  (pg_temp.type_id('Medianos'), pg_temp.format_id('Maple'), 'QA Maple Mediano', null, 3500, false),
  (pg_temp.type_id('Cajitas'), pg_temp.format_id('Maple'), 'QA Maple Cajitas', null, 3800, true),
  (pg_temp.type_id('Medianos'), pg_temp.format_id('QA Docena'), 'QA Docena Mediana', null, 1500, true);

-- anon: no access at all (RF-32, RF-33)
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok($$ select * from public.egg_types $$, '42501', null, 'anon cannot read types');
select throws_ok($$ select * from public.formats $$, '42501', null, 'anon cannot read formats');
select throws_ok($$ select * from public.products $$, '42501', null, 'anon cannot read products');
select throws_ok($$ select * from public.stock_movements $$, '42501', null, 'anon cannot read the stock history');
select throws_ok($$ select * from public.product_overview $$, '42501', null, 'anon cannot read the admin overview');
select throws_ok($$ select * from public.shop_products() $$, '42501', null, 'anon cannot read the shop');

-- Client
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);

select is_empty($$ select * from public.egg_types $$, 'RF-33: a client reads no types (nor their stock)');
select is_empty($$ select * from public.formats $$, 'RF-33: a client reads no formats table');
select is_empty($$ select * from public.products $$, 'RF-33: a client reads no products table');
select is_empty($$ select * from public.stock_movements $$, 'RF-33: a client reads no stock history');
select is_empty($$ select * from public.product_overview $$, 'RF-33: a client reads no admin overview');

select results_eq(
  $$ select name, description, price, format_name, format_eggs, available
     from public.shop_products() where name like 'QA %' $$,
  $$ values ('QA Media docena Super'::text, null::text, 1200, 'Media docena'::text, 6, true),
            ('QA Maple Grande', null, 4000, 'Maple', 30, false),
            ('QA Pack Mediano', '6 maples medianos', 10500, 'Pack', 180, true) $$,
  'RF-26, RF-28: the shop lists only visible products, by format eggs and name, with availability'
);
select ok(
  not exists (
    select 1 from pg_proc p, unnest(p.proargnames) as arg
    where p.proname = 'shop_products' and arg ilike '%stock%'
  ),
  'RF-33: the shop returns no stock quantity'
);

select throws_ok(
  $$ insert into public.egg_types (name) values ('QA Codorniz') $$,
  '42501', null, 'RF-32: a client cannot create types'
);
select throws_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Grandes'), pg_temp.format_id('Pack'), 'QA Pack Grande', 1) $$,
  '42501', null, 'RF-32: a client cannot create products'
);
select lives_ok(
  $$ update public.products set price = 1 where name like 'QA %' $$,
  'RF-32: a client updating products matches no rows'
);
select throws_ok(
  $$ delete from public.products where name like 'QA %' $$,
  '42501', null, 'RF-34: a client cannot delete products'
);

-- Admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);

select results_eq(
  $$ select name, type_name, format_name, units_available, status
     from public.product_overview where name like 'QA %' order by name $$,
  $$ values ('QA Docena Mediana'::text, 'Medianos'::text, 'QA Docena'::text, 30, 'format_inactive'::text),
            ('QA Maple Cajitas', 'Cajitas', 'Maple', 0, 'type_inactive'),
            ('QA Maple Grande', 'Grandes', 'Maple', 0, 'visible'),
            ('QA Maple Mediano', 'Medianos', 'Maple', 12, 'inactive'),
            ('QA Media docena Super', 'Super', 'Media docena', 1, 'visible'),
            ('QA Pack Mediano', 'Medianos', 'Pack', 2, 'visible') $$,
  'RF-16, RF-17, RF-35: the admin sees every product with its units and status, computed in the base'
);
select ok(
  (select count(*) from public.egg_types) >= 4 and (select count(*) from public.formats) >= 4,
  'the admin reads types and formats'
);
select lives_ok($$ select * from public.stock_movements $$, 'the admin reads the stock history');
select ok(
  exists (select 1 from public.shop_products() where name = 'QA Pack Mediano'),
  'the admin can also read the shop'
);

select lives_ok($$ insert into public.egg_types (name) values ('QA Codorniz') $$, 'RF-2: the admin creates a type');
select lives_ok(
  $$ update public.egg_types set name = 'QA Codorniz grande', active = false where name = 'QA Codorniz' $$,
  'RF-4, RF-5: the admin renames and deactivates a type'
);
select lives_ok($$ insert into public.formats (name, eggs) values ('QA Bandeja', 20) $$, 'RF-6: the admin creates a format');
select lives_ok(
  $$ update public.formats set name = 'QA Bandeja grande', eggs = 24, active = false where name = 'QA Bandeja' $$,
  'RF-8, RF-9: the admin changes and deactivates a format'
);
select lives_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Grandes'), pg_temp.format_id('Pack'), 'QA Pack Grande', 20000) $$,
  'RF-11: the admin creates a product'
);
select lives_ok(
  $$ update public.products set name = 'QA Pack Grande XL', description = 'Grande', price = 21000, active = false
     where name = 'QA Pack Grande' $$,
  'RF-14, RF-15: the admin edits the name, description, price and active of a product'
);
select throws_ok(
  $$ update public.products set egg_type_id = pg_temp.type_id('Super') where name = 'QA Pack Grande XL' $$,
  '42501', null, 'RF-14: not even the admin changes the type of a product'
);
select throws_ok(
  $$ update public.products set format_id = pg_temp.format_id('Maple') where name = 'QA Pack Grande XL' $$,
  '42501', null, 'RF-14: not even the admin changes the format of a product'
);
select throws_ok(
  $$ update public.egg_types set stock = 999 where name = 'Grandes' $$,
  '42501', null, 'RF-35: the stock is not changed by hand, only through load_stock and adjust_stock'
);
select throws_ok(
  $$ insert into public.egg_types (name, stock) values ('QA Pato', 999) $$,
  '42501', null, 'RF-35: not even when creating a type'
);
select throws_ok(
  $$ update public.formats set is_load_format = false where name = 'Pack' $$,
  '42501', null, 'the load format is not changed through the API'
);
select throws_ok(
  $$ insert into public.stock_movements (egg_type_id, kind, eggs, packs) values (pg_temp.type_id('Grandes'), 'load', 180, 1) $$,
  '42501', null, 'RF-35: movements are only created by the stock RPC'
);
select throws_ok(
  $$ delete from public.products where name like 'QA %' $$,
  '42501', null, 'RF-34: not even the admin deletes products'
);
select throws_ok($$ truncate public.egg_types cascade $$, '42501', null, 'RF-34: nobody truncates the catalog');

-- Back to the owner: the client's update changed nothing
reset role;
select is(
  (select price from public.products where name = 'QA Pack Mediano'),
  10500,
  'RF-32: the price the client tried to change stays the same'
);

select * from finish();
rollback;
