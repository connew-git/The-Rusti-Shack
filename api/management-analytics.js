// Private endpoint — aggregated analytics for the /management back office.
// Session-gated (see lib/management-auth.js). Reads the pre-aggregated
// mgmt_* views (see part_c_analytics_views.sql), which are small enough to
// return in full — the year slicer then filters client-side with no refetch.

const { createClient } = require('@supabase/supabase-js');
const { isAuthenticated } = require('../lib/management-auth');

const SUPABASE_URL = 'https://igfgyuuucaezuqtdvykl.supabase.co';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Server misconfiguration' });

  const db = createClient(SUPABASE_URL, serviceKey);

  try {
    const [monthly, categories, products, rentalLoss, seasons, customers] = await Promise.all([
      db.from('mgmt_monthly_revenue').select('*').order('month', { ascending: true }),
      db.from('mgmt_category_perf').select('*'),
      db.from('mgmt_product_perf').select('*'),
      db.from('mgmt_rental_loss').select('*'),
      db.from('mgmt_season_revenue').select('*'),
      db.from('mgmt_customer_mix').select('*'),
    ]);

    const firstErr = [monthly, categories, products, rentalLoss, seasons, customers]
      .map(function(r) { return r.error; })
      .find(Boolean);
    if (firstErr) throw firstErr;

    return res.status(200).json({
      monthly:    monthly.data    || [],
      categories: categories.data || [],
      products:   products.data   || [],
      rentalLoss: rentalLoss.data || [],
      seasons:    seasons.data    || [],
      customers:  customers.data  || [],
    });
  } catch (err) {
    console.error('management-analytics error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
