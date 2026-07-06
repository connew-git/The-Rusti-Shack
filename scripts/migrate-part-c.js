// One-time Part C data migration — loads both source workbooks into Supabase.
// Run locally (NOT on Vercel) with the service-role key set as an env var:
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-part-c.js
//
// Add --dry-run to parse and validate everything (row counts, revenue
// totals) WITHOUT writing anything to Supabase. Always run --dry-run first.
//
// Requires: npm install exceljs (devDependency only — not used by the live site).

const path = require('path');
const ExcelJS = require('exceljs');

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = 'https://igfgyuuucaezuqtdvykl.supabase.co';
const DATA_DIR = path.join(__dirname, '..', 'Data');
const BASE_FILE = path.join(DATA_DIR, 'The_Rusti_Shack_Dataset.xlsx');
const UPD_FILE  = path.join(DATA_DIR, 'The_Rusti_Shack_Apr2026_Update.xlsx');

const BATCH_SIZE = 500;

// ── HELPERS ──────────────────────────────────────────────────────────────

function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v; // handled per-field by cellDate/cellStr
  if (typeof v === 'object' && 'result' in v) return v.result; // formula cell
  return v;
}

function cellDateISO(cell) {
  const v = cellText(cell);
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Excel serial date fallback (epoch 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return String(v).slice(0, 10);
}

function cellStr(cell) {
  const v = cellText(cell);
  if (v === null) return null;
  return String(v).trim() || null;
}

function cellNum(cell) {
  const v = cellText(cell);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function cellInt(cell) {
  const n = cellNum(cell);
  return n === null ? null : Math.round(n);
}

function sheetRows(ws) {
  const headerRow = ws.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellStr(cell);
  });
  // Iterate by explicit column index rather than row.eachCell — a row whose
  // trailing column is genuinely blank (e.g. LoyaltyMember for pre-2023
  // customers) may not materialize that cell at all, even with
  // includeEmpty:true, since eachCell only walks up to the row's own last
  // populated cell, not the header's full width.
  const numCols = headers.length - 1;
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    for (let c = 1; c <= numCols; c++) {
      const h = headers[c];
      if (h) obj[h] = row.getCell(c);
    }
    rows.push(obj);
  });
  return rows;
}

async function loadWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

// ── VERIFICATION TOTALS (computed while parsing, printed at the end) ─────
const totals = {
  ordersCount: 0, orderTotalSum: 0,
  linesCount: 0, lineRevenueSum: 0, lineCostSum: 0,
  rentalsCount: 0, rentalRevenueSum: 0,
};

// ── TRANSFORMERS ─────────────────────────────────────────────────────────

function transformProducts(rows) {
  const products = [];
  const variants = [];
  rows.forEach((r) => {
    const sku         = cellStr(r.SKU);
    const parentSku   = cellStr(r.ParentSKU);
    const variantType = cellStr(r.VariantType);
    const unitPrice   = cellNum(r.UnitPrice);
    const rentalRate  = cellNum(r.RentalRate);
    const unitCost    = cellNum(r.UnitCost);
    const weightKg    = cellNum(r.Weight_kg);

    if (variantType === 'Variant') {
      // product_variants requires unit_price (NOT NULL) — this is an upsert
      // against rows already seeded by variants.sql, so every required
      // column must be present or Postgres rejects the candidate row before
      // conflict resolution even runs.
      variants.push({
        sku, parent_sku: parentSku,
        unit_price: unitPrice, rental_rate: rentalRate,
        unit_cost: unitCost, weight_kg: weightKg,
      });
    } else {
      // products requires name/category/subcategory/unit_price/availability
      // (NOT NULL) — same reasoning. emoji/studio_image/lifestyle_image are
      // deliberately omitted: they're website-only fields with no source in
      // the workbook, and omitting them from the upsert payload leaves the
      // existing values untouched rather than nulling them out.
      products.push({
        sku,
        name:            cellStr(r.ProductName),
        category:        cellStr(r.Category),
        subcategory:     cellStr(r.Subcategory),
        unit_price:      unitPrice,
        rental_rate:     rentalRate,
        availability:    cellStr(r.Availability),
        unit_cost:       unitCost,
        weight_kg:       weightKg,
        supplier:        cellStr(r.Supplier),
        year_introduced: cellInt(r.YearIntroduced),
      });
    }
  });
  return { products, variants };
}

function transformEmployees(rows) {
  return rows.map((r) => ({
    EmpID:     cellStr(r.EmpID),
    FirstName: cellStr(r.FirstName),
    LastName:  cellStr(r.LastName),
    Role:      cellStr(r.Role),
    HireDate:  cellDateISO(r.HireDate),
    HomeStore: cellStr(r.HomeStore),
  }));
}

function transformPromotions(rows) {
  return rows.map((r) => ({
    PromoCode:   cellStr(r.PromoCode),
    PromoName:   cellStr(r.PromoName),
    PromoType:   cellStr(r.PromoType),
    DiscountPct: cellNum(r.DiscountPct),
    StartDate:   cellDateISO(r.StartDate),
    EndDate:     cellDateISO(r.EndDate),
    Channel:     cellStr(r.Channel),
  }));
}

