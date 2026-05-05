import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Validates the x-hub-signature-256 header from Meta's WhatsApp webhook.
 *
 * Meta signs every webhook payload with HMAC-SHA256 using your app secret.
 * We must verify this to ensure the request is genuinely from Meta.
 */
export function validateWebhookSignature(appSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip validation in development — app secret placeholder won't match Meta's signature
    if (process.env.NODE_ENV === 'development') {
      next();
      return;
    }

    const signature = req.headers['x-hub-signature-256'] as string;

    if (!signature) {
      logger.warn('Webhook request missing x-hub-signature-256 header');
      res.status(401).json({ error: 'Missing signature' });
      return;
    }

    // req.body must be the raw buffer for signature verification
    // We use express.json() with a verify callback in the main app to capture this
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    if (!rawBody) {
      logger.error('Raw body not available for signature verification');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    const expectedSignature =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      logger.warn('Invalid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  };
}
