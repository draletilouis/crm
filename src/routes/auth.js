const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { ah, fail } = require('../http');
const { normalizePhone, formatPhone } = require('../phone');
const { validPin, hashPin, checkPin } = require('../pin');

const publicUser = (u) => ({ id: u.id, name: u.name, phone: formatPhone(u.phone), role: u.role, active: u.active });

// Loads the signed-in user on every request, so a deactivated agent is out at once.
const requireUser = ah(async (req, res, next) => {
  const id = req.session && req.session.userId;
  if (!id) fail(401, 'Please log in');
  const user = await db.one('SELECT * FROM users WHERE id = $1', [id]);
  if (!user || !user.active) {
    req.session.destroy(() => {});
    fail(401, 'Please log in');
  }
  req.user = user;
  req.isManager = user.role === 'manager';
  next();
});

const requireManager = (req, res, next) => (req.isManager ? next() : next(Object.assign(new Error('Managers only'), { status: 403 })));

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const pin = String(req.body.pin || '');
  const user = phone ? await db.one('SELECT * FROM users WHERE phone = $1', [phone]) : null;
  if (!user || !user.active || !(await checkPin(pin, user.pin_hash))) fail(401, 'Wrong phone number or PIN');
  await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  req.session.userId = user.id;
  await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/pin', requireUser, ah(async (req, res) => {
  const { current, next: newPin } = req.body;
  if (!(await checkPin(String(current || ''), req.user.pin_hash))) fail(400, 'Your current PIN is wrong');
  if (!validPin(newPin)) fail(400, 'The new PIN must be 4 to 6 digits');
  await db.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [await hashPin(newPin), req.user.id]);
  res.json({ ok: true });
}));

// Creates the first manager from env vars when there is none (first deploy).
async function bootstrapManager(log = console.log) {
  const { name, phone, pin } = config.bootstrapManager;
  if (!name || !phone || !pin) return;
  const existing = await db.one("SELECT id FROM users WHERE role = 'manager' LIMIT 1");
  if (existing) return;
  const normalized = normalizePhone(phone);
  if (!normalized || !validPin(pin)) {
    log('BOOTSTRAP_MANAGER_* ignored: phone or PIN is not valid');
    return;
  }
  await db.query(
    `INSERT INTO users (name, phone, pin_hash, role) VALUES ($1, $2, $3, 'manager')
     ON CONFLICT (phone) DO UPDATE SET role = 'manager', active = TRUE`,
    [name, normalized, await hashPin(pin)],
  );
  log(`Created manager ${name}`);
}

module.exports = { router, requireUser, requireManager, publicUser, bootstrapManager };
