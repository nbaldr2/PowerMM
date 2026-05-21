import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, testConnection } from '../config/database.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const connected = await testConnection();
  if (!connected) {
    logger.error('Cannot run migrations: database not connected');
    process.exit(1);
  }

  // Create migrations tracking table
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Get already-run migrations
  const { rows: executed } = await query('SELECT filename FROM _migrations ORDER BY id');
  const executedSet = new Set(executed.map(r => r.filename));

  // Get migration files
  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (executedSet.has(file)) {
      logger.info(`Migration ${file} already executed, skipping`);
      continue;
    }

    logger.info(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');

    try {
      await query(sql);
      await query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      logger.info(`Migration ${file} completed successfully`);
    } catch (err) {
      logger.error(`Migration ${file} failed:`, err.message);
      process.exit(1);
    }
  }

  logger.info('All migrations complete');
  process.exit(0);
}

runMigrations();
