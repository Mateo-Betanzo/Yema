-- Spec 003, cambio del RF-34 (2026-11-18): "Eliminar" archives types, formats and products.
-- T15: the column, the unique rules that ignore what is archived (RF-50), archiving cannot be undone
-- (RF-52), the load format is never archived (RF-49) and nobody writes archived_at through the API
-- (RF-52). T16: archive_product, archive_egg_type and archive_format, only for the admin, with their
-- blocks (RF-45 to RF-49, RF-52). T17: what is archived leaves the lists, the Shop and the sales (RF-45)
-- and stays in the history (RF-51). The local database may hold real data: tests only look at what they
-- create.
begin;
create extension if not exists pgtap with schema extensions;

select plan(53);

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000a1', 'cliente@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000b2', 'otro@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000c3', 'admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000c3';

create function pg_temp.type_id(type_name text) returns bigint language sql as
  $$ select id from public.egg_types where name = type_name and archived_at is null $$;
create function pg_temp.format_id(format_name text) returns bigint language sql as
  $$ select id from public.formats where name = format_name and archived_at is null $$;

-- The QA products of the local database go away inside this transaction (the rollback brings them back).
truncate public.products cascade;

select has_column('public', 'egg_types', 'archived_at', 'egg_types has archived_at');
select has_column('public', 'formats', 'archived_at', 'formats has archived_at');
select has_column('public', 'products', 'archived_at', 'products has archived_at');

-- RF-50: what is archived frees its name and its combination; what is not still holds them.
insert into public.egg_types (name) values ('QA Tipo');
update public.egg_types set archived_at = now() where name = 'QA Tipo';
select lives_ok($$ insert into public.egg_types (name) values (' qa tipo') $$,
  'RF-50: a type can take the name of an archived one');
select throws_ok($$ insert into public.egg_types (name) values ('QA TIPO') $$,
  '23505', null, 'RF-3: two types that are not archived still cannot share a name');

insert into public.formats (name, eggs) values ('QA Docena', 12);
update public.formats set archived_at = now() where name = 'QA Docena';
select lives_ok($$ insert into public.formats (name, eggs) values ('qa docena', 12) $$,
  'RF-50: a format can take the name of an archived one');

insert into public.products (egg_type_id, format_id, name, price)
  values (pg_temp.type_id('Medianos'), pg_temp.format_id('Pack'), 'QA Pack Mediano', 10500);
update public.products set archived_at = now() where name = 'QA Pack Mediano';
select lives_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Medianos'), pg_temp.format_id('Pack'), 'QA Pack Mediano', 11000) $$,
  'RF-50: a product can take the type and format of an archived one'
);
select throws_ok(
  $$ insert into public.products (egg_type_id, format_id, name, price)
     values (pg_temp.type_id('Medianos'), pg_temp.format_id('Pack'), 'QA Otro Pack', 11000) $$,
  '23505', null, 'RF-12: two products that are not archived still cannot share type and format'
);

-- RF-52: archiving is final, also for whoever skips the API.
select throws_ok($$ update public.egg_types set archived_at = null where name = 'QA Tipo' and archived_at is not null $$,
  'P0001', 'archived_is_final', 'RF-52: an archived type cannot come back');
select throws_ok($$ update public.products set archived_at = now() - interval '1 day' where archived_at is not null $$,
  'P0001', 'archived_is_final', 'RF-52: the date of an archived product does not change');
select lives_ok($$ update public.egg_types set name = 'QA Tipo viejo' where name = 'QA Tipo' and archived_at is not null $$,
  'other columns of an archived row can still change (the rule is only about archived_at)');

-- RF-49: the load format is never archived.
select throws_ok($$ update public.formats set archived_at = now() where is_load_format $$,
  '23514', null, 'RF-49: the load format cannot be archived');

-- RF-52: nobody writes archived_at through the API, not even the admin (only the RPC of T16 do).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);
select throws_ok($$ update public.egg_types set archived_at = now() where name = 'Super' $$,
  '42501', null, 'RF-52: the admin cannot archive by updating the table');
select throws_ok($$ insert into public.formats (name, eggs, archived_at) values ('QA Archivado', 6, now()) $$,
  '42501', null, 'RF-52: nor insert something already archived');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$ update public.products set archived_at = now() $$,
  '42501', null, 'RF-52: a client cannot archive');

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ update public.formats set archived_at = now() $$,
  '42501', null, 'RF-52: anon cannot archive');

