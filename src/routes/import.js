// Imports the old "Lefori Field Leads Tracker" workbook: the Leads tab and the Visit log tab.
// POST without ?commit=1 is a dry run that reports what would happen.
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../db');
const { ah, fail } = require('../http');
const { normalizePhone } = require('../phone');
const { STAGES, INTEREST, LOST_REASONS } = require('../lists');
const { requireManager } = require('./auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const LEAD_HEADERS = {
  'lead id': 'oldRef',
  'date first visited': 'firstVisitOn',
  agent: 'agent',
  'business name': 'businessName',
  'business type': 'businessType',
  'owner / contact': 'ownerName',
  'phone / whatsapp': 'phone',
  'town / area': 'area',
  'landmark / directions': 'landmark',
  'tracks stock now': 'tracksStockNow',
  interest: 'interest',
  stage: 'stage',
  'demo done?': 'demoDone',
  'last contact': 'lastContactOn',
  'next follow-up': 'nextFollowUpOn',
  'expected ugx per month': 'expectedUgx',
  'lost reason': 'lostReason',
  notes: 'notes',
};
const VISIT_HEADERS = {
  date: 'happenedOn',
  agent: 'agent',
  'lead id': 'oldRef',
  'business name': 'businessName',
  'visit or call?': 'kind',
  'what happened': 'whatHappened',
  'outcome / next step': 'nextStep',
};
const EXAMPLE_NAME = /overwrite me/i;

// Plain value of a cell: formula results, rich text and hyperlinks flattened.
function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((p) => p.text).join('');
    if ('text' in v) return cellValue(v.text);
    if ('error' in v) return null;
    return null;
  }
  return v;
}

const text = (v) => {
  const x = cellValue(v);
  if (x === null) return null;
  const s = (x instanceof Date ? x.toISOString().slice(0, 10) : String(x)).trim();
  return s || null;
};

function dateOf(v) {
  const x = cellValue(v);
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
  if (typeof x === 'number' && x > 30000 && x < 80000) return new Date(Date.UTC(1899, 11, 30) + x * 86400000).toISOString().slice(0, 10);
  if (typeof x === 'string') {
    let m = x.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = x.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // day first, as in Uganda
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      const d = new Date(Date.UTC(+y, +m[2] - 1, +m[1]));
      if (d.getUTCDate() === +m[1]) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

const byLabel = (list, value) => {
  const s = (text(value) || '').toLowerCase().replace(/^\d+\s*/, '');
  if (!s) return null;
  const hit = list.find((x) => x.label.toLowerCase() === s || x.key === s);
  return hit ? hit.key : undefined;
};

function readSheet(sheet, headers) {
  if (!sheet) return [];
  let headerRow = 0;
  let map = {};
  for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
    const found = {};
    sheet.getRow(r).eachCell((cell, col) => {
      const key = headers[String(text(cell.value) || '').toLowerCase()];
      if (key) found[key] = col;
    });
    if (Object.keys(found).length >= 3) { headerRow = r; map = found; break; }
  }
  if (!headerRow) return [];
  const rows = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const out = { _row: r };
    let any = false;
    for (const [key, col] of Object.entries(map)) {
      out[key] = row.getCell(col).value;
      if (key !== 'oldRef' && text(out[key])) any = true;
    }
    if (any) rows.push(out);
  }
  return rows;
}

