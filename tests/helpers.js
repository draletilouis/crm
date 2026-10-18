const request = require('supertest');
const db = require('../src/db');
const { migrate } = require('../src/migrate');
const { hashPin } = require('../src/pin');
const { createApp } = require('../src/app');

// Tests run in their own schema (lefori_crm_test), wiped before each file.
async function resetDb() {
  if (!/_test$/.test(db.schema)) throw new Error(`Refusing to wipe schema ${db.schema}`);
  await db.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`);
  await migrate({ log: () => {} });
}

async function makeUser({ name, phone, pin = '1234', role = 'agent', active = true }) {
  return db.one(
    'INSERT INTO users (name, phone, pin_hash, role, active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [name, phone, await hashPin(pin), role, active],
  );
}

// A logged-in client. Every change carries the header the app sends.
async function loginAs(app, phone, pin = '1234') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set('X-Requested-With', 'lefori-sales').send({ phone, pin });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const h = (r) => r.set('X-Requested-With', 'lefori-sales');
  return {
    raw: agent,
    get: (url) => agent.get(url),
    post: (url, body) => h(agent.post(url)).send(body),
    patch: (url, body) => h(agent.patch(url)).send(body),
    del: (url) => h(agent.delete(url)),
  };
}

async function setup() {
  await resetDb();
  const app = createApp();
  const manager = await makeUser({ name: 'Grace Manager', phone: '256700000001', role: 'manager' });
  const amos = await makeUser({ name: 'Amos Agent', phone: '256700000002' });
  const bea = await makeUser({ name: 'Bea Agent', phone: '256700000003' });
  return { app, manager, amos, bea };
}

module.exports = { db, resetDb, makeUser, loginAs, setup, request };