-- T16: the RPC. The catalog of these tests, created by postgres (as the admin's forms would):
reset role;
insert into public.egg_types (name, stock) values ('QA Con productos', 0), ('QA Lleno', 30), ('QA Vacío', 0);
insert into public.formats (name, eggs) values ('QA Bandeja', 10), ('QA Sin productos', 20);
insert into public.products (egg_type_id, format_id, name, price, active) values
  (pg_temp.type_id('QA Con productos'), pg_temp.format_id('QA Bandeja'), 'QA Libre', 1000, true),
  (pg_temp.type_id('QA Con productos'), pg_temp.format_id('Maple'), 'QA Inactivo', 3000, false),
  (pg_temp.type_id('Medianos'), pg_temp.format_id('QA Bandeja'), 'QA En pedido', 1000, true);

-- The ids, read once by postgres: anon and the clients cannot read the catalog to look them up.
create temporary table ids on commit drop as
  select name, id from public.products where name like 'QA %'
  union all select name, id from public.egg_types where archived_at is null
  union all select name, id from public.formats where archived_at is null;
grant select on ids to anon, authenticated;
create function pg_temp.id_of(row_name text) returns bigint language sql as
  $$ select id from ids where name = row_name $$;
create function pg_temp.archived(tbl text, row_name text) returns timestamptz language plpgsql as $$
declare
  v timestamptz;
begin
  execute format('select archived_at from public.%I where name = $1', tbl) into v using row_name;
  return v;
end;
$$;
-- The hint of the error a call raises (the names, the eggs), or null.
create function pg_temp.hint_of(call text) returns text language plpgsql as $$
declare
  v_hint text;
begin
  execute call;
  return null;
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return v_hint;
end;
$$;

-- A pending order of a client with "QA En pedido" (RF-47).
insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, total, address, address_notes)
select '00000000-0000-0000-0000-0000000000a1', s.id, current_date + 1, s.starts_at, s.ends_at, 1000, 'Calle 1', null
from public.delivery_slots s order by s.id limit 1;
insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
select max(o.id), pg_temp.id_of('QA En pedido'), 1, 1000, 10
from public.orders o where o.client_id = '00000000-0000-0000-0000-0000000000a1';

-- RF-52: only the admin.
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(format('select public.archive_product(%s)', pg_temp.id_of('QA Libre')),
  '42501', null, 'RF-52: anon cannot archive a product');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select throws_ok(format('select public.archive_product(%s)', pg_temp.id_of('QA Libre')),
  '42501', null, 'RF-52: a client cannot archive a product');
select throws_ok(format('select public.archive_egg_type(%s)', pg_temp.id_of('QA Vacío')),
  '42501', null, 'RF-52: a client cannot archive a type');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated"}', true);
select throws_ok(format('select public.archive_format(%s)', pg_temp.id_of('QA Sin productos')),
  '42501', null, 'RF-52: another client cannot archive a format');

-- The admin.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);

-- Products: active or inactive; twice changes nothing; not while an order is in course.
select lives_ok(format('select public.archive_product(%s)', pg_temp.id_of('QA Libre')),
  'RF-45: the admin archives an active product');
select isnt(pg_temp.archived('products', 'QA Libre'), null, 'RF-45: it is marked with the date');
select lives_ok(format('select public.archive_product(%s)', pg_temp.id_of('QA Inactivo')),
  'RF-44: an inactive product is archived too');
create temporary table first_archive on commit drop as select pg_temp.archived('products', 'QA Libre') as at;
select lives_ok(format('select public.archive_product(%s)', pg_temp.id_of('QA Libre')),
  'archiving it again is not an error');
select is(pg_temp.archived('products', 'QA Libre'), (select at from first_archive), '...and changes nothing');
select throws_ok(format('select public.archive_product(%s)', pg_temp.id_of('QA En pedido')),
  'P0001', 'product_in_active_order', 'RF-47: a product in a pending order is not archived');
select is(pg_temp.archived('products', 'QA En pedido'), null, 'RF-47: and it stays');
select throws_ok('select public.archive_product(-1)', 'P0002', 'product_not_found', 'an unknown product');

-- Types: not with products left (named in the hint), not with stock (the eggs in the hint).
select throws_ok(format('select public.archive_egg_type(%s)', pg_temp.id_of('Medianos')),
  'P0001', 'has_products', 'RF-46: a type with products that are not archived is not archived');
select is(pg_temp.hint_of(format('select public.archive_egg_type(%s)', pg_temp.id_of('QA Con productos'))),
  null, 'RF-46: once its products are archived, the type is archived');
select isnt(pg_temp.archived('egg_types', 'QA Con productos'), null, '...and marked');
select throws_ok(format('select public.archive_egg_type(%s)', pg_temp.id_of('QA Lleno')),
  'P0001', 'stock_left', 'RF-48: a type with stock is not archived');
select is(pg_temp.hint_of(format('select public.archive_egg_type(%s)', pg_temp.id_of('QA Lleno'))),
  '30', 'RF-48: the hint has the eggs left');
