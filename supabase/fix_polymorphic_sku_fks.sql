-- Run in Supabase Dashboard → SQL Editor, after part_c_schema.sql.
--
-- Three columns can legitimately hold EITHER a parent/standalone SKU (in
-- `products`) OR a variant SKU (in `product_variants`):
--   OrderLines.ProductCode   — pre-existing, live since the checkout flow
--                              shipped. Per the source data dictionary,
--                              ProductCode has referenced variant SKUs for
--                              any sale from 2023-10-01 onward.
--   Inventory.SKU            — the Inventory sheet tracks stock at the
--                              variant level (152 of its 197 rows are
--                              variant SKUs, not parent SKUs).
--   RentalTransactions.SKU   — same reasoning; rentable variants (e.g. fin
--                              sizes) are rented by their specific SKU.
--
-- Each of these currently has (or was just created with) a foreign key to
-- `products(sku)` ONLY, which rejects any variant SKU. That's a real bug:
-- it means a live checkout for a specific size/color variant has been
-- failing to write its OrderLines row. Postgres foreign keys can't point at
-- "one of two tables," so we drop the constraint here and rely on the
-- application/migration layer to only ever write real SKUs — the same
-- tradeoff already made for OrderLines.CustID and similar columns.

do $$
declare
  con record;
begin
  for con in
    select tc.constraint_name, tc.table_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema    = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and (
        (tc.table_name = 'OrderLines'         and kcu.column_name = 'ProductCode') or
        (tc.table_name = 'Inventory'           and kcu.column_name = 'SKU') or
        (tc.table_name = 'RentalTransactions'  and kcu.column_name = 'SKU')
      )
  loop
    execute format('alter table %I drop constraint %I', con.table_name, con.constraint_name);
    raise notice 'Dropped % on %', con.constraint_name, con.table_name;
  end loop;
end $$;
