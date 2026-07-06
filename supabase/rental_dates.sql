-- Run in Supabase Dashboard → SQL Editor, after customers_orders.sql.
-- Adds rental-period tracking to OrderLines so online rental bookings can
-- share the same Orders/OrderLines pipeline (and manager dashboard) as sales.
-- Both columns stay null for ordinary sale lines.

alter table "OrderLines"
  add column if not exists "RentalStartDate" date,
  add column if not exists "RentalEndDate"   date;

alter table "OrderLines"
  drop constraint if exists "OrderLines_rental_dates_check";

alter table "OrderLines"
  add constraint "OrderLines_rental_dates_check"
  check (
    ("RentalStartDate" is null and "RentalEndDate" is null)
    or ("RentalStartDate" is not null and "RentalEndDate" is not null and "RentalEndDate" > "RentalStartDate")
  );
