require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const env = process.env;
const isTest = env.NODE_ENV === 'test';
const isProduction = env.NODE_ENV === 'production';

// Tests always use their own schema (wiped on every run), whatever DB_SCHEMA says.
const schema = isTest ? (env.DB_TEST_SCHEMA || 'lefori_crm_test') : (env.DB_SCHEMA || 'public');
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`DB_SCHEMA "${schema}" must be lower-case letters, digits and _`);

if (isProduction && !env.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production');

module.exports = {
  isTest,
  isProduction,
  port: Number(env.PORT) || 3030,
  sessionSecret: env.SESSION_SECRET || 'dev-only-secret-change-me',
  demoUrl: env.DEMO_URL || 'https://lefori.com',
  timezone: 'Africa/Kampala',
  db: {
    connectionString: env.DATABASE_URL || undefined,
    host: env.POSTGRES_HOST || 'localhost',
    port: Number(env.POSTGRES_PORT) || 5432,
    database: isTest ? (env.POSTGRES_TEST_DB || 'shopmaster_test') : env.POSTGRES_DB,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    ssl: env.POSTGRES_SSL === 'true' || (env.DATABASE_URL && env.POSTGRES_SSL !== 'false' && !/localhost|127\.0\.0\.1|railway\.internal/.test(env.DATABASE_URL))
      ? { rejectUnauthorized: false } : false,
    schema,
  },
  bootstrapManager: {
    name: env.BOOTSTRAP_MANAGER_NAME,
    phone: env.BOOTSTRAP_MANAGER_PHONE,
    pin: env.BOOTSTRAP_MANAGER_PIN,
  },
};
