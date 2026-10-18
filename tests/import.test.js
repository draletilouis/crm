const ExcelJS = require('exceljs');
const { setup, loginAs, db } = require('./helpers');

let ctx; let boss;
beforeAll(async () => {
  ctx = await setup();
  boss = await loginAs(ctx.app, '0700000001');
});
afterAll(() => db.pool.end());

// Same layout as sales/build-tracker.js: title rows, headers on row 3, data from row 4.
async function trackerFile() {
  const wb = new ExcelJS.Workbook();
  const leads = wb.addWorksheet('Leads');
  leads.getCell('A1').value = 'Leads';
  leads.getRow(3).values = ['Lead ID', 'Date first visited', 'Agent', 'Business name', 'Business type', 'Owner / contact',
    'Phone / WhatsApp', 'Town / area', 'Landmark / directions', 'Tracks stock now', 'Interest', 'Stage', 'Demo done?',
    'Last contact', 'Next follow-up', 'Follow-up flag', 'Days in pipeline', 'Expected UGX per month', 'Lost reason', 'Notes'];
  const d = (s) => new Date(`${s}T00:00:00Z`);
  const rows = [
    ['L-001', d('2026-09-29'), 'Agent 1', 'Example Traders (overwrite me)', 'Retail shop', 'Sarah N.', '0700 000 000'],
    ['L-002', d('2026-10-01'), 'Amos Agent', 'Mukasa Wholesale', 'Wholesale', 'John Mukasa', '0772 555 111', 'Owino', 'Gate 3',
      'Notebook', 'Hot', '3 Demo done', 'Yes', d('2026-10-05'), d('2026-10-20'), 'OVERDUE', 17, 80000, null, 'Wants WhatsApp reports'],
    ['L-003', '02/10/2026', 'Somebody Else', 'Kato Pharmacy', 'Pharmacy', 'Kato', '772555222', 'Ntinda', null,
      'Excel', 'Warm', '2 Contacted', 'No', null, null, null, null, null, null, null],
    ['L-004', d('2026-10-02'), 'Amos Agent', 'Closed Shop', 'Retail shop', null, 'not a phone', null, null,
      null, 'Cold', '6 Lost', 'No', null, null, null, null, null, 'Too expensive', null],
    ['L-005', d('2026-10-03'), 'Amos Agent', 'Same Number Shop', null, null, '+256 772 555 111'],
    ['L-006', null, null, null],
  ];
  rows.forEach((r, i) => { leads.getRow(4 + i).values = r; });
  // A formula cell, as the real tracker has.
  leads.getCell('A9').value = { formula: 'IF(D9="","","L-006")', result: '' };

  const visits = wb.addWorksheet('Visit log');
  visits.getRow(3).values = ['Date', 'Agent', 'Lead ID', 'Business name', 'Visit or call?', 'What happened', 'Outcome / next step'];
  visits.getRow(4).values = [d('2026-10-01'), 'Amos Agent', 'L-002', 'Mukasa Wholesale', 'Visit', 'Showed stock screens', 'Call Monday'];
  visits.getRow(5).values = [d('2026-10-07'), 'Amos Agent', 'L-002', 'Mukasa Wholesale', 'Call', 'Asked about price', null];
  visits.getRow(6).values = [d('2026-10-02'), 'Amos Agent', 'L-099', 'Nobody', 'Visit', 'x', null];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('importing the old spreadsheet', () => {
  test('only managers can import', async () => {
    const amos = await loginAs(ctx.app, '0700000002');
    const res = await amos.raw.post('/api/import').set('X-Requested-With', 'lefori-sales').attach('file', await trackerFile(), 'tracker.xlsx');
    expect(res.status).toBe(403);
  });

  test('a dry run reports what will happen and saves nothing', async () => {
    const res = await boss.raw.post('/api/import').set('X-Requested-With', 'lefori-sales').attach('file', await trackerFile(), 'tracker.xlsx');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ committed: false, leads: 3, visits: 2, unmatchedAgents: ['Somebody Else'] });
    const reasons = res.body.skipped.map((s) => s.reason).join(' | ');
    expect(reasons).toMatch(/Example row/);
    expect(reasons).toMatch(/Same Number Shop: phone already on another lead/);
    expect(reasons).toMatch(/Lead not found/);
    expect(res.body.warnings.map((w) => w.message).join()).toMatch(/not a phone/);
    expect((await db.one('SELECT COUNT(*) AS n FROM leads')).n).toBe(0);
  });

  test('commit saves leads with their stage, agent, dates and visits', async () => {
    const res = await boss.raw.post('/api/import?commit=1').set('X-Requested-With', 'lefori-sales').attach('file', await trackerFile(), 'tracker.xlsx');
    expect(res.body).toMatchObject({ committed: true, leads: 3, visits: 2 });
    const mukasa = await db.one("SELECT l.*, u.name AS agent FROM leads l JOIN users u ON u.id = l.agent_id WHERE business_name = 'Mukasa Wholesale'");
    expect(mukasa).toMatchObject({
      agent: 'Amos Agent', phone: '256772555111', stage: 'demo', interest: 'hot', demo_done: true, expected_ugx: 80000,
      first_visit_on: '2026-10-01', next_follow_up_on: '2026-10-20', last_contact_on: '2026-10-07', area: 'Owino', landmark: 'Gate 3',
    });
    const kato = await db.one("SELECT l.*, u.name AS agent FROM leads l JOIN users u ON u.id = l.agent_id WHERE business_name = 'Kato Pharmacy'");
    expect(kato).toMatchObject({ agent: 'Grace Manager', phone: '256772555222', stage: 'contacted', first_visit_on: '2026-10-02', last_contact_on: '2026-10-02' });
    const lost = await db.one("SELECT * FROM leads WHERE business_name = 'Closed Shop'");
    expect(lost).toMatchObject({ stage: 'lost', lost_reason: 'Too expensive', phone: null });
    expect(lost.notes).toMatch(/Phone as written: not a phone/);
    expect((await db.one('SELECT COUNT(*) AS n FROM visits WHERE lead_id = $1', [mukasa.id])).n).toBe(2);
  });

  test('importing the same file again adds no duplicate phones', async () => {
    const res = await boss.raw.post('/api/import').set('X-Requested-With', 'lefori-sales').attach('file', await trackerFile(), 'tracker.xlsx');
    expect(res.body.leads).toBe(1); // only the lead with no valid phone
  });

  test('a file that is not a spreadsheet is refused', async () => {
    const res = await boss.raw.post('/api/import').set('X-Requested-With', 'lefori-sales').attach('file', Buffer.from('hello'), 'x.xlsx');
    expect(res.status).toBe(400);
  });
});
