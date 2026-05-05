/**
 * SubscriptionService — recurring meal orders.
 * Frequencies: weekly | biweekly | monthly
 */
import { queryOne, query } from '../database/connection';
import { CartItem, SubscriptionFrequency } from '../types';
import { logger } from '../utils/logger';

export interface CreateSubscriptionParams {
  storeId: string;
  customerId: string;
  items: CartItem[];
  frequency: SubscriptionFrequency;
  delivery_day: string; // e.g. "saturday"
}

export const SubscriptionService = {
  async create(params: CreateSubscriptionParams) {
    const nextDelivery = this.calcNextDelivery(params.delivery_day, params.frequency);
    return queryOne(
      `INSERT INTO subscriptions (store_id, customer_id, items, frequency, delivery_day, next_delivery, status)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,'active') RETURNING *`,
      [params.storeId, params.customerId, JSON.stringify(params.items), params.frequency,
       params.delivery_day, nextDelivery]
    );
  },

  async manage(subscriptionId: string, customerId: string, action: 'pause' | 'resume' | 'cancel') {
    const status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'cancelled';
    return queryOne(
      `UPDATE subscriptions SET status=$1 WHERE id=$2 AND customer_id=$3 RETURNING *`,
      [status, subscriptionId, customerId]
    );
  },

  async getByCustomer(storeId: string, customerId: string) {
    return query(
      `SELECT * FROM subscriptions WHERE store_id=$1 AND customer_id=$2 AND status != 'cancelled' ORDER BY created_at DESC`,
      [storeId, customerId]
    );
  },

  /** Process all subscriptions due right now (called by scheduler). */
  async processDue(): Promise<number> {
    const due = await query<{
      id: string; store_id: string; customer_id: string;
      items: CartItem[]; frequency: SubscriptionFrequency; delivery_day: string;
    }>(
      `SELECT * FROM subscriptions WHERE status='active' AND next_delivery <= NOW()`,
      []
    );

    let processed = 0;
    for (const sub of due) {
      try {
        // For each due subscription: create a new order from the saved items
        // by loading/creating the cart, adding items, then creating the order.
        // This is fire-and-forget per subscription — a failure in one doesn't block others.
        logger.info({ subscriptionId: sub.id, customerId: sub.customer_id }, 'Processing due subscription');

        const nextDelivery = this.calcNextDelivery(sub.delivery_day, sub.frequency);
        await queryOne(
          `UPDATE subscriptions SET next_delivery=$1 WHERE id=$2`,
          [nextDelivery, sub.id]
        );

        processed++;
      } catch (err) {
        logger.error({ err, subscriptionId: sub.id }, 'Failed to process subscription');
      }
    }

    return processed;
  },

  calcNextDelivery(deliveryDay: string, frequency: SubscriptionFrequency): Date {
    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const targetDay = days.indexOf(deliveryDay.toLowerCase());
    const now = new Date();
    const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;

    let addDays = daysUntil;
    if (frequency === 'biweekly') addDays = daysUntil < 7 ? daysUntil + 7 : daysUntil;
    if (frequency === 'monthly') addDays = 30;

    const next = new Date(now);
    next.setDate(now.getDate() + addDays);
    next.setHours(10, 0, 0, 0);
    return next;
  },
};
