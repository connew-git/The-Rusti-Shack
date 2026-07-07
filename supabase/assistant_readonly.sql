-- Run in Supabase Dashboard → SQL Editor, AFTER part_c_analytics_views.sql
-- and part_c_reorder_views.sql.
--
-- Purpose: the read-only, de-identified surface for the "Ask the Data"
-- management assistant (see api/assistant-ask.js). Two things happen here:
--
--   1. De-identified views (asst_*) — the ONLY customer-shaped data the AI
--      is ever allowed to touch. They expose behaviour and an anonymous
--      synthetic CustomerID, and deliberately DROP every real-world
--      identifier: no FirstName/LastName, no Email/Phone, no street address
--      or postal code. This is the compensating control that keeps the
--      free-tier model boundary safe (build-spec §3).
--
--   2. A dedicated SELECT-only Postgres role (assistant_ro) that can read
--      ONLY these views plus the already-aggregated mgmt_* views — nothing
--      else in the database. Read-only is therefore enforced at the DB
--      level, not just in app code, and holds even if the app has a bug
--      (build-spec §2). The assistant connects as this role via a separate
--      connection string (ASSISTANT_DB_URL); the service-role key is never
--      used for the AI's data queries.
--
-- The app-side allow-list in lib/assistant-sql.js MUST stay in sync with the
-- view names and columns defined here.

-- ── DE-IDENTIFIED VIEWS ────────────────────────────────────────────

-- Orders — money + anonymous CustID, no PII. CustID is the shop's own
-- synthetic key (e.g. C0001); it is the "anonymous customer id" the spec
-- allows the model to see, and resolves back to a real person only through
-- the separate, non-AI service-role path (api/management-customer.js).
create or replace view asst_orders as
select
  "OrderID",
  "OrderDate",
  "CustID",
  "LocationID",
  "Channel",
  "ShippingFee",
  "OrderTotal",
  "PaymentMethod"
from "Orders";

-- Order lines — line-level revenue/cost/qty already rolled up to the parent
-- product with name + category (reuses mgmt_line_product), plus the order
-- date so the model can slice lines by time without a manual join.
create or replace view asst_order_lines as
select
  lp."OrderID",
  o."OrderDate",
  lp."LineNumber",
  lp.parent_sku            as sku,
  lp.product_name,
  lp.category,
  lp."Quantity",
  lp."LineRevenue",
  lp."LineCost",
  lp."EffectiveDiscountAmount"
from mgmt_line_product lp
join "Orders" o on o."OrderID" = lp."OrderID";

-- Product catalog — pricing + cost, no PII of any kind.
create or replace view asst_products as
select
  sku,
  name,
  category,
  subcategory,
  unit_price,
  rental_rate,
  unit_cost,
  availability,
  supplier,
  year_introduced
from products;

-- Rentals — behaviour + anonymous CustID and an employee CODE (not a name).
create or replace view asst_rentals as
select
  "RentalID",
  "RentalDate",
  "ReturnDate",
  "DaysBilled",
  "CustID",
  "LocationID",
  "SalesAssociate",
  "SKU"     as sku,
  "Quantity",
  "DailyRate",
  "RentalRevenue",
  "Returned",
  "Channel",
  "OrderID"
from "RentalTransactions";

-- Customers — anonymous id + coarse attributes ONLY. Explicitly no name,
-- email, phone, street address, region, or postal code. LoyaltyMember is
-- pulled from Customers_Contact but that is the ONLY column taken from a
-- table that also holds contact PII.
create or replace view asst_customers as
select
  cc."CustomerID",
  cc."CustomerType",
  cc."Country",
  cc."JoinDate",
  cd."Gender",
  cd."Occupation",
  ct."LoyaltyMember"
from "Customers_Core" cc
left join "Customers_Demographics" cd on cd."CustomerID" = cc."CustomerID"
left join "Customers_Contact"      ct on ct."CustomerID" = cc."CustomerID";

-- ── SELECT-ONLY ROLE ───────────────────────────────────────────────
-- Replace the password below before running, and use the SAME value in the
-- ASSISTANT_DB_URL connection string. Guarded with a DO block so re-running
-- this file doesn't error if the role already exists.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'assistant_ro') then
    create role assistant_ro with login password 'CHANGE_ME_STRONG_PASSWORD';
  end if;
end
$$;

-- Fresh grants each run (idempotent). USAGE on the schema, then SELECT on
-- ONLY the de-identified views and the pre-aggregated mgmt_* views.
grant usage on schema public to assistant_ro;

grant select on
  asst_orders,
  asst_order_lines,
  asst_products,
  asst_rentals,
  asst_customers,
  mgmt_monthly_revenue,
  mgmt_category_perf,
  mgmt_product_perf,
  mgmt_rental_loss,
  mgmt_season_revenue,
  mgmt_customer_mix,
  mgmt_reorder
to assistant_ro;

-- Make sure no blanket future grants ever leak base tables to this role,
-- and that it never gains write ability by default.
alter default privileges in schema public revoke all on tables from assistant_ro;

-- DB-level query timeout: a slow or accidental full scan can't hang the
-- assistant or run up tokens (build-spec §2). App code sets its own per
-- connection too, as belt-and-braces.
alter role assistant_ro set statement_timeout = '5000';

-- Sanity checks to run manually after applying (should behave as noted):
--   set role assistant_ro;
--   select count(*) from asst_orders;          -- OK
--   select * from "Customers_Core" limit 1;    -- ERROR: permission denied
--   update asst_products set unit_price = 0;    -- ERROR: permission denied
--   reset role;
