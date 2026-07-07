// Text-to-SQL safety + execution layer for the "Ask the Data" assistant.
//
// This module is the app-level half of the "read-only, enforced twice"
// guarantee (build-spec §2). The other half is the assistant_ro Postgres
// role (see supabase/assistant_readonly.sql), which can physically only
// SELECT the allow-listed views. Even if validateSelect() had a bug, that
// role could not write or read anything outside the allow-list.
//
// Nothing here ever uses the service-role key — data queries run ONLY as
// assistant_ro via ASSISTANT_DB_URL.

const { Client } = require('pg');

// ── ALLOW-LIST ──────────────────────────────────────────────────────
// Single source of truth for what the model may touch. Kept in sync with
// supabase/assistant_readonly.sql. Column lists are also used to describe
// the schema to the model, so it doesn't invent columns.
const ALLOWED = {
  asst_orders:      ['OrderID', 'OrderDate', 'CustID', 'LocationID', 'Channel', 'ShippingFee', 'OrderTotal', 'PaymentMethod'],
  asst_order_lines: ['OrderID', 'OrderDate', 'LineNumber', 'sku', 'product_name', 'category', 'Quantity', 'LineRevenue', 'LineCost', 'EffectiveDiscountAmount'],
  asst_products:    ['sku', 'name', 'category', 'subcategory', 'unit_price', 'rental_rate', 'unit_cost', 'availability', 'supplier', 'year_introduced'],
  asst_rentals:     ['RentalID', 'RentalDate', 'ReturnDate', 'DaysBilled', 'CustID', 'LocationID', 'SalesAssociate', 'sku', 'Quantity', 'DailyRate', 'RentalRevenue', 'Returned', 'Channel', 'OrderID'],
  asst_customers:   ['CustomerID', 'CustomerType', 'Country', 'JoinDate', 'Gender', 'Occupation', 'LoyaltyMember'],
  // Pre-aggregated views — fast path for headline figures.
  mgmt_monthly_revenue: ['month', 'year', 'month_num', 'sales_revenue', 'sales_cost', 'sales_margin', 'rental_revenue', 'total_revenue'],
  mgmt_category_perf:    ['year', 'category', 'revenue', 'cost', 'margin', 'margin_pct', 'units'],
  mgmt_product_perf:     ['year', 'sku', 'product_name', 'category', 'revenue', 'margin', 'margin_pct', 'units'],
  mgmt_rental_loss:      ['year', 'sku', 'product_name', 'lost_units', 'rented_units', 'lost_value_at_cost'],
  mgmt_season_revenue:   ['year', 'season', 'revenue'],
  mgmt_customer_mix:     ['year', 'customer_type', 'revenue', 'order_count', 'customer_count'],
  mgmt_reorder:          ['sku'],   // columns vary; model should SELECT * from it
};

const ROW_CAP = 200;           // hard LIMIT wrapped around every query (§2)
const QUERY_TIMEOUT_MS = 5000; // client-side guard; DB role also enforces this (§2)

// Statements that must never appear, even inside an otherwise-valid SELECT.
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|merge|call|into|vacuum|analyze|reindex|cluster|execute|lock|listen|notify|set|reset|begin|commit|rollback|savepoint|refresh|comment|do)\b/i;
// System catalog / config access — blocked outright regardless of allow-list.
const SYSTEM = /(pg_catalog|information_schema|\bpg_[a-z_]+|current_setting|set_config)/i;

function stripComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')  // /* block */
    .replace(/--[^\n]*/g, ' ');         // -- line
}

function stripTrailingSemicolon(sql) {
  return sql.replace(/;\s*$/, '');
}

// Names introduced by CTEs / derived tables (`name as (`) are legitimate
// references in FROM/JOIN even though they aren't in ALLOWED.
function cteNames(sql) {
  const names = new Set();
  const re = /([a-z_][a-z0-9_]*)\s+as\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) names.add(m[1].toLowerCase());
  return names;
}

// Returns { ok: true } or { ok: false, error: '...' }. Never throws.
function validateSelect(rawSql) {
  if (!rawSql || typeof rawSql !== 'string') {
    return { ok: false, error: 'No SQL provided.' };
  }

  let sql = stripComments(rawSql).trim();
  if (!sql) return { ok: false, error: 'Empty query.' };

  // Exactly one statement: strip one optional trailing ';', then any ';'
  // that remains means multiple statements.
  sql = stripTrailingSemicolon(sql);
  if (sql.indexOf(';') !== -1) {
    return { ok: false, error: 'Only a single statement is allowed (no semicolons).' };
  }

  // Must be a read.
  if (!/^\s*(select|with)\b/i.test(sql)) {
    return { ok: false, error: 'Only SELECT queries are allowed.' };
  }

  if (FORBIDDEN.test(sql)) {
    return { ok: false, error: 'Query contains a disallowed keyword — reads only.' };
  }
  if (SYSTEM.test(sql)) {
    return { ok: false, error: 'Query references system catalogs, which are not allowed.' };
  }

  // Allow-list: every FROM/JOIN target must be an allow-listed view or a
  // CTE/derived name defined in this same query.
  const allowedCtes = cteNames(sql);
  const refRe = /\b(?:from|join)\s+("?[a-zA-Z_][a-zA-Z0-9_$]*"?)/gi;
  let ref;
  while ((ref = refRe.exec(sql)) !== null) {
    const name = ref[1].replace(/"/g, '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(ALLOWED, name) && !allowedCtes.has(name)) {
      return { ok: false, error: 'Table "' + name + '" is not in the allow-list.' };
    }
  }

  return { ok: true };
}

// Executes a query that has ALREADY passed validateSelect(). Connects as the
// SELECT-only assistant_ro role, wraps the query in a hard row cap, and
// enforces a statement timeout. Returns { rows, columns, rowCount, truncated }.
async function runQuery(sql) {
  const conn = process.env.ASSISTANT_DB_URL;
  if (!conn) throw new Error('ASSISTANT_DB_URL is not configured');

  const client = new Client({
    connectionString: conn,
    statement_timeout: QUERY_TIMEOUT_MS, // server-side kill
    query_timeout: QUERY_TIMEOUT_MS + 1000,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const wrapped = 'select * from (' + stripTrailingSemicolon(stripComments(sql).trim()) +
      ') _rusti_q limit ' + ROW_CAP;
    const res = await client.query(wrapped);
    return {
      rows: res.rows,
      columns: (res.fields || []).map(function (f) { return f.name; }),
      rowCount: res.rowCount,
      truncated: res.rowCount >= ROW_CAP,
    };
  } finally {
    await client.end();
  }
}

// Human-readable schema for the system prompt, straight from ALLOWED so it
// can never drift from what's actually permitted.
function describeSchema() {
  return Object.keys(ALLOWED).map(function (view) {
    return view + ' (' + ALLOWED[view].join(', ') + ')';
  }).join('\n');
}

module.exports = { ALLOWED, ROW_CAP, QUERY_TIMEOUT_MS, validateSelect, runQuery, describeSchema };
