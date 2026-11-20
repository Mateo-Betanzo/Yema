-- Spec 003 · T3: stock loads and adjustments.
-- RF-8, RF-18, RF-19, RF-20, RF-21, RF-24, RF-32, RF-35. The tests use their own type ("QA Tipo")
-- because the local database may hold real stock.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

create function pg_temp.sign_up(user_id uuid, email text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (user_id, email,
    '{"first_name": "Ana", "last_name": "Pérez", "phone": "1133445566", "address": "Calle 1"}');
$$;
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000a1', 'cliente@example.com');
select pg_temp.sign_up('00000000-0000-0000-0000-0000000000c3', 'admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000c3';

insert into public.egg_types (name) values ('QA Tipo');
create function pg_temp.qa() returns bigint language sql as $$ select id from public.egg_types where name = 'QA Tipo' $$;
create function pg_temp.stock() returns integer language sql as $$ select stock from public.egg_types where name = 'QA Tipo' $$;
-- The error hint of a call, to read the stock that insufficient_stock reports.
create function pg_temp.error_hint(statement text) returns text language plpgsql as $$
declare
  hint text;
begin
  execute statement;
  return null;
exception when others then
  get stacked diagnostics hint = pg_exception_hint;
  return hint;
end;
$$;

-- anon and clients cannot move stock (RF-32)
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.load_stock(pg_temp.qa(), 1) $$, '42501', null, 'anon cannot load stock');
select throws_ok($$ select public.adjust_stock(pg_temp.qa(), 1, 'Rotura') $$, '42501', null, 'anon cannot adjust stock');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$ select public.load_stock(pg_temp.qa(), 1) $$, '42501', null, 'RF-32: a client cannot load stock');
select throws_ok($$ select public.adjust_stock(pg_temp.qa(), 1, 'Rotura') $$, '42501', null, 'RF-32: a client cannot adjust stock');

-- Admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);

-- RF-18: loads
select is(public.load_stock(pg_temp.qa(), 2, ' Proveedor X '), 360, 'RF-18: loading 2 packs of 180 adds 360 eggs and returns the stock');
select is(pg_temp.stock(), 360, 'RF-18: the stock of the type is 360');
select results_eq(
  $$ select kind::text, eggs, packs, note, created_by from public.stock_movements
     where egg_type_id = pg_temp.qa() order by id $$,
  $$ values ('load'::text, 360, 2, 'Proveedor X'::text, '00000000-0000-0000-0000-0000000000c3'::uuid) $$,
  'RF-18: the load is recorded with its packs, eggs, trimmed note and author'
);
select is(public.load_stock(pg_temp.qa(), 1), 540, 'RF-18: the note is optional');
select is(
  (select note from public.stock_movements where egg_type_id = pg_temp.qa() order by id desc limit 1),
  null,
  'a load without note has no note'
);
select throws_ok($$ select public.load_stock(pg_temp.qa(), 0) $$, '23514', null, 'RF-18: 0 packs are rejected');
select throws_ok($$ select public.load_stock(pg_temp.qa(), 101) $$, '23514', null, 'RF-18: 101 packs are rejected');
select throws_ok($$ select public.load_stock(pg_temp.qa(), -1) $$, '23514', null, 'RF-18: negative packs are rejected');
select throws_ok(
  $$ select public.load_stock(pg_temp.qa(), 1, repeat('n', 121)) $$,
  '23514', null, 'RF-21: a note of 121 characters is rejected'
);
select is(pg_temp.stock(), 540, 'rejected loads change nothing');

-- RF-8: a load uses the eggs the load format has at that moment
update public.formats set eggs = 150 where is_load_format;
select is(public.load_stock(pg_temp.qa(), 1), 690, 'RF-8: after changing the load format to 150, one pack adds 150');
select is(
  (select eggs from public.stock_movements where egg_type_id = pg_temp.qa() order by id limit 1),
  360,
  'RF-8: earlier movements keep their eggs'
);

-- RF-19, RF-20, RF-21: adjustments
select is(public.adjust_stock(pg_temp.qa(), 6, ' Rotura '), 684, 'RF-19: an adjustment subtracts eggs and returns the stock');
select results_eq(
  $$ select kind::text, eggs, packs, note from public.stock_movements
     where egg_type_id = pg_temp.qa() order by id desc limit 1 $$,
  $$ values ('adjustment'::text, 6, null::integer, 'Rotura'::text) $$,
  'RF-19: the adjustment is recorded with its eggs and reason'
);
select throws_ok(
  $$ select public.adjust_stock(pg_temp.qa(), 685, 'Conteo') $$,
  'P0001', 'insufficient_stock', 'RF-20: an adjustment below 0 is rejected'
);
select is(
  pg_temp.error_hint($$ select public.adjust_stock(pg_temp.qa(), 685, 'Conteo') $$),
  '684',
  'RF-20: the error says the current stock'
);
select is(public.adjust_stock(pg_temp.qa(), 684, 'Conteo'), 0, 'RF-20: an adjustment down to exactly 0 is accepted');
select throws_ok($$ select public.adjust_stock(pg_temp.qa(), 1, 'Rotura') $$, 'P0001', 'insufficient_stock', 'RF-20: with stock 0 nothing more is subtracted');
select is(public.load_stock(pg_temp.qa(), 1), 150, 'stock loaded again');
select throws_ok($$ select public.adjust_stock(pg_temp.qa(), 6, null) $$, '23514', null, 'RF-21: an adjustment without reason is rejected');
select throws_ok($$ select public.adjust_stock(pg_temp.qa(), 6, '   ') $$, '23514', null, 'RF-21: a blank reason is rejected');
select throws_ok(
  $$ select public.adjust_stock(pg_temp.qa(), 6, repeat('r', 121)) $$,
  '23514', null, 'RF-21: a reason of 121 characters is rejected'
);
select throws_ok($$ select public.adjust_stock(pg_temp.qa(), 0, 'Rotura') $$, '23514', null, 'RF-19: 0 eggs are rejected');
select throws_ok($$ select public.adjust_stock(pg_temp.qa(), -6, 'Rotura') $$, '23514', null, 'RF-19: negative eggs (an adjustment that adds) are rejected');
select is(pg_temp.stock(), 150, 'rejected adjustments change nothing');

select throws_ok($$ select public.load_stock(-1, 1) $$, 'P0002', 'type_not_found', 'a load for a type that does not exist is rejected');
select throws_ok($$ select public.adjust_stock(-1, 1, 'Rotura') $$, 'P0002', 'type_not_found', 'an adjustment for a type that does not exist is rejected');

-- RF-24: movements are not edited nor deleted, not even by the admin
select throws_ok(
  $$ update public.stock_movements set eggs = 1 where egg_type_id = pg_temp.qa() $$,
  '42501', null, 'RF-24: movements are not edited'
);
select throws_ok(
  $$ delete from public.stock_movements where egg_type_id = pg_temp.qa() $$,
  '42501', null, 'RF-24: movements are not deleted'
);

select * from finish();
rollback;
