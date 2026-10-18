const express = require('express');
const db = require('../db');
const { ah, fail, str, intId } = require('../http');
const { normalizePhone } = require('../phone');
const { validPin, hashPin } = require('../pin');
const { requireManager, publicUser } = require('./auth');

const router = express.Router();

// Everyone can list team members (to filter and show names); only managers change them.
router.get('/', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT u.*, COUNT(l.id) FILTER (WHERE l.stage NOT IN ('paying', 'lost')) AS open_leads
    FROM users u LEFT JOIN leads l ON l.agent_id = u.id
    GROUP BY u.id ORDER BY u.active DESC, u.role DESC, u.name`);
  res.json({
    users: rows.map((u) => ({
      ...publicUser(u),
      openLeads: u.open_leads,
      lastLoginAt: req.isManager ? u.last_login_at : undefined,
    })),
  });
}));

router.post('/', requireManager, ah(async (req, res) => {
  const name = str(req.body.name, 80) || fail(400, 'Enter a name');
  const phone = normalizePhone(req.body.phone) || fail(400, 'Enter a valid phone number, like 0772 123 456');
  const pin = validPin(req.body.pin) ? req.body.pin : fail(400, 'The PIN must be 4 to 6 digits');
  const role = req.body.role === 'manager' ? 'manager' : 'agent';
  const taken = await db.one('SELECT id FROM users WHERE phone = $1', [phone]);
  if (taken) fail(409, 'Someone on the team already uses that phone number');
  const user = await db.one(
    'INSERT INTO users (name, phone, pin_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, phone, await hashPin(pin), role],
  );
  res.status(201).json({ user: publicUser(user) });
}));

router.patch('/:id', requireManager, ah(async (req, res) => {
  const id = intId(req.params.id);
  const user = await db.one('SELECT * FROM users WHERE id = $1', [id]) || fail(404, 'Not found');
  const next = { name: user.name, role: user.role, active: user.active, pin_hash: user.pin_hash };
  if (req.body.name !== undefined) next.name = str(req.body.name, 80) || fail(400, 'Enter a name');
  if (req.body.role !== undefined) next.role = req.body.role === 'manager' ? 'manager' : 'agent';
  if (req.body.active !== undefined) next.active = !!req.body.active;
  if (req.body.pin !== undefined) next.pin_hash = validPin(req.body.pin) ? await hashPin(req.body.pin) : fail(400, 'The PIN must be 4 to 6 digits');

  if (id === req.user.id && (!next.active || next.role !== 'manager')) fail(400, 'You cannot remove your own manager access');
  if (user.role === 'manager' && (next.role !== 'manager' || !next.active)) {
    const others = await db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'manager' AND active AND id <> $1", [id]);
    if (others.n === 0) fail(400, 'The team needs at least one manager');
  }
  const updated = await db.one(
    'UPDATE users SET name = $1, role = $2, active = $3, pin_hash = $4 WHERE id = $5 RETURNING *',
    [next.name, next.role, next.active, next.pin_hash, id],
  );
  res.json({ user: publicUser(updated) });
}));

module.exports = { router };
