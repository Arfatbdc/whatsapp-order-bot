"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const security_1 = require("./middleware/security");
const errorHandler_1 = require("./middleware/errorHandler");
const connection_1 = require("./database/connection");
const redis_1 = require("./database/redis");
const logger_1 = require("./utils/logger");
const webhook_1 = __importDefault(require("./routes/webhook"));
async function main() {
    const app = (0, express_1.default)();
    // Trust proxy — required when running behind ngrok / reverse proxy
    // so that express-rate-limit can read X-Forwarded-For correctly
    app.set('trust proxy', 1);
    // ═══════════════════════════════════════════
    // BODY PARSING
    // ═══════════════════════════════════════════
    // JSON parser with raw body capture for webhook signature verification
    app.use(express_1.default.json({
        limit: '5mb',
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // ═══════════════════════════════════════════
    // SECURITY
    // ═══════════════════════════════════════════
    (0, security_1.applySecurityMiddleware)(app);
    // ═══════════════════════════════════════════
    // ROUTES
    // ═══════════════════════════════════════════
    // Health check
    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: config_1.config.nodeEnv,
        });
    });
    // WhatsApp webhook
    app.use('/webhook', webhook_1.default);
    // API routes placeholder (Day 7+)
    // app.use('/api', apiRouter);
    // ═══════════════════════════════════════════
    // ERROR HANDLING
    // ═══════════════════════════════════════════
    app.use(errorHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    // ═══════════════════════════════════════════
    // DATABASE CONNECTIONS
    // ═══════════════════════════════════════════
    const dbOk = await (0, connection_1.testConnection)();
    if (!dbOk) {
        logger_1.logger.warn('PostgreSQL not available — some features will not work');
    }
    const redisOk = await (0, redis_1.connectRedis)();
    if (!redisOk) {
        logger_1.logger.warn('Redis not available — using degraded mode');
    }
    // ═══════════════════════════════════════════
    // START SERVER
    // ═══════════════════════════════════════════
    const server = app.listen(config_1.config.port, () => {
        logger_1.logger.info({
            port: config_1.config.port,
            env: config_1.config.nodeEnv,
            pid: process.pid,
        }, `SmartOrder bot server running on port ${config_1.config.port}`);
    });
    // ═══════════════════════════════════════════
    // GRACEFUL SHUTDOWN
    // ═══════════════════════════════════════════
    const shutdown = async (signal) => {
        logger_1.logger.info({ signal }, 'Shutdown signal received');
        server.close(async () => {
            logger_1.logger.info('HTTP server closed');
            await (0, connection_1.closePool)();
            await (0, redis_1.closeRedis)();
            process.exit(0);
        });
        // Force exit after 10 seconds
        setTimeout(() => {
            logger_1.logger.error('Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => {
        logger_1.logger.error({ reason }, 'Unhandled Promise rejection');
    });
    process.on('uncaughtException', (err) => {
        logger_1.logger.fatal({ err }, 'Uncaught exception — shutting down');
        process.exit(1);
    });
}
main().catch((err) => {
    logger_1.logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
});
//# sourceMappingURL=index.js.map