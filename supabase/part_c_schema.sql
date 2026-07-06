-- Run in Supabase Dashboard → SQL Editor, after rental_dates.sql.
-- Part C: unified back-office schema. Adds the reference/dimension tables
-- from the source workbooks, enriches the product catalog with cost data,
-- and unifies historical (same-day) and online (multi-day) rentals into
-- one RentalTransactions table.
--
-- Naming convention follows what's already live: snake_case for the
-- product catalog (products, product_variants), PascalCase quoted
-- identifiers for everything shaped like the Excel workbooks.

-- ── STORES ─────────────────────────────────────────────────────────
create table if not exists "Stores" (
  "LocationCode" text primary key,
  "LocationName" text not null,
  "StoreType"    text not null check ("StoreType" in ('Walk-in','Shipping')),
  "Country"      text not null
);
alter table "Stores" enable row level security;

insert into "Stores" ("LocationCode","LocationName","StoreType","Country") values
  ('APO-MAIN',  'Apo Island Main Shop',       'Walk-in',  'Philippines'),
  ('APO-DOCK',  'Dock-Side Kiosk',            'Walk-in',  'Philippines'),
  ('SHIP-INTL', 'International Ship-Out',     'Shipping', 'Various')
on conflict ("LocationCode") do update set
  "LocationName" = excluded."LocationName",
  "StoreType"    = excluded."StoreType",
  "Country"      = excluded."Country";

-- ── EMPLOYEES ──────────────────────────────────────────────────────
create table if not exists "Employees" (
  "EmpID"     text primary key,
  "FirstName" text not null,
  "LastName"  text not null,
  "Role"      text,
  "HireDate"  date,
  "HomeStore" text references "Stores"("LocationCode")
);
alter table "Employees" enable row level security;

-- Synthetic row so the live site's SalesAssociate: 'WEB' stays a valid FK.
insert into "Employees" ("EmpID","FirstName","LastName","Role","HomeStore") values
  ('WEB', 'Online', 'Checkout', 'Online System', 'SHIP-INTL')
on conflict ("EmpID") do nothing;
-- The 7 real employee rows (E001-E00N) are loaded by the migration script
-- from the Employees sheet — small enough to insert there rather than
-- hardcode here, since the exact roster is source-of-truth in the workbook.

-- ── PROMOTIONS ─────────────────────────────────────────────────────
create table if not exists "Promotions" (
  "PromoCode"    text primary key,
  "PromoName"    text not null,
  "PromoType"    text,
  "DiscountPct"  numeric(5,2) not null check ("DiscountPct" >= 0 and "DiscountPct" <= 100),
  "StartDate"    date,
  "EndDate"      date,
  "Channel"      text check ("Channel" in ('Walk-in','Shipping','Both'))
);
alter table "Promotions" enable row level security;

-- ── ORDERPROMOTIONS (bridge) ───────────────────────────────────────
create table if not exists "OrderPromotions" (
  "OrderID"   text not null references "Orders"("OrderID") on delete cascade,
  "PromoCode" text not null references "Promotions"("PromoCode"),
  primary key ("OrderID","PromoCode")
);
alter table "OrderPromotions" enable row level security;

-- ── CUSTOMERS_DEMOGRAPHICS ─────────────────────────────────────────
create table if not exists "Customers_Demographics" (
  "CustomerID" text primary key references "Customers_Core"("CustomerID") on delete cascade,
  "Gender"     text,
  "Occupation" text
);
alter table "Customers_Demographics" enable row level security;

-- ── PRODUCT CATALOG ENRICHMENT ─────────────────────────────────────
-- Cost/weight/supplier data needed for margin analysis (Part C step 6)
-- and catalog-growth analysis. Nullable for now; the migration script
-- backfills every existing row from the Products sheet.
alter table products
  add column if not exists unit_cost       numeric(10,2) check (unit_cost >= 0),
  add column if not exists weight_kg       numeric(10,3),
  add column if not exists supplier        text,
  add column if not exists year_introduced integer;

alter table product_variants
  add column if not exists unit_cost numeric(10,2) check (unit_cost >= 0),
  add column if not exists weight_kg numeric(10,3);

-- ── INVENTORY ──────────────────────────────────────────────────────
-- SKU is NOT foreign-keyed to products(sku) — the source data tracks stock
-- at the variant level for anything that has variants (e.g. SNK-001-S-CLR),
-- so a value here may live in either products or product_variants. See
-- fix_polymorphic_sku_fks.sql for the same reasoning applied to OrderLines.
create table if not exists "Inventory" (
  "SKU"               text primary key,
  "OnHandQty"          integer not null check ("OnHandQty" >= 0),
  "ReorderPoint"       integer,   -- imported as reference only — Part C step 7
                                   -- computes its own recommendation, doesn't trust this
  "RentalUnits"        integer not null default 0 check ("RentalUnits" >= 0),
  "AvailableForSale"   integer not null default 0 check ("AvailableForSale" >= 0),
  "WarehouseLocation"  text,
  "LastCountDate"      date
);
alter table "Inventory" enable row level security;

-- ── RENTALTRANSACTIONS (unified: historical same-day + online multi-day) ──
-- Historical rentals: RentalDate = ReturnDate (same-day checkout/return),
-- Channel = 'Walk-in', OrderID = null (never tied to an Order historically).
-- Online rentals: real date range, Channel = 'Shipping', OrderID populated
-- so the charge/receipt side (Orders/OrderLines) stays reconcilable.
-- DaysBilled = GREATEST(1, ReturnDate - RentalDate) in both cases, which
-- correctly reduces to 1 for same-day and matches the existing online
-- booking math (nights-based) for multi-day — no retroactive repricing
-- of bookings already taken through the live checkout.
create table if not exists "RentalTransactions" (
  "RentalID"       text primary key,
  "RentalDate"     date not null,
  "ReturnDate"     date not null check ("ReturnDate" >= "RentalDate"),
  "DaysBilled"     integer not null check ("DaysBilled" >= 1),
  "CustID"         text references "Customers_Core"("CustomerID"),
  "LocationID"     text references "Stores"("LocationCode"),
  "SalesAssociate" text references "Employees"("EmpID"),
  "SKU"            text, -- not FK'd — may reference products or product_variants, see note above
  "Quantity"       integer not null check ("Quantity" > 0),
  "DailyRate"      numeric(10,2) not null check ("DailyRate" >= 0),
  "RentalRevenue"  numeric(10,2) not null check ("RentalRevenue" >= 0),
  "Returned"       text check ("Returned" in ('Yes','No') or "Returned" is null),
  "Channel"        text not null default 'Walk-in' check ("Channel" in ('Walk-in','Shipping')),
  "OrderID"        text references "Orders"("OrderID") on delete set null
);
alter table "RentalTransactions" enable row level security;
-- No public policies on any table above — service-role key only, same
-- default-deny pattern as Orders/OrderLines/Customers_Core.
