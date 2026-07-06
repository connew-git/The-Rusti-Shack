// Clears the session cookie. No password/data involved.

const { clearSessionCookie } = require('../lib/management-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
};
