-- Spec 003, cambio del RF-34 (2026-11-18) · T15: "Eliminar" archives types, formats and products.
-- Nothing is deleted (constitution, principle 7): archived_at marks the row, which stays for the order
-- history, the stock movements and the sales by type. Only the RPC of T16 write archived_at: the column
-- grants of 20261109004012_catalog_permissions.sql do not include it, so nobody can through the API.

alter table public.egg_types add column archived_at timestamptz;
alter table public.formats add column archived_at timestamptz;
alter table public.products add column archived_at timestamptz;

comment on column public.egg_types.archived_at is 'When the admin deleted it from the app (RF-44 to RF-52); null = not deleted. Final.';
comment on column public.formats.archived_at is 'When the admin deleted it from the app (RF-44 to RF-52); null = not deleted. Final.';
comment on column public.products.archived_at is 'When the admin deleted it from the app (RF-44 to RF-52); null = not deleted. Final.';

-- RF-50: what is archived frees its name and its combination of type and format. Same names as before,
-- so the app keeps translating the duplicates (src/logic/catalog-errors.ts).
drop index public.egg_types_name_key;
create unique index egg_types_name_key on public.egg_types (lower(name)) where archived_at is null;
drop index public.formats_name_key;
create unique index formats_name_key on public.formats (lower(name)) where archived_at is null;
alter table public.products drop constraint products_type_format_key;
create unique index products_type_format_key on public.products (egg_type_id, format_id) where archived_at is null;

-- RF-49: the load format is never archived, as it is never deactivated (formats_load_format_active).
alter table public.formats
  add constraint formats_load_format_not_archived check (not is_load_format or archived_at is null);

-- RF-52: archiving is final, for everyone (also the RPC and whoever skips the API): once set,
-- archived_at neither goes back to null nor changes.
create function public.keep_archived()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then
    raise exception 'archived_is_final';
  end if;
  return new;
end;
$$;

create trigger keep_archived before update on public.egg_types
  for each row execute function public.keep_archived();
create trigger keep_archived before update on public.formats
  for each row execute function public.keep_archived();
create trigger keep_archived before update on public.products
  for each row execute function public.keep_archived();
