-- Run in Supabase Dashboard → SQL Editor, after part_c_analytics_views.sql.
-- Reorder-point analysis at the PARENT/product grain.
--
-- Grain decision: the source Inventory has both parent rows (e.g. SNK-001:
-- OnHandQty 30 = 22 rental pool + 8 saleable, with its own ReorderPoint) and
-- looser per-variant saleable rows that don't cleanly reconcile to the parent.
-- We reorder at the parent level, where stock, the rental pool, and the
-- existing reorder point are all defined — joining `products` restricts
-- Inventory to exactly the 45 parent/standalone rows and drops variant rows.
--
-- Demand = units that PERMANENTLY leave stock and must be replaced: units
-- sold (OrderLines, rolled variant→parent) plus lost/unreturned rental units
-- (RentalTransactions where Returned = 'No'). Returned rentals cycle through
-- the pool without depleting stock, so they are excluded.
--
-- The actual reorder-point formula (avg daily demand × lead time + safety
-- stock via demand variability) is computed in the dashboard from the
-- avg/std monthly demand this view returns, so lead time and service level
-- can be adjusted live and the components shown to the manager.

create or replace view mgmt_product_monthly_demand as
with sales as (
  select coalesce(v.parent_sku, ol."ProductCode") as sku,
         date_trunc('month', o."OrderDate")::date as month,
         sum(ol."Quantity") as units
  from "OrderLines" ol
  join "Orders" o on o."OrderID" = ol."OrderID"
  left join product_variants v on v.sku = ol."ProductCode"
  group by 1, 2
),
lost_rentals as (
  select coalesce(v.parent_sku, rt."SKU") as sku,
         date_trunc('month', rt."RentalDate")::date as month,
         sum(rt."Quantity") as units
  from "RentalTransactions" rt
  left join product_variants v on v.sku = rt."SKU"
  where rt."Returned" = 'No'
  group by 1, 2
)
select sku, month, sum(units) as demand_units
from (select * from sales union all select * from lost_rentals) u
group by sku, month;

create or replace view mgmt_reorder as
with bounds as (
  select date_trunc('month', min(d))::date as start_m,
         date_trunc('month', max(d))::date as end_m
  from (
    select "OrderDate" as d from "Orders"
    union all
    select "RentalDate" as d from "RentalTransactions"
  ) x
),
spine as (   -- every product × every month in the dataset window (zero-fill)
  select p.sku, gs::date as month
  from products p
  cross join bounds b
  cross join lateral generate_series(b.start_m, b.end_m, interval '1 month') gs
),
filled as (
  select s.sku, s.month, coalesce(d.demand_units, 0) as units
  from spine s
  left join mgmt_product_monthly_demand d on d.sku = s.sku and d.month = s.month
),
stats as (
  select sku,
         avg(units)                         as avg_monthly_demand,
         coalesce(stddev_samp(units), 0)     as std_monthly_demand,
         sum(units)                          as total_demand,
         count(*)                            as months_in_window
  from filled
  group by sku
)
select
  i."SKU"              as sku,
  p.name               as product_name,
  p.category           as category,
  i."OnHandQty"        as on_hand,
  i."RentalUnits"      as rental_units,
  i."AvailableForSale" as available_for_sale,
  i."ReorderPoint"     as existing_reorder_point,
  round(coalesce(st.avg_monthly_demand, 0), 2) as avg_monthly_demand,
  round(coalesce(st.std_monthly_demand, 0), 2) as std_monthly_demand,
  coalesce(st.total_demand, 0)                 as total_demand,
  coalesce(st.months_in_window, 0)             as months_in_window
from "Inventory" i
join products p on p.sku = i."SKU"       -- restrict to the 45 parent/standalone rows
left join stats st on st.sku = i."SKU";
