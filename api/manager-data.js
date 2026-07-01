// Private endpoint — manager dashboard data.
// Password validated server-side before any data is returned.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://igfgyuuucaezuqtdvykl.supabase.co';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth     = req.headers.authorization || '';
  const password = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expected = process.env.MANAGER_PASSWORD;

  if (!expected)          return res.status(500).json({ error: 'Server misconfiguration' });
  if (password !== expected) return res.status(401).json({ error: 'Incorrect password' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Server misconfiguration' });

  const db = createClient(SUPABASE_URL, serviceKey);

  try {
    // ── All paid orders, newest first ────────────────────────────
    const { data: orders, error: ordersErr } = await db
      .from('Orders')
      .select('OrderID, OrderDate, OrderTotal, CustID')
      .eq('PaymentMethod', 'Stripe-Card')
      .order('OrderDate', { ascending: false });
    if (ordersErr) throw ordersErr;

    const allOrders = orders || [];

    // ── Rolling 7-day window ──────────────────────────────────────
    const weekAgo    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const weekOrders = allOrders.filter(o => o.OrderDate >= weekAgo);
    const weekCount  = weekOrders.length;
    const weekRevenue = weekOrders.reduce(function(s, o) { return s + Number(o.OrderTotal || 0); }, 0);

    // ── Recent 25 orders with customer names ──────────────────────
    const recent  = allOrders.slice(0, 25);
    const custIds = [...new Set(recent.map(function(o) { return o.CustID; }).filter(Boolean))];

    var custMap = {};
    if (custIds.length > 0) {
      const { data: customers } = await db
        .from('Customers_Core')
        .select('CustomerID, FirstName, LastName, Country')
        .in('CustomerID', custIds);
      (customers || []).forEach(function(c) { custMap[c.CustomerID] = c; });
    }

    const recentOrders = recent.map(function(o) {
      var cust = custMap[o.CustID];
      return {
        orderId:  o.OrderID,
        date:     o.OrderDate,
        customer: cust ? cust.LastName + ', ' + cust.FirstName.slice(0, 1) + '.' : '—',
        country:  cust ? (cust.Country || '—') : '—',
        total:    Number(o.OrderTotal || 0).toFixed(2),
      };
    });

    // ── Top seller (this week, by units) ──────────────────────────
    var topSeller = '—';
    if (weekOrders.length > 0) {
      const weekIds = weekOrders.map(function(o) { return o.OrderID; });

      const [linesRes, productsRes, variantsRes] = await Promise.all([
        db.from('OrderLines').select('ProductCode, Quantity').in('OrderID', weekIds),
        db.from('products').select('sku, name'),
        db.from('product_variants').select('sku, parent_sku'),
      ]);

      var variantToParent = {};
      (variantsRes.data || []).forEach(function(v) { variantToParent[v.sku] = v.parent_sku; });

      var productName = {};
      (productsRes.data || []).forEach(function(p) { productName[p.sku] = p.name; });

      var unitCounts = {};
      (linesRes.data || []).forEach(function(line) {
        var parentSku = variantToParent[line.ProductCode] || line.ProductCode;
        var name      = productName[parentSku] || line.ProductCode;
        unitCounts[name] = (unitCounts[name] || 0) + Number(line.Quantity || 0);
      });

      var top = Object.entries(unitCounts).sort(function(a, b) { return b[1] - a[1]; })[0];
      if (top) topSeller = top[0];
    }

    return res.status(200).json({
      weekCount,
      weekRevenue:  weekRevenue.toFixed(2),
      topSeller,
      recentOrders,
    });

  } catch (err) {
    console.error('manager-data error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
