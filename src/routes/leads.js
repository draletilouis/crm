const express = require('express');
const db = require('../db');
const { ah, fail, str, isDate, intId } = require('../http');
const { normalizePhone, formatPhone } = require('../phone');
const { STAGES, INTEREST, BUSINESS_TYPES, TRACKS_STOCK, LOST_REASONS, VISIT_KINDS } = require('../lists');
const { requireManager } = require('./auth');

const router = express.Router();

const STAGE_KEYS = STAGES.map((s) => s.key);
const INTEREST_KEYS = INTEREST.map((s) => s.key);
const KIND_KEYS = VISIT_KINDS.map((k) => k.key);
const AFTER_DEMO = ['demo', 'trial', 'paying'];

const SELECT = `
  SELECT l.*, u.name AS agent_name,
    CASE WHEN l.stage IN ('paying', 'lost') OR l.next_follow_up_on IS NULL THEN NULL
         WHEN l.next_follow_up_on < CURRENT_DATE THEN 'overdue'
         WHEN l.next_follow_up_on = CURRENT_DATE THEN 'today' END AS follow_up_flag,
    CASE WHEN l.stage IN ('paying', 'lost') THEN NULL ELSE CURRENT_DATE - l.first_visit_on END AS days_in_pipeline,
    (SELECT COUNT(*) FROM visits v WHERE v.lead_id = l.id) AS visit_count
  FROM leads l JOIN users u ON u.id = l.agent_id`;

const toLead = (r) => ({
  id: r.id,
  ref: r.ref,
  businessName: r.business_name,
  businessType: r.business_type,
  ownerName: r.owner_name,
  phone: formatPhone(r.phone),
  phoneE164: r.phone,
  area: r.area,
  landmark: r.landmark,
  tracksStockNow: r.tracks_stock_now,
  interest: r.interest,
  stage: r.stage,
  demoDone: r.demo_done,
  expectedUgx: r.expected_ugx,
  lostReason: r.lost_reason,
  notes: r.notes,
  agentId: r.agent_id,
  agentName: r.agent_name,
  firstVisitOn: r.first_visit_on,
  lastContactOn: r.last_contact_on,
  nextFollowUpOn: r.next_follow_up_on,
  followUpFlag: r.follow_up_flag,
  daysInPipeline: r.days_in_pipeline,
  visitCount: r.visit_count,
  updatedAt: r.updated_at,
});

const toVisit = (v) => ({
  id: v.id,
  leadId: v.lead_id,
  agentId: v.agent_id,
  agentName: v.agent_name,
  kind: v.kind,
  happenedOn: v.happened_on,
  whatHappened: v.what_happened,
  nextStep: v.next_step,
  createdAt: v.created_at,
});

// Agents only ever see their own leads; managers see everyone's.
function scope(req, params, alias = 'l') {
  if (req.isManager) return 'TRUE';
  params.push(req.user.id);
  return `${alias}.agent_id = $${params.length}`;
}

async function loadLead(req, id) {
  const params = [id];
  const lead = await db.one(`${SELECT} WHERE l.id = $1 AND ${scope(req, params)}`, params);
  return lead || fail(404, 'Lead not found');
}

async function findByPhone(phone, exceptId = 0) {
  return db.one(
    `SELECT l.id, l.ref, l.business_name, l.agent_id, u.name AS agent_name
     FROM leads l JOIN users u ON u.id = l.agent_id WHERE l.phone = $1 AND l.id <> $2`,
    [phone, exceptId],
  );
}

function duplicateInfo(req, dup) {
  const mine = req.isManager || dup.agent_id === req.user.id;
  return {
    ref: dup.ref,
    businessName: dup.business_name,
    agentName: dup.agent_name,
    id: mine ? dup.id : undefined,
  };
}

const pick = (value, allowed, label) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return allowed.includes(value) ? value : fail(400, `Unknown ${label}`);
};

const dateOrNull = (value, label) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return isDate(value) ? value : fail(400, `${label} must be a date`);
};

