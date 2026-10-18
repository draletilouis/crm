const { setup, loginAs, request, db } = require('./helpers');

let ctx;
beforeAll(async () => { ctx = await setup(); });
afterAll(() => db.pool.end());

describe('logging in', () => {
  test('wrong PIN is refused', async () => {
    const res = await request(ctx.app).post('/api/auth/login').set('X-Requested-With', 'lefori-sales')
      .send({ phone: '0700 000 002', pin: '9999' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Wrong phone number or PIN/);
  });

  test('any phone format logs in, and /me returns the user', async () => {
    const c = await loginAs(ctx.app, '+256 700 000002');
    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ name: 'Amos Agent', role: 'agent', phone: '0700 000 002' });
    expect(me.body.user.pin_hash).toBeUndefined();
  });

  test('the API needs a login', async () => {
    const res = await request(ctx.app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  test('changes without the app header are blocked', async () => {
    const c = await loginAs(ctx.app, '0700000002');
    const res = await c.raw.post('/api/leads').send({ businessName: 'X' });
    expect(res.status).toBe(403);
  });

  test('logout ends the session', async () => {
    const c = await loginAs(ctx.app, '0700000002');
    await c.post('/api/auth/logout');
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  test('switching someone off logs them out at once', async () => {
    const bea = await loginAs(ctx.app, '0700000003');
    const boss = await loginAs(ctx.app, '0700000001');
    expect((await boss.patch(`/api/users/${ctx.bea.id}`, { active: false })).status).toBe(200);
    expect((await bea.get('/api/leads')).status).toBe(401);
    await boss.patch(`/api/users/${ctx.bea.id}`, { active: true });
  });

  test('an agent can change their own PIN', async () => {
    const c = await loginAs(ctx.app, '0700000002');
    expect((await c.post('/api/auth/pin', { current: '0000', next: '5678' })).status).toBe(400);
    expect((await c.post('/api/auth/pin', { current: '1234', next: '12' })).status).toBe(400);
    expect((await c.post('/api/auth/pin', { current: '1234', next: '5678' })).status).toBe(200);
    await loginAs(ctx.app, '0700000002', '5678');
    await c.post('/api/auth/pin', { current: '5678', next: '1234' });
  });
});

describe('team', () => {
  test('agents cannot add people', async () => {
    const c = await loginAs(ctx.app, '0700000002');
    expect((await c.post('/api/users', { name: 'X', phone: '0700000009', pin: '1234' })).status).toBe(403);
  });

  test('a manager adds an agent who can then log in', async () => {
    const boss = await loginAs(ctx.app, '0700000001');
    const res = await boss.post('/api/users', { name: 'Carol New', phone: '0711 222 333', pin: '4321' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'agent', phone: '0711 222 333' });
    await loginAs(ctx.app, '0711222333', '4321');
    expect((await boss.post('/api/users', { name: 'Dup', phone: '0711222333', pin: '1234' })).status).toBe(409);
  });

  test('the last manager cannot be removed, and nobody removes their own access', async () => {
    const boss = await loginAs(ctx.app, '0700000001');
    const self = await boss.patch(`/api/users/${ctx.manager.id}`, { role: 'agent' });
    expect(self.status).toBe(400);
  });
});
