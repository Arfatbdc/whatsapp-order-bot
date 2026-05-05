"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
const connection_1 = require("./connection");
const logger_1 = require("../utils/logger");
async function migrate() {
    const schemaPath = path_1.default.join(__dirname, 'schema.sql');
    // In dist/, schema.sql won't exist — look in src/ as fallback
    let sql;
    if (fs_1.default.existsSync(schemaPath)) {
        sql = fs_1.default.readFileSync(schemaPath, 'utf-8');
    }
    else {
        const srcPath = path_1.default.join(__dirname, '..', '..', 'src', 'database', 'schema.sql');
        sql = fs_1.default.readFileSync(srcPath, 'utf-8');
    }
    const pool = (0, connection_1.getPool)();
    try {
        await pool.query(sql);
        logger_1.logger.info('Database migration completed successfully');
    }
    catch (err) {
        logger_1.logger.error({ err }, 'Database migration failed');
        process.exit(1);
    }
    finally {
        await pool.end();
    }
}
migrate();
//# sourceMappingURL=migrate.js.map