function transformCustomersCore(rows) {
  return rows.map((r) => ({
    CustomerID:   cellStr(r.CustomerID),
    FirstName:    cellStr(r.FirstName),
    LastName:     cellStr(r.LastName),
    CustomerType: cellStr(r.CustomerType),
    JoinDate:     cellDateISO(r.JoinDate),
    City:         cellStr(r.City),
    Country:      cellStr(r.Country),
  }));
}

function transformCustomersContact(rows) {
  return rows.map((r) => ({
    CustomerID:    cellStr(r.CustomerID),
    Email:         cellStr(r.Email),
    Phone:         cellStr(r.Phone),
    LoyaltyMember: cellStr(r.LoyaltyMember) === 'Yes',
  }));
}

function transformCustomersDemographics(rows) {
  return rows.map((r) => ({
    CustomerID: cellStr(r.CustomerID),
    Gender:     cellStr(r.Gender),
    Occupation: cellStr(r.Occupation),
  }));
}

function transformOrders(rows) {
  return rows.map((r) => {
    const total = cellNum(r.OrderTotal) || 0;
    totals.ordersCount += 1;
    totals.orderTotalSum += total;
    return {
      OrderID:        cellStr(r.OrderID),
      OrderDate:      cellDateISO(r.OrderDate),
      CustID:         cellStr(r.CustID),
      LocationID:     cellStr(r.LocationID),
      SalesAssociate: cellStr(r.SalesAssociate),
      Channel:        cellStr(r.Channel),
      ShippingFee:    cellNum(r.ShippingFee) || 0,
      OrderTotal:     total,
      PaymentMethod:  cellStr(r.PaymentMethod),
    };
  });
}

function transformOrderLines(rows) {
  return rows.map((r) => {
    const rev  = cellNum(r.LineRevenue) || 0;
    const cost = cellNum(r.LineCost) || 0;
    totals.linesCount += 1;
    totals.lineRevenueSum += rev;
    totals.lineCostSum += cost;
    return {
      OrderID:                 cellStr(r.OrderID),
      LineNumber:              cellInt(r.LineNumber),
      ProductCode:             cellStr(r.ProductCode),
      Quantity:                cellInt(r.Quantity),
      UnitPrice:               cellNum(r.UnitPrice),
      DiscountPct:             cellNum(r.DiscountPct) || 0,
      LineRevenue:             rev,
      LineCost:                cost,
      EffectiveDiscountAmount: cellNum(r.EffectiveDiscountAmount) || 0,
      RentalStartDate: null,
      RentalEndDate:   null,
    };
  });
}

function transformOrderPromotions(rows) {
  return rows.map((r) => ({
    OrderID:   cellStr(r.OrderID),
    PromoCode: cellStr(r.PromoCode),
  }));
}

// Historical rentals are same-day: RentalDate == ReturnDate, DaysBilled = 1.
// This is the unification point with the online multi-day booking flow,
// which will write DaysBilled = GREATEST(1, ReturnDate - RentalDate).
function transformRentalTransactions(rows) {
  return rows.map((r) => {
    const date = cellDateISO(r.RentalDate);
    const revenue = cellNum(r.RentalRevenue) || 0;
    totals.rentalsCount += 1;
    totals.rentalRevenueSum += revenue;
    return {
      RentalID:       cellStr(r.RentalID),
      RentalDate:     date,
      ReturnDate:     date, // same-day, historical
      DaysBilled:     1,
      CustID:         cellStr(r.CustID),
      LocationID:     cellStr(r.LocationID),
      SalesAssociate: cellStr(r.SalesAssociate),
      SKU:            cellStr(r.SKU),
      Quantity:       cellInt(r.Quantity),
      DailyRate:      cellNum(r.DailyRate),
      RentalRevenue:  revenue,
      Returned:       cellStr(r.Returned),
      Channel:        'Walk-in',
      OrderID:        null,
    };
  });
}

function transformInventory(rows) {
  return rows.map((r) => ({
    SKU:               cellStr(r.SKU),
    OnHandQty:         cellInt(r.OnHandQty) || 0,
    ReorderPoint:      cellInt(r.ReorderPoint),
    RentalUnits:       cellInt(r.RentalUnits) || 0,
    AvailableForSale:  cellInt(r.AvailableForSale) || 0,
    WarehouseLocation: cellStr(r.WarehouseLocation),
    LastCountDate:     cellDateISO(r.LastCountDate),
  }));
}

