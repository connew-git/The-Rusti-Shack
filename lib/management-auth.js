// Shared helper for /management auth. Lives outside api/ so Vercel doesn't
// treat it as its own route — it's imported by the management-* functions.
//
// Session model: a short-lived signed JWT in an HttpOnly cookie. The
// password itself is never stored or compared in plaintext (see
// management-login.js, which does the one-time bcrypt check), and this
// module never touches the password at all — it only issues/verifies the
// token that proves that check already happened.

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'mgmt_session';
const SESSION_HOURS = 8;

function getSigningSecret() {
  const secret = process.env.MANAGEMENT_JWT_SECRET;
  if (!secret) throw new Error('Server misconfiguration — MANAGEMENT_JWT_SECRET missing');
  return secret;
}

function createSessionCookie() {
  const token = jwt.sign({ role: 'manager' }, getSigningSecret(), { expiresIn: SESSION_HOURS + 'h' });
  const maxAgeSeconds = SESSION_HOURS * 60 * 60;
  return COOKIE_NAME + '=' + token +
    '; HttpOnly; Secure; SameSite=Strict; Path=/api/management; Max-Age=' + maxAgeSeconds;
}

function clearSessionCookie() {
  return COOKIE_NAME + '=; HttpOnly; Secure; SameSite=Strict; Path=/api/management; Max-Age=0';
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(function(part) {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

// Returns true/false. Never throws — a malformed or expired token is just
// treated as "not authenticated," same as no token at all.
function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  try {
    const payload = jwt.verify(token, getSigningSecret());
    return payload && payload.role === 'manager';
  } catch (err) {
    return false;
  }
}

module.exports = { createSessionCookie, clearSessionCookie, isAuthenticated };
