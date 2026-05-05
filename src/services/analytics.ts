/**
 * AnalyticsService — fire-and-forget event logging.
 *
 * Events are inserted into analytics_events table asynchronously.
 * Failures are logged but never thrown — analytics must never break the main flow.
 *
 * Usage:
 *   AnalyticsService.log('product_searched', storeId, customerId, { query, results_count: 5 });
 */

import { query, queryOne } from '../database/connection';
import { AnalyticsEvent, AnalyticsEventType } from '../types';
import { logger } from '../utils/logger';

export const AnalyticsService = {
  /**
   * Log an analytics event (fire-and-forget).
   * Never throws — swallows all errors.
   */
  log(
    eventType: AnalyticsEventType,
    storeId: string,
    customerId: string | null,
    eventData: Record<string, unknown> = {}
  ): void {
    // Intentionally not awaited — fire-and-forget
    this._insert(eventType, storeId, customerId, eventData).catch((err) => {
      logger.warn({ err, eventType, storeId }, 'Analytics event failed to insert');
    });
  },

  /** Internal async insert. */
  async _insert(
    eventType: AnalyticsEventType,
    storeId: string,
    customerId: string | null,
    eventData: Record<string, unknown>
  ): Promise<void> {
    await query(
      `INSERT INTO analytics_events (store_id, customer_id, event_type, event_data)
       VALUES ($1, $2, $3, $4)`,
      [storeId, customerId, eventType, JSON.stringify(eventData)]
    );
  },

  /**
   * Get a summary of events for a store over a given window.
   */
  async getStoreSummary(
    storeId: string,
    since: Date
  ): Promise<Record<string, number>> {
    try {
      const rows = await query<{ event_type: string; cnt: string }>(
        `SELECT event_type, COUNT(*) AS cnt
         FROM analytics_events
         WHERE store_id = $1 AND created_at >= $2
         GROUP BY event_type`,
        [storeId, since]
      );

      const summary: Record<string, number> = {};
      for (const row of rows) {
        summary[row.event_type] = parseInt(row.cnt, 10);
      }
      return summary;
    } catch (err) {
      logger.error({ err, storeId }, 'AnalyticsService.getStoreSummary failed');
      return {};
    }
  },

  /**
   * Get top searched queries for a store.
   */
  async getTopSearches(storeId: string, since: Date, limit = 10): Promise<{ query: string; count: number }[]> {
    try {
      const rows = await query<{ q: string; cnt: string }>(
        `SELECT event_data->>'query' AS q, COUNT(*) AS cnt
         FROM analytics_events
         WHERE store_id = $1
           AND event_type = 'product_searched'
           AND created_at >= $2
           AND event_data->>'query' IS NOT NULL
         GROUP BY event_data->>'query'
         ORDER BY cnt DESC
         LIMIT $3`,
        [storeId, since, limit]
      );
      return rows.map((r) => ({ query: r.q, count: parseInt(r.cnt, 10) }));
    } catch (err) {
      logger.error({ err, storeId }, 'AnalyticsService.getTopSearches failed');
      return [];
    }
  },

  /**
   * Get order revenue for a store over a time window.
   */
  async getRevenueSummary(
    storeId: string,
    since: Date
  ): Promise<{ total_orders: number; total_revenue: number; avg_order: number }> {
    try {
      const row = await queryOne<{ cnt: string; revenue: string; avg: string }>(
        `SELECT
           COUNT(*) AS cnt,
           COALESCE(SUM(total), 0) AS revenue,
           COALESCE(AVG(total), 0) AS avg
         FROM orders
         WHERE store_id = $1
           AND status NOT IN ('cancelled')
           AND created_at >= $2`,
        [storeId, since]
      );

      return {
        total_orders: parseInt(row?.cnt ?? '0', 10),
        total_revenue: parseFloat(row?.revenue ?? '0'),
        avg_order: parseFloat(row?.avg ?? '0'),
      };
    } catch (err) {
      logger.error({ err, storeId }, 'AnalyticsService.getRevenueSummary failed');
      return { total_orders: 0, total_revenue: 0, avg_order: 0 };
    }
  },
};
