// Local sample data so the app has something to show. Never run against production.
// Logins it creates (PIN 1234 for all): manager 0700 000 001, agents 0700 000 002 and 0700 000 003.
const config = require('../src/config');
const db = require('../src/db');
const { migrate } = require('../src/migrate');
const { hashPin } = require('../src/pin');

const PIN = '1234';
const PEOPLE = [
  ['Test Manager', '256700000001', 'manager'],
  ['Amos Okello', '256700000002', 'agent'],
  ['Bea Namutebi', '256700000003', 'agent'],
];
// [business, owner, phone, type, area, interest, stage, follow-up in days, expected UGX, agent index]
const LEADS = [
  ['Nakato Hardware', 'Sarah Nakato', '0772100001', 'Hardware', 'Kawempe', 'hot', 'demo', -2, 80000, 1],
  ['Mukasa Wholesale', 'John Mukasa', '0772100002', 'Wholesale', 'Owino', 'hot', 'trial', 0, 120000, 1],
  ['Kato Pharmacy', 'Peter Kato', '0772100003', 'Pharmacy', 'Ntinda', 'warm', 'contacted', 0, 50000, 1],
  ['Bright Phones', 'Ivan Ssali', '0772100004', 'Phones & electronics', 'Kikuubo', 'warm', 'contacted', 3, 50000, 1],
  ['Mama Rose Supermarket', 'Rose Akello', '0772100005', 'Supermarket', 'Wandegeya', 'hot', 'new', null, 100000, 1],
  ['Kampala Spares', 'Moses Lubega', '0772100006', 'Retail shop', 'Katwe', null, 'paying', null, 50000, 1],
  ['Bella Salon', 'Bella Nansubuga', '0772100007', 'Salon / beauty', 'Kansanga', 'cold', 'lost', null, null, 1],
  ['Jinja Road Hardware', 'Paul Wasswa', '0772100008', 'Hardware', 'Mukono', 'hot', 'demo', -1, 80000, 2],
  ['Ggaba Traders', 'Agnes Nalubega', '0772100009', 'Retail shop', 'Ggaba', 'warm', 'contacted', 1, 50000, 2],
  ['Entebbe Pharma', 'Dr. Okoth', '0772100010', 'Pharmacy', 'Entebbe', 'hot', 'paying', null, 120000, 2],
];

async function main() {
  if (config.isProduction || config.db.schema === 'public') {
    console.error('seed-dev only runs against a local, non-public schema (set DB_SCHEMA, e.g. lefori_crm).');
    process.exitCode = 1;
    return;
  }
  await migrate({ log: () => {} });
  const ids = [];
  for (const [name, phone, role] of PEOPLE) {
    const u = await db.one(
      `INSERT INTO users (name, phone, pin_hash, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, pin_hash = EXCLUDED.pin_hash, role = EXCLUDED.role, active = TRUE
       RETURNING id`,
      [name, phone, await hashPin(PIN), role],
    );
    ids.push(u.id);
  }
  let added = 0;
  for (const [biz, owner, phone, type, area, interest, stage, follow, ugx, who] of LEADS) {
    const exists = await db.one('SELECT id FROM leads WHERE phone = $1', [`256${phone.slice(1)}`]);
    if (exists) continue;
    const lead = await db.one(
      `INSERT INTO leads (business_name, owner_name, phone, business_type, area, interest, stage, demo_done,
         next_follow_up_on, expected_ugx, agent_id, created_by, first_visit_on, last_contact_on, lost_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9::int IS NULL THEN NULL ELSE CURRENT_DATE + $9::int END,
         $10, $11, $11, CURRENT_DATE - 12, CURRENT_DATE - 3, $12) RETURNING id`,
      [biz, owner, `256${phone.slice(1)}`, type, area, interest, stage, ['demo', 'trial', 'paying'].includes(stage),
        follow, ugx, ids[who], stage === 'lost' ? 'Too expensive' : null],
    );
    await db.query(
      `INSERT INTO visits (lead_id, agent_id, kind, happened_on, what_happened, next_step) VALUES
       ($1, $2, 'visit', CURRENT_DATE - 12, 'First visit. Showed the app on my phone.', 'Come back with a demo'),
       ($1, $2, 'call', CURRENT_DATE - 3, 'Called to check in.', NULL)`,
      [lead.id, ids[who]],
    );
    added += 1;
  }
  console.log(`Seeded ${PEOPLE.length} people and ${added} new leads. PIN for all: see the top of this file.`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => db.pool.end());
