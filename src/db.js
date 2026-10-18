const { Pool, types } = require('pg');
const config = require('./config');

// DATE columns come back as 'YYYY-MM-DD' strings, not JS Dates shifted by the UTC offset.
types.setTypeParser(1082, (v) => v);
// BIGINT counts come back as numbers.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

const { schema, connectionString, ...conn } = config.db;

// Every connection works in the CRM's schema and in Kampala time, so CURRENT_DATE is the agents' "today".
const pool = new Pool({
  ...(connectionString ? { connectionString, ssl: conn.ssl } : conn),
  options: `-c search_path=${schema} -c timezone=${config.timezone}`,
  max: 10,
});

const query = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const all = async (text, params) => (await pool.query(text, params)).rows;

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, one, all, tx, schema };
