-- Spec 005 · T1: a delivery subtracts stock and leaves a "sale" movement in the history of each type
-- (RF-14). Alone in its migration: Postgres does not let a new enum value be used in the same
-- transaction that adds it.
alter type public.stock_movement_kind add value 'sale';
