// Usage: npm run create-manager -- "Full Name" 0772123456 1234
// Creates a manager, or makes an existing team member a manager with that PIN.
const db = require('../src/db');
const { migrate } = require('../src/migrate');
const { normalizePhone } = require('../src/phone');
const { validPin, hashPin } = require('../src/pin');

async function main() {
  const [name, phoneArg, pin] = process.argv.slice(2);
  const phone = normalizePhone(phoneArg);
  if (!name || !phone || !validPin(pin)) {
    console.error('Usage: npm run create-manager -- "Full Name" 0772123456 1234   (PIN is 4 to 6 digits)');
    process.exitCode = 1;
    return;
  }
  await migrate({ log: () => {} });
  await db.query(
    `INSERT INTO users (name, phone, pin_hash, role) VALUES ($1, $2, $3, 'manager')
     ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, pin_hash = EXCLUDED.pin_hash, role = 'manager', active = TRUE`,
    [name, phone, await hashPin(pin)],
  );
  console.log(`${name} can now log in as a manager.`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => db.pool.end());