// Turns a request body into column values. Undefined means "not sent, leave it alone".
function readFields(body) {
  const f = {};
  if (body.businessName !== undefined) f.business_name = str(body.businessName, 120) || fail(400, 'Enter the business name');
  if (body.businessType !== undefined) f.business_type = str(body.businessType, 60);
  if (body.ownerName !== undefined) f.owner_name = str(body.ownerName, 80);
  if (body.phone !== undefined) {
    f.phone = str(body.phone) ? (normalizePhone(body.phone) || fail(400, 'Enter a valid phone number, like 0772 123 456')) : null;
  }
  if (body.area !== undefined) f.area = str(body.area, 80);
  if (body.landmark !== undefined) f.landmark = str(body.landmark, 200);
  if (body.tracksStockNow !== undefined) f.tracks_stock_now = str(body.tracksStockNow, 40);
  f.interest = pick(body.interest, INTEREST_KEYS, 'interest');
  if (body.stage !== undefined) f.stage = pick(body.stage, STAGE_KEYS, 'stage') || fail(400, 'Pick a stage');
  if (body.demoDone !== undefined) f.demo_done = !!body.demoDone;
  if (body.expectedUgx !== undefined) {
    if (body.expectedUgx === null || body.expectedUgx === '') f.expected_ugx = null;
    else {
      const n = Number(String(body.expectedUgx).replace(/[,\s]/g, ''));
      f.expected_ugx = Number.isInteger(n) && n >= 0 && n < 1e9 ? n : fail(400, 'Expected UGX must be a whole number');
    }
  }
  if (body.lostReason !== undefined) f.lost_reason = str(body.lostReason, 60);
  if (body.notes !== undefined) f.notes = str(body.notes, 2000);
  f.first_visit_on = dateOrNull(body.firstVisitOn, 'First visit');
  f.last_contact_on = dateOrNull(body.lastContactOn, 'Last contact');
  f.next_follow_up_on = dateOrNull(body.nextFollowUpOn, 'Next follow-up');
  if (f.first_visit_on === null) delete f.first_visit_on;
  for (const k of Object.keys(f)) if (f[k] === undefined) delete f[k];
  return f;
}

function applyRules(f, before = {}) {
  const stage = f.stage || before.stage || 'new';
  if (stage === 'lost' && !(f.lost_reason !== undefined ? f.lost_reason : before.lost_reason)) fail(400, 'Pick why the lead was lost');
  if (stage !== 'lost' && f.stage) f.lost_reason = null;
  if (AFTER_DEMO.includes(stage) && f.stage) f.demo_done = true;
  return f;
}

async function resolveAgent(req, agentId) {
  if (agentId === undefined || agentId === null || agentId === '') return undefined;
  if (!req.isManager) {
    if (Number(agentId) !== req.user.id) fail(403, 'Only a manager can give a lead to another agent');
    return req.user.id;
  }
  const agent = await db.one('SELECT id FROM users WHERE id = $1 AND active', [Number(agentId)]);
  return agent ? agent.id : fail(400, 'That agent is not on the team');
}

const uniqueViolation = (err) => err && err.code === '23505' && /leads_phone_unique/.test(err.constraint || err.message);

// ---------- Lists