async function plan(buffer, importer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    fail(400, 'That file could not be read. Upload the .xlsx tracker.');
  }
  const leadsSheet = wb.getWorksheet('Leads') || wb.worksheets.find((s) => readSheet(s, LEAD_HEADERS).length);
  const visitSheet = wb.getWorksheet('Visit log');
  const leadRows = readSheet(leadsSheet, LEAD_HEADERS);
  const visitRows = readSheet(visitSheet, VISIT_HEADERS);
  if (!leadRows.length) fail(400, 'No leads found. The file needs a "Leads" tab with a "Business name" column.');

  const users = await db.all('SELECT id, name FROM users WHERE active');
  const userByName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u.id]));
  const existingPhones = new Set((await db.all('SELECT phone FROM leads WHERE phone IS NOT NULL')).map((r) => r.phone));
  const seenPhones = new Set();
  const unmatchedAgents = new Set();
  const skipped = [];
  const warnings = [];
  const leads = [];

  const agentFor = (name, fallback) => {
    const n = text(name);
    if (!n) return fallback;
    const id = userByName.get(n.toLowerCase());
    if (id) return id;
    unmatchedAgents.add(n);
    return fallback;
  };

  for (const r of leadRows) {
    const name = text(r.businessName);
    if (!name) { skipped.push({ sheet: 'Leads', row: r._row, reason: 'No business name' }); continue; }
    if (EXAMPLE_NAME.test(name)) { skipped.push({ sheet: 'Leads', row: r._row, reason: 'Example row' }); continue; }
    const rawPhone = text(r.phone);
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    let notes = text(r.notes);
    if (rawPhone && !phone) {
      warnings.push({ sheet: 'Leads', row: r._row, message: `Phone "${rawPhone}" is not a valid number; kept in notes` });
      notes = [notes, `Phone as written: ${rawPhone}`].filter(Boolean).join('\n');
    }
    if (phone && (existingPhones.has(phone) || seenPhones.has(phone))) {
      skipped.push({ sheet: 'Leads', row: r._row, reason: `${name}: phone already on another lead` });
      continue;
    }
    if (phone) seenPhones.add(phone);
    let stage = byLabel(STAGES, r.stage);
    if (stage === undefined) { warnings.push({ sheet: 'Leads', row: r._row, message: `Unknown stage "${text(r.stage)}", set to New` }); stage = null; }
    let interest = byLabel(INTEREST, r.interest);
    if (interest === undefined) interest = null;
    let lostReason = text(r.lostReason);
    if (stage === 'lost' && !lostReason) lostReason = 'Other';
    if (lostReason && !LOST_REASONS.includes(lostReason)) lostReason = 'Other';
    const expected = Number(cellValue(r.expectedUgx));
    leads.push({
      oldRef: text(r.oldRef),
      row: r._row,
      business_name: name.slice(0, 120),
      business_type: text(r.businessType),
      owner_name: text(r.ownerName),
      phone,
      area: text(r.area),
      landmark: text(r.landmark),
      tracks_stock_now: text(r.tracksStockNow),
      interest,
      stage: stage || 'new',
      demo_done: /^y/i.test(text(r.demoDone) || '') || ['demo', 'trial', 'paying'].includes(stage),
      expected_ugx: Number.isFinite(expected) && expected >= 0 ? Math.round(expected) : null,
      lost_reason: stage === 'lost' ? lostReason : null,
      notes,
      agent_id: agentFor(r.agent, importer.id),
      first_visit_on: dateOf(r.firstVisitOn),
      last_contact_on: dateOf(r.lastContactOn),
      next_follow_up_on: dateOf(r.nextFollowUpOn),
    });
  }

  const leadByOldRef = new Map(leads.filter((l) => l.oldRef).map((l) => [l.oldRef.toUpperCase(), l]));
  const leadByName = new Map(leads.map((l) => [l.business_name.toLowerCase(), l]));
  const visits = [];
  for (const r of visitRows) {
    const ref = (text(r.oldRef) || '').toUpperCase();
    const lead = leadByOldRef.get(ref) || leadByName.get((text(r.businessName) || '').toLowerCase());
    if (!lead) {
      if (!EXAMPLE_NAME.test(text(r.businessName) || '')) skipped.push({ sheet: 'Visit log', row: r._row, reason: 'Lead not found in this file' });
      continue;
    }
    const kind = { visit: 'visit', call: 'call', whatsapp: 'whatsapp' }[(text(r.kind) || 'visit').toLowerCase()] || 'visit';
    visits.push({
      lead,
      agent_id: agentFor(r.agent, lead.agent_id),
      kind,
      happened_on: dateOf(r.happenedOn),
      what_happened: text(r.whatHappened),
      next_step: text(r.nextStep),
    });
  }
  return { leads, visits, skipped, warnings, unmatchedAgents: [...unmatchedAgents] };
}

router.post('/', requireManager, upload.single('file'), ah(async (req, res) => {
  if (!req.file) fail(400, 'Choose the .xlsx file to import');
  const p = await plan(req.file.buffer, req.user);
  const commit = req.query.commit === '1';
  if (commit) {
    await db.tx(async (c) => {
      for (const l of p.leads) {
        const cols = ['business_name', 'business_type', 'owner_name', 'phone', 'area', 'landmark', 'tracks_stock_now', 'interest',
          'stage', 'demo_done', 'expected_ugx', 'lost_reason', 'notes', 'agent_id', 'last_contact_on', 'next_follow_up_on'];
        const vals = cols.map((k) => l[k]);
        const row = (await c.query(
          `INSERT INTO leads (${cols.join(', ')}, first_visit_on, created_by)
           VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, COALESCE($${cols.length + 1}::date, CURRENT_DATE), $${cols.length + 2})
           RETURNING id`,
          [...vals, l.first_visit_on, req.user.id],
        )).rows[0];
        l.id = row.id;
      }
      for (const v of p.visits) {
        await c.query(
          `INSERT INTO visits (lead_id, agent_id, kind, happened_on, what_happened, next_step)
           VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)`,
          [v.lead.id, v.agent_id, v.kind, v.happened_on, v.what_happened, v.next_step],
        );
      }
      // Last contact is at least the latest logged visit.
      await c.query(`UPDATE leads l SET last_contact_on = GREATEST(COALESCE(l.last_contact_on, x.d), x.d)
        FROM (SELECT lead_id, MAX(happened_on) AS d FROM visits GROUP BY lead_id) x
        WHERE x.lead_id = l.id AND l.id = ANY($1)`, [p.leads.map((l) => l.id)]);
      await c.query('UPDATE leads SET last_contact_on = first_visit_on WHERE last_contact_on IS NULL AND id = ANY($1)', [p.leads.map((l) => l.id)]);
    });
  }
  res.json({
    committed: commit,
    leads: p.leads.length,
    visits: p.visits.length,
    skipped: p.skipped,
    warnings: p.warnings,
    unmatchedAgents: p.unmatchedAgents,
  });
}));

module.exports = { router };
