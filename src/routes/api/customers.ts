import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../database/connection';
import { requireAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();
router.use(requireAuth);

// GET /api/v1/customers?page=1&limit=20&search=phone_or_name
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const search = req.query.search as string | undefined;

    let where = 'WHERE store_id = $1';
    const params: unknown[] = [storeId];
    let i = 2;

    if (search) {
      where += ` AND (name ILIKE $${i} OR phone ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }

    const [customers, countRow] = await Promise.all([
      query(
        `SELECT id, name, phone, language, total_orders, total_spent,
                last_order_at, marketing_consent, created_at
         FROM customers
         ${where}
         ORDER BY total_orders DESC, created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM customers ${where}`,
        params
      ),
    ]);

    res.json({
      customers,
      pagination: {
        page,
        limit,
        total: parseInt(countRow?.count || '0'),
        pages: Math.ceil(parseInt(countRow?.count || '0') / limit),
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /customers failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/customers/:id — detail + last 10 orders
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;

    const [customer, orders] = await Promise.all([
      queryOne(
        `SELECT id, name, phone, language, addresses, preferences,
                total_orders, total_spent, last_order_at, marketing_consent, created_at
         FROM customers
         WHERE id = $1 AND store_id = $2`,
        [req.params.id, storeId]
      ),
      query(
        `SELECT id, order_number, status, total, payment_method,
                payment_status, created_at
         FROM orders
         WHERE customer_id = $1 AND store_id = $2
         ORDER BY created_at DESC
         LIMIT 10`,
        [req.params.id, storeId]
      ),
    ]);

    if (!customer) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json({ ...customer, recent_orders: orders });
  } catch (err) {
    logger.error({ err }, 'GET /customers/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