router.get('/', ah(async (req, res) => {
  const params = [];
  const where = [scope(req, params)];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };

  if (req.query.stage === 'open') where.push("l.stage NOT IN ('paying', 'lost')");
  else if (STAGE_KEYS.includes(req.query.stage)) add('l.stage = ?', req.query.stage);
  if (INTEREST_KEYS.includes(req.query.interest)) add('l.interest = ?', req.query.interest);
  if (req.isManager && Number(req.query.agent) > 0) add('l.agent_id = ?', Number(req.query.agent));
  if (req.query.due === 'overdue') where.push("l.stage NOT IN ('paying', 'lost') AND l.next_follow_up_on < CURRENT_DATE");
  if (req.query.due === 'today') where.push("l.stage NOT IN ('paying', 'lost') AND l.next_follow_up_on = CURRENT_DATE");
  if (req.query.due === 'none') where.push("l.stage NOT IN ('paying', 'lost') AND l.next_follow_up_on IS NULL");
  const q = str(req.query.q, 80);
  if (q) {
    const digits = q.replace(/\D/g, '');
    params.push(`%${q.toLowerCase()}%`);
    const p = `$${params.length}`;
    let phoneSql = '';
    if (digits.length >= 4) {
      params.push(`%${digits.replace(/^0/, '')}%`);
      phoneSql = ` OR l.phone LIKE $${params.length}`;
    }
    where.push(`(LOWER(l.business_name) LIKE ${p} OR LOWER(COALESCE(l.owner_name, '')) LIKE ${p}
      OR LOWER(COALESCE(l.area, '')) LIKE ${p} OR LOWER(l.ref) LIKE ${p}${phoneSql})`);
  }
  const order = {
    recent: 'l.updated_at DESC',
    name: 'LOWER(l.business_name)',
    followup: 'l.next_follow_up_on NULLS LAST, LOWER(l.business_name)',
  }[req.query.sort] || 'l.updated_at DESC';

  const rows = await db.all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 500`, params);
  res.json({ leads: rows.map(toLead) });
}));

// The agent's day: overdue first, then today, plus hot leads with no follow-up set.
router.get('/today', ah(async (req, res) => {
  const params = [];
  let s = scope(req, params);
  if (req.isManager && Number(req.query.agent) > 0) {
    params.push(Number(req.query.agent));
    s = `l.agent_id = $${params.length}`;
  }
  const open = `${s} AND l.stage NOT IN ('paying', 'lost')`;
  const [overdue, today, hotNoDate, upcoming, visitsToday] = await Promise.all([
    db.all(`${SELECT} WHERE ${open} AND l.next_follow_up_on < CURRENT_DATE ORDER BY l.next_follow_up_on, l.interest`, params),
    db.all(`${SELECT} WHERE ${open} AND l.next_follow_up_on = CURRENT_DATE ORDER BY l.interest, LOWER(l.business_name)`, params),
    db.all(`${SELECT} WHERE ${open} AND l.next_follow_up_on IS NULL AND l.interest IN ('hot', 'warm') ORDER BY l.interest, l.updated_at DESC LIMIT 20`, params),
    db.one(`SELECT COUNT(*) AS n FROM leads l WHERE ${open} AND l.next_follow_up_on > CURRENT_DATE AND l.next_follow_up_on <= CURRENT_DATE + 7`, params),
    db.one(`SELECT COUNT(*) AS n FROM visits v JOIN leads l ON l.id = v.lead_id WHERE ${s.replace(/l\.agent_id/g, 'v.agent_id')} AND v.happened_on = CURRENT_DATE`, params),
  ]);
  res.json({
    overdue: overdue.map(toLead),
    today: today.map(toLead),
    noFollowUp: hotNoDate.map(toLead),
    upcomingThisWeek: upcoming.n,
    contactsToday: visitsToday.n,
  });
}));

// Live duplicate check while an agent types a phone number.
router.get('/check-phone', ah(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone) return res.json({ valid: false, duplicate: null });
  const dup = await findByPhone(phone, Number(req.query.except) || 0);
  res.json({ valid: true, duplicate: dup ? duplicateInfo(req, dup) : null });
}));

// ---------- One lead

router.post('/', ah(async (req, res) => {
  const f = applyRules(readFields(req.body));
  if (!f.business_name) fail(400, 'Enter the business name');
  f.agent_id = (await resolveAgent(req, req.body.agentId)) || req.user.id;
  f.created_by = req.user.id;
  if (!f.last_contact_on) delete f.last_contact_on;
  if (f.phone) {
    const dup = await findByPhone(f.phone);
    if (dup) fail(409, `This number is already on ${dup.business_name} (${dup.ref}), logged by ${dup.agent_name}`, { duplicate: duplicateInfo(req, dup) });
  }
  const cols = Object.keys(f);
  let row;
  try {
    row = await db.one(
      `INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      cols.map((c) => f[c]),
    );
  } catch (err) {
    if (uniqueViolation(err)) fail(409, 'This phone number is already on another lead');
    throw err;
  }
  if (!f.last_contact_on) await db.query('UPDATE leads SET last_contact_on = first_visit_on WHERE id = $1', [row.id]);
  res.status(201).json({ lead: toLead(await loadLead(req, row.id)) });
}));

