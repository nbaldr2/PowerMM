import pg from 'pg';
import env from './env.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', err);
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected');
});

/**
 * Execute a parameterized query against PostgreSQL.
 * @param {string} text - SQL query with $1, $2 placeholders
 * @param {Array} params - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 80)}...`);
  return result;
}

/**
 * Get a client from the pool for transactions.
 */
export async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  // Monkey-patch release to log
  client.release = () => {
    client.release = originalRelease;
    return originalRelease();
  };

  return client;
}

/**
 * Run a function inside a transaction.
 */
export async function transaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    logger.info(`PostgreSQL connected: ${res.rows[0].now}`);
    return true;
  } catch (err) {
    logger.error('PostgreSQL connection failed:', err.message);
    return false;
  }
}

export default pool;
