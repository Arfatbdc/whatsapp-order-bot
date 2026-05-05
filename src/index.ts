import express, { Request } from 'express';
import { config } from './config';
import { applySecurityMiddleware } from './middleware/security';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { testConnection, closePool } from './database/connection';
import { connectRedis, closeRedis } from './database/redis';
import { logger } from './utils/logger';
import webhookRouter from './routes/webhook';
import paymentRouter from './routes/payment';
import apiRouter from './routes/api';

async function main() {
  const app = express();

  // Trust proxy — required when running behind ngrok / reverse proxy
  // so that express-rate-limit can read X-Forwarded-For correctly
  app.set('trust proxy', 1);

  // ═══════════════════════════════════════════
  // BODY PARSING
  // ═══════════════════════════════════════════

  // JSON parser with raw body capture for webhook signature verification
  app.use(
    express.json({
      limit: '5mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(express.urlencoded({ extended: true }));

  // ═══════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════

  applySecurityMiddleware(app);

  // ═══════════════════════════════════════════
  // ROUTES
  // ═══════════════════════════════════════════

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
    });
  });

  // WhatsApp webhook
  app.use('/webhook', webhookRouter);

  // Payment callbacks (Moyasar)
  app.use('/payment', paymentRouter);

  // Dashboard API
  app.use('/api/v1', apiRouter);

  // ═══════════════════════════════════════════
  // ERROR HANDLING
  // ═══════════════════════════════════════════

  app.use(notFoundHandler);
  app.use(errorHandler);

  // ═══════════════════════════════════════════
  // DATABASE CONNECTIONS
  // ═══════════════════════════════════════════

  const dbOk = await testConnection();
  if (!dbOk) {
    logger.warn('PostgreSQL not available — some features will not work');
  }

  const redisOk = await connectRedis();
  if (!redisOk) {
    logger.warn('Redis not available — using degraded mode');
  }

  // Start background job scheduler
  const { startScheduler } = await import('./jobs/scheduler');
  startScheduler();

  // ═══════════════════════════════════════════
  // START SERVER
  // ═══════════════════════════════════════════

  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.nodeEnv,
        pid: process.pid,
      },
      `SmartOrder bot server running on port ${config.port}`
    );
  });

  // ═══════════════════════════════════════════
  // GRACEFUL SHUTDOWN
  // ═══════════════════════════════════════════

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    server.close(async () => {
      logger.info('HTTP server closed');
      await closePool();
      await closeRedis();
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled Promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
