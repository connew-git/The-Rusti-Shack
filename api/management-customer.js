// Private endpoint — the non-AI "resolve an anonymous ID to a real customer"
// path (build-spec §3). The assistant only ever sees an anonymous CustID;
// when Rusti wants to ACT on an answer (e.g. "email her a discount"), she
// looks the ID up here. This uses the service-role key and returns real
// contact details, so it is deliberately kept OUT of anything the model can
// reach — the model has no access to this route or its data.
//
// Session-gated exactly like the other management-* endpoints.

const { createClient } = require('@supabase/supabase-js');
const { isAuthenticated } = require('../lib/management-auth');

const SUPABASE_URL = 'https://igfgyuuucaezuqtdvykl.supabase.co';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Server misconfiguration' });

  const custId = (req.query && req.query.custId ? String(req.query.custId) : '').trim();
  if (!custId) return res.status(400).json({ error: 'custId is required' });

  const db = createClient(SUPABASE_URL, serviceKey);

  try {
    const { data: core, error: coreErr } = await db
      .from('Customers_Core')
      .select('CustomerID, FirstName, LastName, CustomerType, JoinDate, City, Country')
      .eq('CustomerID', custId)
      .maybeSingle();
    if (coreErr) throw coreErr;
    if (!core) return res.status(404).json({ error: 'No customer with that ID.' });

    const { data: contact } = await db
      .from('Customers_Contact')
      .select('Email, Phone, LoyaltyMember, StreetAddress, Region, PostalCode')
      .eq('CustomerID', custId)
      .maybeSingle();

    return res.status(200).json({
      customerId:   core.CustomerID,
      name:         (core.FirstName || '') + ' ' + (core.LastName || ''),
      customerType: core.CustomerType || null,
      joinDate:     core.JoinDate || null,
      city:         core.City || null,
      country:      core.Country || null,
      email:        contact ? contact.Email : null,
      phone:        contact ? contact.Phone : null,
      loyaltyMember: contact ? contact.LoyaltyMember : null,
      address:      contact ? [contact.StreetAddress, contact.Region, contact.PostalCode].filter(Boolean).join(', ') || null : null,
    });
  } catch (err) {
    console.error('management-customer error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
