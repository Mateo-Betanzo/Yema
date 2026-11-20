-- Spec 005 · T1: what the status changes of an order need. The reason of a rejection or a cancellation
-- (RF-12, RF-15, RF-16), the date of each later state (RF-18, read by the timeline of spec 006 and by
-- "delivered today" of spec 007), and the order a sale movement comes from (RF-14). The function that
-- changes the status comes in T2; until then nothing changes orders through the API (spec 004).

-- RF-16: from 1 to 120 characters; set_order_status (T2) stores no reason as null, never as empty text.
alter table public.orders
  add column status_reason text check (char_length(status_reason) between 1 and 120),
  add column accepted_at timestamptz,
  add column on_the_way_at timestamptz,
  add column delivered_at timestamptz,
  add column rejected_at timestamptz,
  add column cancelled_at timestamptz,
  -- RF-15: the admin cancels only with a reason (a rejection may have none).
  add constraint orders_cancel_reason check (status <> 'cancelled' or status_reason is not null);

comment on column public.orders.status_reason is 'Reason of a rejection (optional) or a cancellation (required).';

-- RF-14: a sale points to its order and carries no packs and no note; only a sale points to an order.
alter table public.stock_movements
  add column order_id bigint references public.orders (id);

create index stock_movements_order on public.stock_movements (order_id) where order_id is not null;

alter table public.stock_movements drop constraint stock_movements_kind_fields;
alter table public.stock_movements add constraint stock_movements_kind_fields check (
  (kind = 'load' and packs is not null and packs between 1 and 100 and order_id is null)
  or (kind = 'adjustment' and packs is null and note is not null and order_id is null)
  or (kind = 'sale' and packs is null and note is null and order_id is not null)
);

comment on column public.stock_movements.order_id is 'The delivered order of a sale movement (spec 005).';
