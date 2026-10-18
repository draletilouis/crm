const { setup, loginAs, db } = require('./helpers');

let ctx; let amos; let bea; let boss;
beforeAll(async () => {
  ctx = await setup();
  amos = await loginAs(ctx.app, '0700000002');
  bea = await loginAs(ctx.app, '0700000003');
  boss = await loginAs(ctx.app, '0700000001');
});
afterAll(() => db.pool.end());

const dateIn = async (days) => (await db.one(`SELECT (CURRENT_DATE + $1::int)::text AS d`, [days])).d;

describe('adding leads', () => {
  test('an agent adds a lead; it is theirs, with a ref and today as last contact', async () => {
    const res = await amos.post('/api/leads', {
      businessName: 'Nakato Hardware', ownerName: 'Sarah Nakato', phone: '0772 123 456', interest: 'hot',
      businessType: 'Hardware', area: 'Kawempe', expectedUgx: '50,000', nextFollowUpOn: await dateIn(2),
    });
    expect(res.status).toBe(201);
    expect(res.body.lead).toMatchObject({
      ref: 'L-001', businessName: 'Nakato Hardware', phone: '0772 123 456', phoneE164: '256772123456',
      stage: 'new', interest: 'hot', expectedUgx: 50000, agentName: 'Amos Agent',
    });
    expect(res.body.lead.lastContactOn).toBe(await dateIn(0));
  });

  test('the same phone in another format is a duplicate, and says who has it', async () => {
    const res = await bea.post('/api/leads', { businessName: 'Other name', phone: '+256772123456' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Nakato Hardware \(L-001\), logged by Amos Agent/);
    // Bea cannot open Amos's lead, so no id is given to her.
    expect(res.body.duplicate.id).toBeUndefined();
    const check = await bea.get('/api/leads/check-phone?phone=0772123456');
    expect(check.body.duplicate).toMatchObject({ ref: 'L-001', agentName: 'Amos Agent' });
  });

  test('business name is required and bad values are refused', async () => {
    expect((await amos.post('/api/leads', { phone: '0772000111' })).status).toBe(400);
    expect((await amos.post('/api/leads', { businessName: 'A', phone: '12' })).status).toBe(400);
    expect((await amos.post('/api/leads', { businessName: 'A', stage: 'won' })).status).toBe(400);
    expect((await amos.post('/api/leads', { businessName: 'A', interest: 'boiling' })).status).toBe(400);
    expect((await amos.post('/api/leads', { businessName: 'A', nextFollowUpOn: 'friday' })).status).toBe(400);
  });

  test('a lost lead needs a reason', async () => {
    expect((await amos.post('/api/leads', { businessName: 'Gone Ltd', stage: 'lost' })).status).toBe(400);
    const ok = await amos.post('/api/leads', { businessName: 'Gone Ltd', stage: 'lost', lostReason: 'Too expensive' });
    expect(ok.status).toBe(201);
    expect(ok.body.lead.followUpFlag).toBeNull();
  });

  test('an agent cannot give a lead to someone else; a manager can', async () => {
    expect((await amos.post('/api/leads', { businessName: 'X', agentId: ctx.bea.id })).status).toBe(403);
    const res = await boss.post('/api/leads', { businessName: 'For Bea', agentId: ctx.bea.id });
    expect(res.status).toBe(201);
    expect(res.body.lead.agentName).toBe('Bea Agent');
  });
});

describe('who sees what', () => {
  test('agents see only their own leads; managers see all', async () => {
    const mine = (await amos.get('/api/leads?stage=all')).body.leads.map((l) => l.agentName);
    expect(new Set(mine)).toEqual(new Set(['Amos Agent']));
    const all = (await boss.get('/api/leads')).body.leads.map((l) => l.agentName);
    expect(new Set(all)).toEqual(new Set(['Amos Agent', 'Bea Agent']));
    const lead = await db.one("SELECT id FROM leads WHERE business_name = 'Nakato Hardware'");
    expect((await bea.get(`/api/leads/${lead.id}`)).status).toBe(404);
    expect((await bea.patch(`/api/leads/${lead.id}`, { notes: 'mine now' })).status).toBe(404);
    expect((await boss.get(`/api/leads/${lead.id}`)).status).toBe(200);
  });

  test('search finds by name, area and phone digits', async () => {
    expect((await amos.get('/api/leads?q=nakato')).body.leads).toHaveLength(1);
    expect((await amos.get('/api/leads?q=kawempe')).body.leads).toHaveLength(1);
    expect((await amos.get('/api/leads?q=0772123')).body.leads).toHaveLength(1);
    expect((await amos.get('/api/leads?q=nothing-like-this')).body.leads).toHaveLength(0);
  });

  test('only managers delete leads', async () => {
    const lead = (await amos.post('/api/leads', { businessName: 'Typo Shop' })).body.lead;
    expect((await amos.del(`/api/leads/${lead.id}`)).status).toBe(403);
    expect((await boss.del(`/api/leads/${lead.id}`)).status).toBe(200);
    expect((await amos.get(`/api/leads/${lead.id}`)).status).toBe(404);
  });
});

describe('today and follow-ups', () => {
  test('late, due today and hot-without-a-date land in the right lists', async () => {
    const late = (await amos.post('/api/leads', { businessName: 'Late Shop', interest: 'warm', nextFollowUpOn: await dateIn(-3) })).body.lead;
    const due = (await amos.post('/api/leads', { businessName: 'Due Shop', nextFollowUpOn: await dateIn(0) })).body.lead;
    const noDate = (await amos.post('/api/leads', { businessName: 'Hot No Date', interest: 'hot' })).body.lead;
    await amos.post('/api/leads', { businessName: 'Paid Late', stage: 'paying', nextFollowUpOn: await dateIn(-5) });

    const t = (await amos.get('/api/leads/today')).body;
    expect(t.overdue.map((l) => l.id)).toEqual([late.id]);
    expect(t.overdue[0].followUpFlag).toBe('overdue');
    expect(t.today.map((l) => l.id)).toEqual([due.id]);
    expect(t.noFollowUp.map((l) => l.id)).toContain(noDate.id);
    expect(t.upcomingThisWeek).toBe(1); // Nakato in 2 days

    expect((await bea.get('/api/leads/today')).body.overdue).toHaveLength(0);
    expect((await boss.get('/api/leads/today')).body.overdue).toHaveLength(1);
    expect((await boss.get(`/api/leads/today?agent=${ctx.bea.id}`)).body.overdue).toHaveLength(0);
    expect((await amos.get('/api/leads?due=overdue')).body.leads.map((l) => l.id)).toEqual([late.id]);
  });
});

describe('logging visits', () => {
  test('a visit moves the lead on and sets the next follow-up', async () => {
    const lead = (await amos.post('/api/leads', { businessName: 'Visit Me', firstVisitOn: await dateIn(-10) })).body.lead;
    const next = await dateIn(4);
    const res = await amos.post(`/api/leads/${lead.id}/visits`, {
      kind: 'visit', whatHappened: 'Showed the stock screen', nextStep: 'Start trial Monday',
      stage: 'demo', interest: 'hot', nextFollowUpOn: next,
    });
    expect(res.status).toBe(201);
    expect(res.body.lead).toMatchObject({ stage: 'demo', demoDone: true, interest: 'hot', nextFollowUpOn: next, visitCount: 1 });
    expect(res.body.lead.lastContactOn).toBe(await dateIn(0));

    // An older call does not move "last contact" backwards; empty fields leave the lead alone.
    const older = await amos.post(`/api/leads/${lead.id}/visits`, { kind: 'call', happenedOn: await dateIn(-2), stage: '', interest: '' });
    expect(older.body.lead).toMatchObject({ stage: 'demo', interest: 'hot', visitCount: 2 });
    expect(older.body.lead.lastContactOn).toBe(await dateIn(0));

    const detail = (await amos.get(`/api/leads/${lead.id}`)).body;
    expect(detail.visits.map((v) => v.kind)).toEqual(['visit', 'call']);
    expect(detail.visits[0]).toMatchObject({ whatHappened: 'Showed the stock screen', agentName: 'Amos Agent' });
  });

  test('marking lost from a visit needs a reason; kind must be known', async () => {
    const lead = (await amos.post('/api/leads', { businessName: 'Lose Me' })).body.lead;
    expect((await amos.post(`/api/leads/${lead.id}/visits`, { kind: 'visit', stage: 'lost' })).status).toBe(400);
    expect((await amos.post(`/api/leads/${lead.id}/visits`, { kind: 'sms' })).status).toBe(400);
    const ok = await amos.post(`/api/leads/${lead.id}/visits`, { kind: 'visit', stage: 'lost', lostReason: 'Not interested' });
    expect(ok.body.lead).toMatchObject({ stage: 'lost', lostReason: 'Not interested', followUpFlag: null });
  });

  test('agents remove only their own visits', async () => {
    const lead = (await boss.post('/api/leads', { businessName: 'Shared', agentId: ctx.amos.id })).body.lead;
    await boss.post(`/api/leads/${lead.id}/visits`, { kind: 'call' });
    const [visit] = (await amos.get(`/api/leads/${lead.id}`)).body.visits;
    expect((await amos.del(`/api/leads/${lead.id}/visits/${visit.id}`)).status).toBe(403);
    expect((await boss.del(`/api/leads/${lead.id}/visits/${visit.id}`)).status).toBe(200);
  });
});

describe('editing', () => {
  test('moving out of lost clears the reason; the phone stays unique', async () => {
    const lead = (await amos.post('/api/leads', { businessName: 'Come Back', stage: 'lost', lostReason: 'Other', phone: '0701 999 888' })).body.lead;
    const back = await amos.patch(`/api/leads/${lead.id}`, { stage: 'contacted' });
    expect(back.body.lead).toMatchObject({ stage: 'contacted', lostReason: null });
    const clash = await amos.patch(`/api/leads/${lead.id}`, { phone: '0772123456' });
    expect(clash.status).toBe(409);
    expect((await amos.patch(`/api/leads/${lead.id}`, { phone: '' })).body.lead.phone).toBe('');
  });
});

describe('numbers', () => {
  test('the dashboard counts match, and agents see only their own', async () => {
    const team = (await boss.get('/api/dashboard')).body;
    const total = await db.one('SELECT COUNT(*) AS n FROM leads');
    expect(team.key.total).toBe(total.n);
    expect(team.pipeline.reduce((s, p) => s + p.count, 0)).toBe(total.n);
    expect(team.byAgent.map((a) => a.name)).toEqual(expect.arrayContaining(['Amos Agent', 'Bea Agent']));
    expect(team.weeks).toHaveLength(8);
    expect(team.key.overdue).toBe(1);
    expect(team.lostReasons.map((r) => r.reason)).toEqual(expect.arrayContaining(['Too expensive', 'Not interested']));

    const own = (await bea.get('/api/dashboard')).body;
    expect(own.key.total).toBe(1);
    expect(own.byAgent).toEqual([]);
  });
});
