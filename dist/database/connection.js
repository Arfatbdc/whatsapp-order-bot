"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
exports.query = query;
exports.queryOne = queryOne;
exports.transaction = transaction;
exports.testConnection = testConnection;
exports.closePool = closePool;
const pg_1 = require("pg");
const logger_1 = require("../utils/logger");
let pool;
function getPool() {
    if (!pool) {
        const poolConfig = {
            connectionString: process.env.DATABASE_URL,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
        };
        pool = new pg_1.Pool(poolConfig);
        pool.on('error', (err) => {
            logger_1.logger.error({ err }, 'Unexpected database pool error');
        });
        pool.on('connect', () => {
            logger_1.logger.debug('New database connection established');
        });
    }
    return pool;
}
async function query(text, params) {
    const start = Date.now();
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    logger_1.logger.debug({ query: text.substring(0, 80), duration, rows: result.rowCount }, 'DB query');
    return result.rows;
}
async function queryOne(text, params) {
    const rows = await query(text, params);
    return rows[0] || null;
}
async function transaction(callback) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function testConnection() {
    try {
        await query('SELECT NOW()');
        logger_1.logger.info('Database connection successful');
        return true;
    }
    catch (err) {
        logger_1.logger.error({ err }, 'Database connection failed');
        return false;
    }
}
async function closePool() {
    if (pool) {
        await pool.end();
        logger_1.logger.info('Database pool closed');
    }
}
//# sourceMappingURL=connection.js.map