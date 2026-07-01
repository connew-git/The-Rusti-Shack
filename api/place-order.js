// Vercel serverless function — runs server-side with the secret key.
// The browser never sees SUPABASE_SERVICE_ROLE_KEY or STRIPE_SECRET_KEY.
// Set both in Vercel Dashboard → Settings → Environment Variables.

const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = 'https://igfgyuuucaezuqtdvykl.supabase.co';
// Web-reserved CustomerID range: C50001–C99999
// Keeps web orders from ever colliding with Rusti's in-store IDs.
const WEB_CUST_MIN = 50001;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Server misconfiguration — Supabase key missing' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Server misconfiguration — Stripe key missing' });

  const db = createClient(SUPABASE_URL, serviceKey);

  const { customer, cart, shipping } = req.body || {};

  // ── Basic validation ──────────────────────────────────────────────────
  if (!customer?.firstName || !customer?.lastName || !customer?.email || !customer?.country) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const email = customer.email.toLowerCase().trim();

  try {
    // ── 1. Customer lookup / create ───────────────────────────────────
    let customerId;

    const { data: existingContact } = await db
      .from('Customers_Contact')
      .select('CustomerID')
      .eq('Email', email)
      .maybeSingle();

    if (existingContact) {
      customerId = existingContact.CustomerID;
    } else {
      // Next ID in web range
      const { data: maxRow } = await db
        .from('Customers_Core')
        .select('CustomerID')
        .gte('CustomerID', 'C' + WEB_CUST_MIN)
        .order('CustomerID', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextNum = maxRow
        ? parseInt(maxRow.CustomerID.slice(1)) + 1
        : WEB_CUST_MIN;
      customerId = 'C' + String(nextNum).padStart(5, '0');

      const today = new Date().toISOString().slice(0, 10);

      const { error: coreErr } = await db.from('Customers_Core').insert({
        CustomerID:   customerId,
        FirstName:    customer.firstName.trim(),
        LastName:     customer.lastName.trim(),
        CustomerType: 'Shipping',
        JoinDate:     today,
        City:         customer.city    || null,
        Country:      customer.country || null,
      });
      if (coreErr) throw coreErr;

      const { error: contactErr } = await db.from('Customers_Contact').insert({
        CustomerID:    customerId,
        Email:         email,
        Phone:         customer.phone         || null,
        LoyaltyMember: Boolean(customer.loyaltyMember),
        StreetAddress: customer.streetAddress  || null,
        Region:        customer.region         || null,
        PostalCode:    customer.postalCode     || null,
      });
      if (contactErr) throw contactErr;
    }

    // ── 2. Create order (Stripe-Pending until payment confirmed) ─────
    const orderId  = 'ORD-W-' + Date.now();
    const shipFee  = typeof shipping === 'number' ? shipping : 12;
    const subtotal = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);

    const { error: orderErr } = await db.from('Orders').insert({
      OrderID:        orderId,
      OrderDate:      new Date().toISOString().slice(0, 10),
      CustID:         customerId,
      LocationID:     'SHIP-INTL',
      SalesAssociate: 'WEB',
      Channel:        'Shipping',
      ShippingFee:    shipFee,
      OrderTotal:     parseFloat((subtotal + shipFee).toFixed(2)),
      PaymentMethod:  'Stripe-Pending',
    });
    if (orderErr) throw orderErr;

    // ── 3. Order lines ────────────────────────────────────────────────
    const lines = cart.map(function(item, i) {
      return {
        OrderID:                 orderId,
        LineNumber:              i + 1,
        ProductCode:             item.sku,
        Quantity:                item.qty,
        UnitPrice:               item.price,
        DiscountPct:             0,
        LineRevenue:             parseFloat((item.price * item.qty).toFixed(2)),
        LineCost:                0,
        EffectiveDiscountAmount: 0,
      };
    });

    const { error: linesErr } = await db.from('OrderLines').insert(lines);
    if (linesErr) throw linesErr;

    // ── 4. Create Stripe Checkout Session ─────────────────────────────
    const proto   = req.headers['x-forwarded-proto'] || 'https';
    const host    = req.headers['x-forwarded-host'] || req.headers.host || 'the-rusti-shack-woad.vercel.app';
    const baseUrl = proto + '://' + host;

    const stripeLineItems = cart.map(function(item) {
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.variantLabel ? item.name + ' — ' + item.variantLabel : item.name,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.qty,
      };
    });

    stripeLineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Shipping' },
        unit_amount: Math.round(shipFee * 100),
      },
      quantity: 1,
    });

    const session = await stripe.checkout.sessions.create({
      mode:           'payment',
      customer_email: email,
      metadata:       { orderId: orderId, customerId: String(customerId) },
      line_items:     stripeLineItems,
      success_url:    baseUrl + '/checkout-success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:     baseUrl + '/cart.html',
    });

    return res.status(200).json({ sessionUrl: session.url });

  } catch (err) {
    console.error('place-order error:', err);
    return res.status(500).json({ error: err.message || 'Server error — please try again' });
  }
};
