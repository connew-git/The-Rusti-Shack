// Private endpoint — streams all paid order lines as a CSV file.
// One row per line item. Opens straight into Excel.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://igfgyuuucaezuqtdvykl.supabase.co';

function csvCell(val) {
  var s = (val === null || val === undefined) ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
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

  const db = createClient(SUPABASE_URL, serviceKey);

  try {
    const [ordersRes, linesRes, customersRes, productsRes, variantsRes] = await Promise.all([
      db.from('Orders').select('OrderID, OrderDate, OrderTotal, ShippingFee, CustID').eq('PaymentMethod', 'Stripe-Card').order('OrderDate', { ascending: false }),
      db.from('OrderLines').select('OrderID, LineNumber, ProductCode, Quantity, UnitPrice, LineRevenue'),
      db.from('Customers_Core').select('CustomerID, FirstName, LastName, Country'),
      db.from('products').select('sku, name'),
      db.from('product_variants').select('sku, parent_sku'),
    ]);

    // Build lookup maps
    var orderMap = {};
    (ordersRes.data || []).forEach(function(o) { orderMap[o.OrderID] = o; });

    var custMap = {};
    (customersRes.data || []).forEach(function(c) { custMap[c.CustomerID] = c; });

    var productName = {};
    (productsRes.data || []).forEach(function(p) { productName[p.sku] = p.name; });

    var variantToParent = {};
    (variantsRes.data || []).forEach(function(v) { variantToParent[v.sku] = v.parent_sku; });

    // Only export lines from paid orders
    const paidOrderIds = new Set(Object.keys(orderMap));
    const lines = (linesRes.data || []).filter(function(l) { return paidOrderIds.has(l.OrderID); });

    // Sort: newest order first, then by line number
    lines.sort(function(a, b) {
      var oa = orderMap[a.OrderID] || {}, ob = orderMap[b.OrderID] || {};
      if (oa.OrderDate < ob.OrderDate) return 1;
      if (oa.OrderDate > ob.OrderDate) return -1;
      return a.LineNumber - b.LineNumber;
    });

    var headers = ['OrderID', 'Date', 'CustomerID', 'FirstName', 'LastName', 'Country',
                   'SKU', 'ProductName', 'Quantity', 'UnitPrice', 'LineRevenue',
                   'OrderTotal', 'ShippingFee'];

    var csvRows = [headers.join(',')];

    lines.forEach(function(line) {
      var order  = orderMap[line.OrderID] || {};
      var cust   = custMap[order.CustID]  || {};
      var parent = variantToParent[line.ProductCode] || line.ProductCode;
      var name   = productName[parent] || line.ProductCode;

      csvRows.push([
        csvCell(line.OrderID),
        csvCell(order.OrderDate),
        csvCell(order.CustID),
        csvCell(cust.FirstName),
        csvCell(cust.LastName),
        csvCell(cust.Country),
        csvCell(line.ProductCode),
        csvCell(name),
        csvCell(line.Quantity),
        csvCell(Number(line.UnitPrice   || 0).toFixed(2)),
        csvCell(Number(line.LineRevenue || 0).toFixed(2)),
        csvCell(Number(order.OrderTotal  || 0).toFixed(2)),
        csvCell(Number(order.ShippingFee || 0).toFixed(2)),
      ].join(','));
    });

    var csv      = csvRows.join('\r\n');
    var filename = 'rusti-sales-' + new Date().toISOString().slice(0, 10) + '.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    return res.status(200).send('﻿' + csv); // BOM so Excel opens UTF-8 correctly

  } catch (err) {
    console.error('manager-export error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
