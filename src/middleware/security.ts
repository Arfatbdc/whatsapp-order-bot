import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Express } from 'express';

export function applySecurityMiddleware(app: Express): void {
  // Helmet — sets various HTTP security headers
  app.use(helmet());

  // CORS — restrictive in production
  app.use(
    cors({
      origin: process.env.NODE_ENV === 'production'
        ? process.env.CORS_ORIGIN || false
        : true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  // Global rate limiter — 1000 requests/min across all endpoints
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' },
      skip: (req) => {
        // Don't rate limit the webhook verification GET
        return req.method === 'GET' && req.path === '/webhook';
      },
    })
  );

  // WhatsApp webhook gets its own stricter per-user rate limiting
  // (applied per phone number in the webhook route handler)
}

// Per-user rate limiter for WhatsApp messages: 30 msgs/min
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => {
    // Extract phone from WhatsApp webhook body
    try {
      const body = req.body;
      const phone = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      return phone || req.ip || 'unknown';
    } catch {
      return req.ip || 'unknown';
    }
  },
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
});
