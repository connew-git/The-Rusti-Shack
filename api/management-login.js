// Vercel serverless function — the one place the submitted password is
// ever looked at. Checked against a bcrypt hash (MANAGEMENT_PASSWORD_HASH),
// never against a stored plaintext value. On success, issues a signed
// session cookie (see lib/management-auth.js) — the password itself is
// never returned to the browser or stored client-side.

const bcrypt = require('bcryptjs');
const { createSessionCookie } = require('../lib/management-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const passwordHash = process.env.MANAGEMENT_PASSWORD_HASH;
  if (!passwordHash) return res.status(500).json({ error: 'Server misconfiguration' });

  const { password } = req.body || {};
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required' });
  }

  try {
    const match = await bcrypt.compare(password, passwordHash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    res.setHeader('Set-Cookie', createSessionCookie());
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('management-login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