router.get('/:id', ah(async (req, res) => {
  const lead = await loadLead(req, intId(req.params.id));
  const visits = await db.all(
    `SELECT v.*, u.name AS agent_name FROM visits v JOIN users u ON u.id = v.agent_id
     WHERE v.lead_id = $1 ORDER BY v.happened_on DESC, v.id DESC`,
    [lead.id],
  );
  res.json({ lead: toLead(lead), visits: visits.map(toVisit) });
}));

router.patch('/:id', ah(async (req, res) => {
  const before = await loadLead(req, intId(req.params.id));
  const f = applyRules(readFields(req.body), before);
  const agentId = await resolveAgent(req, req.body.agentId);
  if (agentId) f.agent_id = agentId;
  if (f.phone) {
    const dup = await findByPhone(f.phone, before.id);
    if (dup) fail(409, `This number is already on ${dup.business_name} (${dup.ref}), logged by ${dup.agent_name}`, { duplicate: duplicateInfo(req, dup) });
  }
  const cols = Object.keys(f);
  if (cols.length) {
    const sets = cols.map((c, i) => `${c} = $${i + 2}`);
    if (f.stage && f.stage !== before.stage) sets.push('stage_changed_at = NOW()');
    try {
      await db.query(`UPDATE leads SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, [before.id, ...cols.map((c) => f[c])]);
    } catch (err) {
      if (uniqueViolation(err)) fail(409, 'This phone number is already on another lead');
      throw err;
    }
  }
  res.json({ lead: toLead(await loadLead(req, before.id)) });
}));

// Lost leads stay (so nobody visits them twice); deleting is for mistakes and duplicates.
router.delete('/:id', requireManager, ah(async (req, res) => {
  const lead = await loadLead(req, intId(req.params.id));
  await db.query('DELETE FROM leads WHERE id = $1', [lead.id]);
  res.json({ ok: true });
}));

// ---------- Visits and calls

router.post('/:id/visits', ah(async (req, res) => {
  const lead = await loadLead(req, intId(req.params.id));
  const kind = KIND_KEYS.includes(req.body.kind) ? req.body.kind : fail(400, 'Pick visit, call or WhatsApp');
  const happenedOn = req.body.happenedOn ? (isDate(req.body.happenedOn) ? req.body.happenedOn : fail(400, 'Date must be a date')) : null;
  const whatHappened = str(req.body.whatHappened, 2000);
  const nextStep = str(req.body.nextStep, 500);

  // The visit form can also move the lead on: stage, interest and next follow-up in the same step.
  // Empty means "leave as it is".
  const opt = (v) => (v === '' || v === null ? undefined : v);
  const f = applyRules(readFields({
    stage: opt(req.body.stage),
    interest: opt(req.body.interest),
    nextFollowUpOn: opt(req.body.nextFollowUpOn),
    lostReason: opt(req.body.lostReason),
  }), lead);

  await db.tx(async (c) => {
    const v = (await c.query(
      `INSERT INTO visits (lead_id, agent_id, kind, happened_on, what_happened, next_step)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6) RETURNING happened_on`,
      [lead.id, req.user.id, kind, happenedOn, whatHappened, nextStep],
    )).rows[0];
    const cols = Object.keys(f);
    const sets = cols.map((col, i) => `${col} = $${i + 3}`);
    if (f.stage && f.stage !== lead.stage) sets.push('stage_changed_at = NOW()');
    sets.push('last_contact_on = GREATEST(COALESCE(last_contact_on, $2::date), $2::date)', 'updated_at = NOW()');
    await c.query(`UPDATE leads SET ${sets.join(', ')} WHERE id = $1`, [lead.id, v.happened_on, ...cols.map((col) => f[col])]);
  });
  res.status(201).json({ lead: toLead(await loadLead(req, lead.id)) });
}));

router.delete('/:id/visits/:visitId', ah(async (req, res) => {
  const lead = await loadLead(req, intId(req.params.id));
  const visit = await db.one('SELECT * FROM visits WHERE id = $1 AND lead_id = $2', [intId(req.params.visitId), lead.id]) || fail(404, 'Not found');
  if (!req.isManager && visit.agent_id !== req.user.id) fail(403, 'You can only remove your own visits');
  await db.query('DELETE FROM visits WHERE id = $1', [visit.id]);
  res.json({ ok: true });
}));

module.exports = { router, toLead, BUSINESS_TYPES, TRACKS_STOCK, LOST_REASONS };
