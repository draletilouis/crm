const crypto = require('crypto');
const { promisify } = require('util');

// Node's built-in scrypt: no native add-on to install or get blocked.
const scrypt = promisify(crypto.scrypt);

const validPin = (pin) => typeof pin === 'string' && /^\d{4,6}$/.test(pin);

async function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(pin, salt, 32);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function checkPin(pin, stored) {
  const [scheme, salt, hex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const hash = await scrypt(String(pin), salt, 32);
  const expected = Buffer.from(hex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

module.exports = { validPin, hashPin, checkPin };
