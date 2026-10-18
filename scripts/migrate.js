const { migrate } = require('../src/migrate');
const db = require('../src/db');

migrate()
  .then(() => console.log('Database is up to date'))
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
