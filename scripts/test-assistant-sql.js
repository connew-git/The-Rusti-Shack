// Local unit harness for the assistant's SQL safety layer.
//   node scripts/test-assistant-sql.js
//
// validateSelect is pure and runs with no DB. runQuery is exercised only if
// ASSISTANT_DB_URL is set (so this passes on a laptop without secrets, and
// does the real read-only/row-cap/timeout checks in an environment that has
// the connection string).

const { validateSelect, runQuery, ROW_CAP } = require('../lib/assistant-sql');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

console.log('validateSelect — should ACCEPT:');
[
  'select category, sum("LineRevenue") rev from asst_order_lines group by category',
  'SELECT * FROM asst_products WHERE category = \'Snorkel\'',
  'with t as (select sku, sum("Quantity") q from asst_order_lines group by sku) select * from t order by q desc',
  'select * from mgmt_product_perf where year = 2024',
  'select o."OrderID" from asst_orders o join asst_order_lines l on l."OrderID" = o."OrderID"',
].forEach(function (sql) { check(sql.slice(0, 60), validateSelect(sql).ok === true); });

console.log('validateSelect — should REJECT:');
[
  ['multi-statement',        'select 1 from asst_orders; drop table asst_orders'],
  ['update',                 'update asst_products set unit_price = 0'],
  ['delete',                 'delete from asst_orders'],
  ['insert',                 'insert into asst_orders values (1)'],
  ['drop',                   'drop view asst_orders'],
  ['non-select (explain)',   'explain select * from asst_orders'],
  ['off-allow-list table',   'select * from "Customers_Core"'],
  ['off-allow-list contact', 'select * from "Customers_Contact"'],
  ['system catalog',         'select * from pg_catalog.pg_tables'],
  ['information_schema',      'select * from information_schema.columns'],
  ['select into',            'select * into evil from asst_orders'],
  ['comment smuggling 2nd stmt', 'select 1 from asst_orders --x\n; drop table x'],
  ['pg_sleep',               'select pg_sleep(10) from asst_orders'],
  ['empty',                  '   '],
].forEach(function (pair) {
  var r = validateSelect(pair[1]);
  check(pair[0] + ' -> ' + (r.error || ''), r.ok === false);
});

async function dbChecks() {
  if (!process.env.ASSISTANT_DB_URL) {
    console.log('\nrunQuery — skipped (ASSISTANT_DB_URL not set).');
    return;
  }
  console.log('\nrunQuery — live DB:');
  try {
    const good = await runQuery('select category, sum("LineRevenue") rev from asst_order_lines group by category order by rev desc');
    check('good query returns rows', good.rows.length > 0);
    check('columns include category', good.columns.indexOf('category') !== -1);

    const capped = await runQuery('select "OrderID" from asst_orders');
    check('row cap enforced (<= ' + ROW_CAP + ')', capped.rows.length <= ROW_CAP);

    let timedOut = false;
    try { await runQuery('select "OrderID" from asst_orders o1 cross join asst_orders o2 cross join asst_orders o3'); }
    catch (e) { timedOut = /timeout|statement/i.test(e.message); }
    check('slow cross-join hits statement_timeout', timedOut);

    let denied = false;
    try { await runQuery('select * from "Customers_Core"'); }
    catch (e) { denied = /permission denied|not exist/i.test(e.message); }
    check('assistant_ro cannot read Customers_Core', denied);
  } catch (e) {
    failed++; console.log('  FAIL runQuery threw: ' + e.message);
  }
}

dbChecks().then(function () {
  console.log('\n' + passed + ' passed, ' + failed + ' failed.');
  process.exit(failed === 0 ? 0 : 1);
});
