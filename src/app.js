const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const config = require('./config');
const db = require('./db');
const auth = require('./routes/auth');
const users = require('./routes/users');
const leads = require('./routes/leads');
const dashboard = require('./routes/dashboard');
const importer = require('./routes/import');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        // Bar widths and small layout tweaks use style="" attributes; every value in them is escaped.
        styleSrcAttr: ["'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
  }));
  app.use(compression());

  app.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api', express.json({ limit: '200kb' }));
  app.use('/api', session({
    store: new PgSession({ pool: db.pool, tableName: 'session', createTableIfMissing: false, pruneSessionInterval: config.isTest ? false : 60 * 60 }),
    name: 'lefori_sales',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProduction, maxAge: 30 * 24 * 60 * 60 * 1000 },
  }));

  // Changes must come from our own page: a cross-site form cannot set this header.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (req.get('X-Requested-With') !== 'lefori-sales') return res.status(403).json({ error: 'Request blocked' });
    next();
  });

  app.use('/api/auth', auth.router);
  app.use('/api', auth.requireUser);
  app.use('/api', dashboard.router);
  app.use('/api/users', users.router);
  app.use('/api/leads', leads.router);
  app.use('/api/import', importer.router);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub, {
    setHeaders(res, file) {
      if (/(sw\.js|index\.html|\.webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res) => res.sendFile(path.join(pub, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    const message = status >= 500 ? 'Something went wrong. Try again.' : (err.code === 'LIMIT_FILE_SIZE' ? 'That file is too big' : err.message);
    res.status(status).json({ error: message, ...(err.extra || {}) });
  });

  return app;
}

module.exports = { createApp };
