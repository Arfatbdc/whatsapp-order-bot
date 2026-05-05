/**
 * Scheduler — lightweight interval-based job runner.
 * Started once in src/index.ts. No external queue needed.
 *
 * Jobs:
 *  - Every hour:  process due subscriptions
 *  - Every 2h:    send cart abandonment reminders
 *  - Every day:   expire old carts (>24h)
 */
import { SubscriptionService } from '../services/subscription';
import { query } from '../database/connection';
import { logger } from '../utils/logger';

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;
  logger.info('Scheduler started');

  // ── Process due subscriptions — every hour
  setInterval(async () => {
    try {
      const count = await SubscriptionService.processDue();
      if (count > 0) logger.info({ count }, 'Scheduler: subscriptions processed');
    } catch (err) {
      logger.error({ err }, 'Scheduler: subscription processing failed');
    }
  }, 60 * 60 * 1000);

  // ── Expire old carts — every 6 hours
  setInterval(async () => {
    try {
      const result = await query(
        `DELETE FROM carts WHERE expires_at < NOW() AND jsonb_array_length(items) = 0`,
        []
      );
      logger.debug({ deleted: result.length }, 'Scheduler: expired empty carts cleaned');
    } catch (err) {
      logger.error({ err }, 'Scheduler: cart cleanup failed');
    }
  }, 6 * 60 * 60 * 1000);
}
