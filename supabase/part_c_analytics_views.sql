-- Run in Supabase Dashboard → SQL Editor, after part_c_schema.sql and the
-- data migration. These read-only views pre-aggregate the full order/rental
-- history in Postgres so the /management analytics endpoint can pull small
-- result sets instead of tens of thousands of rows.
--
-- IMPORTANT: unlike the Part B 7-day widget (which filters to live web
-- orders, PaymentMethod = 'Stripe-Card'), these views intentionally include
-- ALL orders — the 15k+ historical orders are Cash/Card/GCash/BankTransfer
-- and are the whole point of the analytics. Sales margin uses the stored
-- LineCost (COGS). Rentals carry no per-unit COGS (the same unit is rented
-- repeatedly), so rental revenue is treated as contribution with the only
-- rental "cost" being lost/damaged units (Returned = 'No'), surfaced
-- separately in mgmt_rental_loss.

-- Resolve any ProductCode/SKU (which may be a parent OR a variant SKU) to
-- its parent product row, so category/name/cost roll up correctly.
create or replace view mgmt_line_product as
select
  ol."OrderID",
  ol."LineNumber",
  ol."Quantity",
  ol."LineRevenue",
  ol."LineCost",
  ol."EffectiveDiscountAmount",
  coalesce(v.parent_sku, ol."ProductCode") as parent_sku,
  p.name     as product_name,
  p.category as category
from "OrderLines" ol
left join product_variants v on v.sku = ol."ProductCode"
left join products p on p.sku = coalesce(v.parent_sku, ol."ProductCode");

-- ── Q1 + Q2: monthly revenue and margin over time (sales vs rental) ──
-- Full monthly series — the forecasting models consume this whole series,
-- while the year slicer filters it only for display.
create or replace view mgmt_monthly_revenue as
with sales as (
  select date_trunc('month', o."OrderDate")::date as month,
         sum(ol."LineRevenue") as sales_revenue,
         sum(ol."LineCost")    as sales_cost
  from "Orders" o
  join "OrderLines" ol on ol."OrderID" = o."OrderID"
  group by 1
),
rentals as (
  select date_trunc('month', "RentalDate")::date as month,
         sum("RentalRevenue") as rental_revenue
  from "RentalTransactions"
  group by 1
)
select
  coalesce(s.month, r.month)                            as month,
  extract(year  from coalesce(s.month, r.month))::int   as year,
  extract(month from coalesce(s.month, r.month))::int   as month_num,
  round(coalesce(s.sales_revenue, 0), 2)                as sales_revenue,
  round(coalesce(s.sales_cost, 0), 2)                   as sales_cost,
  round(coalesce(s.sales_revenue, 0) - coalesce(s.sales_cost, 0), 2) as sales_margin,
  round(coalesce(r.rental_revenue, 0), 2)               as rental_revenue,
  round(coalesce(s.sales_revenue, 0) + coalesce(r.rental_revenue, 0), 2) as total_revenue
from sales s
full outer join rentals r on s.month = r.month
order by 1;

-- ── Q3: product & category performance (margin dollars and %) ──
create or replace view mgmt_category_perf as
select
  extract(year from o."OrderDate")::int as year,
  coalesce(lp.category, 'Unknown')      as category,
  round(sum(lp."LineRevenue"), 2)                        as revenue,
  round(sum(lp."LineCost"), 2)                           as cost,
  round(sum(lp."LineRevenue" - lp."LineCost"), 2)        as margin,
  case when sum(lp."LineRevenue") > 0
       then round(100 * sum(lp."LineRevenue" - lp."LineCost") / sum(lp."LineRevenue"), 1)
       else 0 end                                        as margin_pct,
  sum(lp."Quantity")                                     as units
from mgmt_line_product lp
join "Orders" o on o."OrderID" = lp."OrderID"
group by 1, 2;

create or replace view mgmt_product_perf as
select
  extract(year from o."OrderDate")::int as year,
  lp.parent_sku                          as sku,
  coalesce(lp.product_name, lp.parent_sku) as product_name,
  coalesce(lp.category, 'Unknown')       as category,
  round(sum(lp."LineRevenue"), 2)                        as revenue,
  round(sum(lp."LineRevenue" - lp."LineCost"), 2)        as margin,
  case when sum(lp."LineRevenue") > 0
       then round(100 * sum(lp."LineRevenue" - lp."LineCost") / sum(lp."LineRevenue"), 1)
       else 0 end                                        as margin_pct,
  sum(lp."Quantity")                                     as units
from mgmt_line_product lp
join "Orders" o on o."OrderID" = lp."OrderID"
group by 1, 2, 3, 4;

-- ── Q6: rental loss — unreturned (lost/damaged) units by product ──
create or replace view mgmt_rental_loss as
select
  extract(year from rt."RentalDate")::int as year,
  coalesce(v.parent_sku, rt."SKU")        as sku,
  coalesce(p.name, rt."SKU")              as product_name,
  sum(case when rt."Returned" = 'No'  then rt."Quantity" else 0 end) as lost_units,
  sum(rt."Quantity")                                                  as rented_units,
  -- Value of loss valued at product cost (what it costs to replace),
  -- falling back to 0 when cost is unknown.
  round(sum(case when rt."Returned" = 'No'
                 then rt."Quantity" * coalesce(p.unit_cost, 0) else 0 end), 2) as lost_value_at_cost
from "RentalTransactions" rt
left join product_variants v on v.sku = rt."SKU"
left join products p on p.sku = coalesce(v.parent_sku, rt."SKU")
group by 1, 2, 3;

-- ── Q7: revenue by season (Apo Island seasons) ──
-- Seasons per the source date dimension: Shoulder (May), Typhoon (Jun–Nov),
-- Dry Peak (Dec–Apr). Derived here from month number so it covers any date.
create or replace view mgmt_season_revenue as
with all_rev as (
  select o."OrderDate"::date as d, ol."LineRevenue" as revenue
  from "Orders" o join "OrderLines" ol on ol."OrderID" = o."OrderID"
  union all
  select rt."RentalDate"::date as d, rt."RentalRevenue" as revenue
  from "RentalTransactions" rt
)
select
  extract(year from d)::int as year,
  case
    when extract(month from d) = 5 then 'Shoulder'
    when extract(month from d) between 6 and 11 then 'Typhoon'
    else 'Dry Peak'
  end as season,
  round(sum(revenue), 2) as revenue
from all_rev
group by 1, 2;

-- ── Q8: customer mix + loyalty ──
create or replace view mgmt_customer_mix as
select
  extract(year from o."OrderDate")::int as year,
  coalesce(cc."CustomerType", 'Unknown') as customer_type,
  round(sum(o."OrderTotal"), 2)          as revenue,
  count(distinct o."OrderID")            as order_count,
  count(distinct o."CustID")             as customer_count
from "Orders" o
left join "Customers_Core" cc on cc."CustomerID" = o."CustID"
group by 1, 2;
