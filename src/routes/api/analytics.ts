import { Router, Request, Response } from 'express';
import { queryOne, query } from '../../database/connection';
import { requireAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();
router.use(requireAuth);

// GET /api/v1/analytics/summary?days=30
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 30));

    const [revenue, orders, customers, topProducts, today] = await Promise.all([
      queryOne<{ total: string; count: string }>(
        `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
         FROM orders
         WHERE store_id = $1
           AND status != 'cancelled'
           AND created_at > NOW() - ($2 || ' days')::INTERVAL`,
        [storeId, days]
      ),
      query(
        `SELECT status, COUNT(*) AS count
         FROM orders
         WHERE store_id = $1
           AND created_at > NOW() - ($2 || ' days')::INTERVAL
         GROUP BY status`,
        [storeId, days]
      ),
      queryOne<{ count: string; new_count: string }>(
        `SELECT
           COUNT(*) AS count,
           COUNT(*) FILTER (WHERE created_at > NOW() - ($2 || ' days')::INTERVAL) AS new_count
         FROM customers
         WHERE store_id = $1`,
        [storeId, days]
      ),
      query<{ name_ar: string; quantity: number; revenue: number }>(
        `SELECT
           p.name_ar,
           COALESCE(SUM((oi.value->>'quantity')::numeric), 0) AS quantity,
           COALESCE(SUM((oi.value->>'subtotal')::numeric), 0) AS revenue
         FROM orders o,
              jsonb_array_elements(o.items) AS oi(value)
         JOIN products p ON p.id = (oi.value->>'product_id')::uuid
         WHERE o.store_id = $1
           AND o.status != 'cancelled'
           AND o.created_at > NOW() - ($2 || ' days')::INTERVAL
         GROUP BY p.name_ar
         ORDER BY quantity DESC
         LIMIT 5`,
        [storeId, days]
      ),
      queryOne<{ count: string; total: string }>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM orders
         WHERE store_id = $1
           AND status != 'cancelled'
           AND DATE(created_at AT TIME ZONE 'Asia/Riyadh') = CURRENT_DATE AT TIME ZONE 'Asia/Riyadh'`,
        [storeId]
      ),
    ]);

    const avgOrderValue =
      parseInt(revenue?.count || '0') > 0
        ? parseFloat(revenue?.total || '0') / parseInt(revenue?.count || '0')
        : 0;

    res.json({
      period_days: days,
      revenue: {
        total: parseFloat(revenue?.total || '0'),
        order_count: parseInt(revenue?.count || '0'),
        average_order_value: avgOrderValue,
        avg_order: avgOrderValue,
      },
      orders_by_status: orders,
      customers: {
        total: parseInt(customers?.count || '0'),
        new_this_period: parseInt(customers?.new_count || '0'),
      },
      top_products: topProducts,
      today: {
        order_count: parseInt(today?.count || '0'),
        revenue: parseFloat(today?.total || '0'),
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /analytics/summary failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/analytics/timeline?days=30 — daily revenue chart data
router.get('/timeline', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 30));

    const data = await query(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*) AS orders,
         COALESCE(SUM(total), 0) AS revenue
       FROM orders
       WHERE store_id = $1
         AND status != 'cancelled'
         AND created_at > NOW() - ($2 || ' days')::INTERVAL
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [storeId, days]
    );

    res.json(data);
  } catch (err) {
    logger.error({ err }, 'GET /analytics/timeline failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/analytics/events?type=order_placed&days=7 — raw event log
router.get('/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;
    const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 7));
    const eventType = req.query.type as string | undefined;
    const limit = Math.min(500, parseInt(req.query.limit as string) || 100);

    let where = 'WHERE store_id = $1 AND created_at > NOW() - ($2 || \' days\')::INTERVAL';
    const params: unknown[] = [storeId, days];
    let i = 3;

    if (eventType) {
      where += ` AND event_type = $${i++}`;
      params.push(eventType);
    }

    const events = await query(
      `SELECT id, event_type, event_data, customer_id, created_at
       FROM analytics_events
       ${where}
       ORDER BY created_at DESC
       LIMIT $${i}`,
      [...params, limit]
    );

    res.json(events);
  } catch (err) {
    logger.error({ err }, 'GET /analytics/events failed');
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
