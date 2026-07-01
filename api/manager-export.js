// Private endpoint — CSV downloads for the manager dashboard.
// Main export (?table omitted): one row per order line, all paid orders.
// Raw table exports (?table=orders|orderlines|customers_core|customers_contact).

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://igfgyuuucaezuqtdvykl.supabase.co';

function csvCell(val) {
  var s = (val === null || val === undefined) ? '' : String(val);
  // Neutralize formula injection — a customer-supplied name/address starting with
  // =, +, -, or @ would otherwise be evaluated as a formula when opened in Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function sendCsv(res, rows, filename) {
  var csv = rows.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  return res.status(200).send('﻿' + csv); // BOM so Excel opens UTF-8 correctly
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth     = req.headers.authorization || '';
  const password = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expected = process.env.MANAGER_PASSWORD;

  if (!expected)             return res.status(500).json({ error: 'Server misconfiguration' });
  if (password !== expected) return res.status(401).json({ error: 'Incorrect password' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Server misconfiguration' });

  const db   = createClient(SUPABASE_URL, serviceKey);
  const date = new Date().toISOString().slice(0, 10);
  const table = (req.query.table || '').toLowerCase();

  try {

    // ── RAW TABLE EXPORTS ─────────────────────────────────────────
    if (table === 'orders') {
      const { data, error } = await db
        .from('Orders')
        .select('OrderID, OrderDate, CustID, LocationID, SalesAssociate, Channel, ShippingFee, OrderTotal, PaymentMethod')
        .order('OrderDate', { ascending: false });
      if (error) throw error;

      var headers = ['OrderID','OrderDate','CustID','LocationID','SalesAssociate','Channel','ShippingFee','OrderTotal','PaymentMethod'];
      var rows = [headers.join(',')];
      (data || []).forEach(function(r) {
        rows.push(headers.map(function(h) { return csvCell(r[h]); }).join(','));
      });
      return sendCsv(res, rows, 'rusti-orders-' + date + '.csv');
    }

    if (table === 'orderlines') {
      const { data, error } = await db
        .from('OrderLines')
        .select('OrderID, LineNumber, ProductCode, Quantity, UnitPrice, DiscountPct, LineRevenue, LineCost, EffectiveDiscountAmount');
      if (error) throw error;

      var headers = ['OrderID','LineNumber','ProductCode','Quantity','UnitPrice','DiscountPct','LineRevenue','LineCost','EffectiveDiscountAmount'];
      var rows = [headers.join(',')];
      (data || []).forEach(function(r) {
        rows.push(headers.map(function(h) { return csvCell(r[h]); }).join(','));
      });
      return sendCsv(res, rows, 'rusti-orderlines-' + date + '.csv');
    }

    if (table === 'customers_core') {
      const { data, error } = await db
        .from('Customers_Core')
        .select('CustomerID, FirstName, LastName, CustomerType, JoinDate, City, Country')
        .order('CustomerID', { ascending: true });
      if (error) throw error;

      var headers = ['CustomerID','FirstName','LastName','CustomerType','JoinDate','City','Country'];
      var rows = [headers.join(',')];
      (data || []).forEach(function(r) {
        rows.push(headers.map(function(h) { return csvCell(r[h]); }).join(','));
      });
      return sendCsv(res, rows, 'rusti-customers-core-' + date + '.csv');
    }

    if (table === 'customers_contact') {
      const { data, error } = await db
        .from('Customers_Contact')
        .select('CustomerID, Email, Phone, LoyaltyMember, StreetAddress, Region, PostalCode')
        .order('CustomerID', { ascending: true });
      if (error) throw error;

      var headers = ['CustomerID','Email','Phone','LoyaltyMember','StreetAddress','Region','PostalCode'];
      var rows = [headers.join(',')];
      (data || []).forEach(function(r) {
        rows.push(headers.map(function(h) { return csvCell(r[h]); }).join(','));
      });
      return sendCsv(res, rows, 'rusti-customers-contact-' + date + '.csv');
    }

    // ── MAIN SALES EXPORT (default) ───────────────────────────────
    // One row per line item across all paid orders.
    // Columns match the checklist exactly:
    // OrderID, OrderDate, FirstName, LastName, Country, ProductCode, ProductName,
    // Quantity, UnitPrice, LineRevenue, ShippingFee, OrderTotal, PaymentMethod

    const [ordersRes, linesRes, customersRes, productsRes, variantsRes] = await Promise.all([
      db.from('Orders')
        .select('OrderID, OrderDate, OrderTotal, ShippingFee, CustID, PaymentMethod')
        .eq('PaymentMethod', 'Stripe-Card')
        .order('OrderDate', { ascending: false }),
      db.from('OrderLines')
        .select('OrderID, LineNumber, ProductCode, Quantity, UnitPrice, LineRevenue'),
      db.from('Customers_Core')
        .select('CustomerID, FirstName, LastName, Country'),
      db.from('products').select('sku, name'),
      db.from('product_variants').select('sku, parent_sku'),
    ]);

    var orderMap = {};
    (ordersRes.data || []).forEach(function(o) { orderMap[o.OrderID] = o; });

    var custMap = {};
    (customersRes.data || []).forEach(function(c) { custMap[c.CustomerID] = c; });

    var productName = {};
    (productsRes.data || []).forEach(function(p) { productName[p.sku] = p.name; });

    var variantToParent = {};
    (variantsRes.data || []).forEach(function(v) { variantToParent[v.sku] = v.parent_sku; });

    const paidOrderIds = new Set(Object.keys(orderMap));
    const lines = (linesRes.data || []).filter(function(l) { return paidOrderIds.has(l.OrderID); });

    lines.sort(function(a, b) {
      var oa = orderMap[a.OrderID] || {}, ob = orderMap[b.OrderID] || {};
      if (oa.OrderDate < ob.OrderDate) return 1;
      if (oa.OrderDate > ob.OrderDate) return -1;
      return a.LineNumber - b.LineNumber;
    });

    var salesHeaders = [
      'OrderID','OrderDate','FirstName','LastName','Country',
      'ProductCode','ProductName','Quantity','UnitPrice','LineRevenue',
      'ShippingFee','OrderTotal','PaymentMethod',
    ];
    var salesRows = [salesHeaders.join(',')];

    lines.forEach(function(line) {
      var order  = orderMap[line.OrderID] || {};
      var cust   = custMap[order.CustID]  || {};
      var parent = variantToParent[line.ProductCode] || line.ProductCode;
      var name   = productName[parent] || line.ProductCode;

      salesRows.push([
        csvCell(line.OrderID),
        csvCell(order.OrderDate),
        csvCell(cust.FirstName),
        csvCell(cust.LastName),
        csvCell(cust.Country),
        csvCell(line.ProductCode),
        csvCell(name),
        csvCell(line.Quantity),
        csvCell(Number(line.UnitPrice   || 0).toFixed(2)),
        csvCell(Number(line.LineRevenue || 0).toFixed(2)),
        csvCell(Number(order.ShippingFee || 0).toFixed(2)),
        csvCell(Number(order.OrderTotal  || 0).toFixed(2)),
        csvCell(order.PaymentMethod),
      ].join(','));
    });

    return sendCsv(res, salesRows, 'rusti-sales-' + date + '.csv');

  } catch (err) {
    console.error('manager-export error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
