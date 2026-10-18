const express = require('express');
const db = require('../db');
const config = require('../config');
const { ah } = require('../http');
const lists = require('../lists');

const router = express.Router();

router.get('/meta', (req, res) => {
  res.json({
    stages: lists.STAGES,
    interest: lists.INTEREST,
    businessTypes: lists.BUSINESS_TYPES,
    tracksStock: lists.TRACKS_STOCK,
    lostReasons: lists.LOST_REASONS,
    visitKinds: lists.VISIT_KINDS,
    demoUrl: config.demoUrl,
  });
});

router.get('/dashboard', ah(async (req, res) => {
  // Agents see their own numbers; a manager sees the team or one agent.
  const params = [];
  let where = 'TRUE';
  if (!req.isManager) { params.push(req.user.id); where = 'l.agent_id = $1'; }
  else if (Number(req.query.agent) > 0) { params.push(Number(req.query.agent)); where = 'l.agent_id = $1'; }
  const visitWhere = where.replace('l.agent_id', 'v.agent_id');
  const open = "l.stage NOT IN ('paying', 'lost')";

  const [pipeline, key, lost, byAgent, weeks] = await Promise.all([
    db.all(`SELECT stage, COUNT(*) AS n FROM leads l WHERE ${where} GROUP BY stage`, params),
    db.one(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ${open} AND l.next_follow_up_on < CURRENT_DATE) AS overdue,
        COUNT(*) FILTER (WHERE ${open} AND l.next_follow_up_on = CURRENT_DATE) AS due_today,
        COUNT(*) FILTER (WHERE ${open} AND l.interest = 'hot') AS hot_open,
        COUNT(*) FILTER (WHERE l.stage = 'paying') AS paying,
        COALESCE(SUM(l.expected_ugx) FILTER (WHERE ${open} AND l.interest IN ('hot', 'warm')), 0) AS expected_ugx_open,
        COALESCE(SUM(l.expected_ugx) FILTER (WHERE l.stage = 'paying'), 0) AS paying_ugx,
        COUNT(*) FILTER (WHERE l.first_visit_on >= date_trunc('month', CURRENT_DATE)) AS new_this_month,
        (SELECT COUNT(*) FROM visits v WHERE ${visitWhere} AND v.happened_on > CURRENT_DATE - 7) AS contacts_7d
      FROM leads l WHERE ${where}`, params),
    db.all(`SELECT lost_reason AS reason, COUNT(*) AS n FROM leads l
      WHERE ${where} AND l.stage = 'lost' GROUP BY lost_reason ORDER BY n DESC`, params),
    req.isManager ? db.all(`
      SELECT u.id, u.name, u.active,
        COUNT(l.id) AS leads,
        COUNT(l.id) FILTER (WHERE l.stage IN ('demo', 'trial', 'paying')) AS demos,
        COUNT(l.id) FILTER (WHERE l.stage IN ('trial', 'paying')) AS trials,
        COUNT(l.id) FILTER (WHERE l.stage = 'paying') AS paying,
        COUNT(l.id) FILTER (WHERE l.stage = 'lost') AS lost,
        COUNT(l.id) FILTER (WHERE ${open} AND l.next_follow_up_on < CURRENT_DATE) AS overdue,
        (SELECT COUNT(*) FROM visits v WHERE v.agent_id = u.id AND v.happened_on > CURRENT_DATE - 7) AS contacts_7d
      FROM users u LEFT JOIN leads l ON l.agent_id = u.id
      GROUP BY u.id HAVING u.active OR COUNT(l.id) > 0
      ORDER BY paying DESC, trials DESC, u.name`) : [],
    // Contacts and new leads per week, last 8 weeks (Monday-start).
    db.all(`
      WITH w AS (SELECT generate_series(date_trunc('week', CURRENT_DATE) - INTERVAL '7 weeks', date_trunc('week', CURRENT_DATE), INTERVAL '1 week')::date AS wk)
      SELECT w.wk,
        (SELECT COUNT(*) FROM visits v WHERE ${visitWhere} AND v.happened_on >= w.wk AND v.happened_on < w.wk + 7) AS contacts,
        (SELECT COUNT(*) FROM leads l WHERE ${where} AND l.first_visit_on >= w.wk AND l.first_visit_on < w.wk + 7) AS new_leads
      FROM w ORDER BY w.wk`, params),
  ]);

  const counts = Object.fromEntries(pipeline.map((r) => [r.stage, r.n]));
  res.json({
    pipeline: lists.STAGES.map((s) => ({ stage: s.key, label: s.label, count: counts[s.key] || 0 })),
    key: {
      total: key.total,
      overdue: key.overdue,
      dueToday: key.due_today,
      hotOpen: key.hot_open,
      paying: key.paying,
      conversion: key.total ? key.paying / key.total : 0,
      expectedUgxOpen: key.expected_ugx_open,
      payingUgx: key.paying_ugx,
      newThisMonth: key.new_this_month,
      contacts7d: key.contacts_7d,
    },
    lostReasons: lost.map((r) => ({ reason: r.reason || 'Not given', count: r.n })),
    byAgent: byAgent.map((a) => ({
      id: a.id, name: a.name, active: a.active, leads: a.leads, demos: a.demos, trials: a.trials,
      paying: a.paying, lost: a.lost, overdue: a.overdue, contacts7d: a.contacts_7d,
    })),
    weeks: weeks.map((w) => ({ week: w.wk, contacts: w.contacts, newLeads: w.new_leads })),
  });
}));

module.exports = { router };