// ── UPSERT (batched) ──────────────────────────────────────────────────────
async function upsertBatched(db, table, rows, conflictCols) {
  if (DRY_RUN) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await db.from(table).upsert(batch, { onConflict: conflictCols });
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
    process.stdout.write(`\r  ${table}: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
}

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (no writes) ===\n' : '=== LIVE MIGRATION ===\n');

  let db = null;
  if (!DRY_RUN) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
    const { createClient } = require('@supabase/supabase-js');
    db = createClient(SUPABASE_URL, serviceKey);
  }

  console.log('Reading workbooks...');
  const wbBase = await loadWorkbook(BASE_FILE);
  const wbUpd  = await loadWorkbook(UPD_FILE);

  // ── Reference/dimension tables (base file only) ──
  const { products, variants } = transformProducts(sheetRows(wbBase.getWorksheet('Products')));
  const employees   = transformEmployees(sheetRows(wbBase.getWorksheet('Employees')));
  const promotions  = transformPromotions(sheetRows(wbBase.getWorksheet('Promotions')));
  const custCore     = transformCustomersCore(sheetRows(wbBase.getWorksheet('Customers_Core')));
  const custContact  = transformCustomersContact(sheetRows(wbBase.getWorksheet('Customers_Contact')));
  const custDemo      = transformCustomersDemographics(sheetRows(wbBase.getWorksheet('Customers_Demographics')));
  const inventory    = transformInventory(sheetRows(wbBase.getWorksheet('Inventory')));

  // ── Fact tables (base + update, combined) ──
  const orders = [
    ...transformOrders(sheetRows(wbBase.getWorksheet('Orders'))),
    ...transformOrders(sheetRows(wbUpd.getWorksheet('Orders_Apr2026'))),
  ];
  const orderLines = [
    ...transformOrderLines(sheetRows(wbBase.getWorksheet('OrderLines'))),
    ...transformOrderLines(sheetRows(wbUpd.getWorksheet('OrderLines_Apr2026'))),
  ];
  const rentals = [
    ...transformRentalTransactions(sheetRows(wbBase.getWorksheet('RentalTransactions'))),
    ...transformRentalTransactions(sheetRows(wbUpd.getWorksheet('RentalTransactions_Apr2026'))),
  ];
  const orderPromos = [
    ...transformOrderPromotions(sheetRows(wbBase.getWorksheet('OrderPromotions'))),
    ...transformOrderPromotions(sheetRows(wbUpd.getWorksheet('OrderPromotions_Apr2026'))),
  ];

  console.log('\n=== PARSED COUNTS ===');
  console.log(`Products (parent/standalone): ${products.length}`);
  console.log(`Product variants:             ${variants.length}`);
  console.log(`Employees:                    ${employees.length}`);
  console.log(`Promotions:                   ${promotions.length}`);
  console.log(`Customers_Core:                ${custCore.length}`);
  console.log(`Customers_Contact:             ${custContact.length}`);
  console.log(`Customers_Demographics:        ${custDemo.length}`);
  console.log(`Inventory:                     ${inventory.length}`);
  console.log(`Orders:                        ${orders.length}`);
  console.log(`OrderLines:                    ${orderLines.length}`);
  console.log(`RentalTransactions:            ${rentals.length}`);
  console.log(`OrderPromotions:               ${orderPromos.length}`);

  console.log('\n=== REVENUE VERIFICATION (compare against golden totals) ===');
  console.log(`Sum(Orders.OrderTotal):             $${totals.orderTotalSum.toFixed(2)}  (expect $2,004,311.57)`);
  console.log(`Sum(OrderLines.LineRevenue):        $${totals.lineRevenueSum.toFixed(2)}  (expect $1,891,411.27)`);
  console.log(`Sum(OrderLines.LineCost):           $${totals.lineCostSum.toFixed(2)}  (expect $785,605.01)`);
  console.log(`Sum(RentalTransactions.RentalRevenue): $${totals.rentalRevenueSum.toFixed(2)}  (expect $134,565.89)`);
  console.log(`Orders count: ${totals.ordersCount} (expect 15324) | Lines: ${totals.linesCount} (expect 25294) | Rentals: ${totals.rentalsCount} (expect 17991)`);

  if (DRY_RUN) {
    console.log('\nDry run complete — no data written. Re-run without --dry-run to load into Supabase.');
    return;
  }

  console.log('\nWriting to Supabase (in dependency order)...');
  await upsertBatched(db, 'Stores', [], 'LocationCode'); // seeded by SQL migration, nothing to do here
  await upsertBatched(db, 'Employees', employees, 'EmpID');
  await upsertBatched(db, 'Promotions', promotions, 'PromoCode');
  await upsertBatched(db, 'products', products, 'sku');
  await upsertBatched(db, 'product_variants', variants, 'sku');
  await upsertBatched(db, 'Customers_Core', custCore, 'CustomerID');
  await upsertBatched(db, 'Customers_Contact', custContact, 'CustomerID');
  await upsertBatched(db, 'Customers_Demographics', custDemo, 'CustomerID');
  await upsertBatched(db, 'Inventory', inventory, 'SKU');
  await upsertBatched(db, 'Orders', orders, 'OrderID');
  await upsertBatched(db, 'OrderLines', orderLines, 'OrderID,LineNumber');
  await upsertBatched(db, 'RentalTransactions', rentals, 'RentalID');
  await upsertBatched(db, 'OrderPromotions', orderPromos, 'OrderID,PromoCode');

  console.log('\nDone. Now spot-check the numbers above against the Supabase table editor / SQL editor.');
}

main().catch((err) => {
  console.error('\nMIGRATION FAILED:', err.stack);
  process.exit(1);
});
