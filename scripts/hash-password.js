// Run this yourself: node scripts/hash-password.js "YourPasswordHere"
// Prints a bcrypt hash of the password and a fresh random JWT signing
// secret, both meant to be set as Vercel environment variables — never
// commit either value, and never paste them into chat.

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js "YourPasswordHere"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const jwtSecret = crypto.randomBytes(48).toString('hex');

console.log('\nSet these two in Vercel → Settings → Environment Variables:\n');
console.log('MANAGEMENT_PASSWORD_HASH=' + hash);
console.log('MANAGEMENT_JWT_SECRET=' + jwtSecret);
console.log('\n(Round-trip check: correct password matches =',
  bcrypt.compareSync(password, hash),
  '| wrong password rejected =',
  !bcrypt.compareSync('definitely-wrong', hash), ')');
