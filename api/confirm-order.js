// Vercel serverless function — verifies Stripe payment and marks the order paid.
// Only the server ever calls Stripe with the secret key.

const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = 'https://igfgyuuucaezuqtdvykl.supabase.co';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Server misconfiguration' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not yet complete.' });
    }

    const { orderId } = session.metadata;

    const db = createClient(SUPABASE_URL, serviceKey);
    await db.from('Orders').update({ PaymentMethod: 'Stripe-Card' }).eq('OrderID', orderId);

    return res.status(200).json({
      orderId:    orderId,
      customerId: session.metadata.customerId,
      email:      session.customer_email,
    });

  } catch (err) {
    console.error('confirm-order error:', err);
    return res.status(500).json({ error: err.message || 'Could not confirm order' });
  }
};