select lives_ok(format('select public.archive_egg_type(%s)', pg_temp.id_of('QA Vacío')),
  'RF-45: a type with no stock and no products is archived');
select throws_ok('select public.archive_egg_type(-1)', 'P0002', 'type_not_found', 'an unknown type');

-- Formats: never the load format; not with products left, named in the hint.
select throws_ok(format('select public.archive_format(%s)', pg_temp.id_of('Pack')),
  'P0001', 'load_format', 'RF-49: the load format is not archived');
select throws_ok(format('select public.archive_format(%s)', pg_temp.id_of('QA Bandeja')),
  'P0001', 'has_products', 'RF-46: a format with products that are not archived is not archived');
select is(pg_temp.hint_of(format('select public.archive_format(%s)', pg_temp.id_of('QA Bandeja'))),
  'QA En pedido', 'RF-46: the hint names them (the archived ones do not count)');
select lives_ok(format('select public.archive_format(%s)', pg_temp.id_of('QA Sin productos')),
  'RF-45: a format without products is archived');
select isnt(pg_temp.archived('formats', 'QA Sin productos'), null, '...and marked');
select throws_ok('select public.archive_format(-1)', 'P0002', 'format_not_found', 'an unknown format');

-- RF-47: once the order is rejected, the product can be archived.
reset role;
update public.orders set status = 'rejected', rejected_at = now()
where client_id = '00000000-0000-0000-0000-0000000000a1' and status = 'pending';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);
select lives_ok(format('select public.archive_product(%s)', pg_temp.id_of('QA En pedido')),
  'RF-47: with its order rejected, the product is archived');

-- T17. A product that can be sold, and a delivered order of the other client with "QA Inactivo" (Maple,
-- 30 eggs, of the type "QA Con productos"), both archived above: the sales by type count it.
reset role;
update public.egg_types set stock = 1000 where name = 'Medianos';
insert into public.products (egg_type_id, format_id, name, price)
  values (pg_temp.type_id('Medianos'), pg_temp.format_id('Maple'), 'QA Vendible', 3500);
insert into ids select name, id from public.products where name = 'QA Vendible';
insert into public.orders (client_id, delivery_slot_id, delivery_date, slot_starts_at, slot_ends_at, status, total,
                           address, accepted_at, on_the_way_at, delivered_at)
select '00000000-0000-0000-0000-0000000000b2', s.id, current_date, s.starts_at, s.ends_at, 'delivered', 3000,
       'Calle 1', now(), now(), now()
from public.delivery_slots s order by s.id limit 1;
insert into public.order_items (order_id, product_id, quantity, unit_price, unit_eggs)
select max(o.id), pg_temp.id_of('QA Inactivo'), 1, 3000, 30
from public.orders o where o.client_id = '00000000-0000-0000-0000-0000000000b2';

-- RF-45: orders and counter sales do not sell what is archived (create_order and create_counter_sale
-- both ask check_items_available).
select throws_ok(format('select public.check_items_available(array[%s]::bigint[], array[1])', pg_temp.id_of('QA Libre')),
  'P0001', 'product_unavailable', 'RF-45: an archived product is not sold');
select is(pg_temp.hint_of(format('select public.check_items_available(array[%s]::bigint[], array[1])', pg_temp.id_of('QA Libre'))),
  'QA Libre', '...and the error names it');
select lives_ok(format('select public.check_items_available(array[%s]::bigint[], array[1])', pg_temp.id_of('QA Vendible')),
  'a product that is not archived is still sold');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.product_overview where name in ('QA Libre', 'QA Inactivo', 'QA En pedido') $$,
  'RF-45: archived products leave Productos and the counter sale');
select isnt_empty($$ select 1 from public.product_overview where name = 'QA Vendible' $$, '...the others stay');
select is_empty($$ select 1 from public.egg_type_overview where name in ('QA Con productos', 'QA Vacío') $$,
  'RF-45: archived types leave Stock and the inventory of the Dashboard');
select ok((select items::text like '%QA En pedido%' from public.admin_order_overview
           where client_id = '00000000-0000-0000-0000-0000000000a1' order by id desc limit 1),
  'RF-51: the orders of the admin keep the archived product, with its name');
select isnt_empty($$ select 1 from public.admin_sales_by_type() where name = 'QA Con productos' and eggs_year = 30 $$,
  'RF-51: Ventas por tipo keeps the archived type in the periods it sold');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.shop_products() where name in ('QA Libre', 'QA En pedido') $$,
  'RF-45: archived products leave the Shop');
select isnt_empty($$ select 1 from public.shop_products() where name = 'QA Vendible' $$, '...the others stay');
select ok(exists (select 1 from public.client_orders() where items::text like '%QA En pedido%'),
  'RF-51: the history of the client keeps the archived product');

reset role;
select * from finish();
rollback;
