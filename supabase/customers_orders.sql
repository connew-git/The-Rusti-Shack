-- Run in Supabase Dashboard → SQL Editor, after schema.sql
-- These tables are private: RLS is on, no public policy. Only server-side
-- code holding the secret key can read or write them.

-- ── CUSTOMERS_CORE ───────────────────────────────────────────────
create table if not exists "Customers_Core" (
  "CustomerID"   text not null primary key,
  "FirstName"    text not null,
  "LastName"     text not null,
  "CustomerType" text,
  "JoinDate"     date,
  "City"         text,
  "Country"      text
);

alter table "Customers_Core" enable row level security;
-- No policies: default-deny. Accessible only via the server-side secret key.

-- ── CUSTOMERS_CONTACT ────────────────────────────────────────────
-- One-to-one extension of Customers_Core. Deletes cascade with the parent row.
create table if not exists "Customers_Contact" (
  "CustomerID"    text    not null primary key
                            references "Customers_Core" ("CustomerID")
                            on delete cascade,
  "Email"         text,
  "Phone"         text,
  "LoyaltyMember" boolean,
  "StreetAddress" text,
  "Region"        text,
  "PostalCode"    text
);

alter table "Customers_Contact" enable row level security;

-- ── ORDERS ───────────────────────────────────────────────────────
-- CustID is nullable to preserve historical orders if a customer is deleted.
create table if not exists "Orders" (
  "OrderID"        text          not null primary key,
  "OrderDate"      date          not null,
  "CustID"         text          references "Customers_Core" ("CustomerID")
                                   on delete set null,
  "LocationID"     text,
  "SalesAssociate" text,
  "Channel"        text,
  "ShippingFee"    numeric(10,2) not null default 0
                                   check ("ShippingFee" >= 0),
  "OrderTotal"     numeric(10,2) not null
                                   check ("OrderTotal" >= 0),
  "PaymentMethod"  text
);

alter table "Orders" enable row level security;

-- ── ORDERLINES ───────────────────────────────────────────────────
-- DiscountPct is stored as a percentage (e.g. 20 means 20%, matching the sheet).
-- Lines cascade-delete when their parent order is deleted.
-- ProductCode is NOT foreign-keyed — it may hold a parent SKU (products) or
-- a variant SKU (product_variants); see fix_polymorphic_sku_fks.sql.
create table if not exists "OrderLines" (
  "OrderID"                 text          not null
                              references "Orders" ("OrderID")
                              on delete cascade,
  "LineNumber"              integer       not null
                              check ("LineNumber" > 0),
  "ProductCode"             text,
  "Quantity"                integer       not null
                              check ("Quantity" > 0),
  "UnitPrice"               numeric(10,2) not null
                              check ("UnitPrice" >= 0),
  "DiscountPct"             numeric(5,2)  not null default 0
                              check ("DiscountPct" >= 0 and "DiscountPct" <= 100),
  "LineRevenue"             numeric(10,2) not null
                              check ("LineRevenue" >= 0),
  "LineCost"                numeric(10,2) not null
                              check ("LineCost" >= 0),
  "EffectiveDiscountAmount" numeric(10,2) not null default 0
                              check ("EffectiveDiscountAmount" >= 0),
  primary key ("OrderID", "LineNumber")
);

alter table "OrderLines" enable row level security;
