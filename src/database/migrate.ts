import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { getPool } from './connection';
import { logger } from '../utils/logger';

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');

  // In dist/, schema.sql won't exist — look in src/ as fallback
  let sql: string;
  if (fs.existsSync(schemaPath)) {
    sql = fs.readFileSync(schemaPath, 'utf-8');
  } else {
    const srcPath = path.join(__dirname, '..', '..', 'src', 'database', 'schema.sql');
    sql = fs.readFileSync(srcPath, 'utf-8');
  }

  const pool = getPool();

  try {
    await pool.query(sql);
    logger.info('Database migration completed successfully');
  } catch (err) {
    logger.error({ err }, 'Database migration failed');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
