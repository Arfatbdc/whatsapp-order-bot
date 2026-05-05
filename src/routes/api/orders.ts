import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../database/connection';
import { requireAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { NotificationService } from '../../services/notification';
import { Order, Customer } from '../../types';

const VALID_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

type OrderStatus = (typeof VALID_STATUSES)[number];

const router = Router();
router.use(requireAuth);

// GET /api/v1/orders?status=pending&page=1&limit=20
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    let where = 'WHERE o.store_id = $1';
    const params: unknown[] = [storeId];
    let i = 2;

    if (status) {
      where += ` AND o.status = $${i++}`;
      params.push(status);
    }

    const [orders, countRow] = await Promise.all([
      query(
        `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
         FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
         ${where} ORDER BY o.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM orders o ${where}`,
        params
      ),
    ]);

    res.json({
      orders,
      pagination: {
        page,
        limit,
        total: parseInt(countRow?.count || '0'),
        pages: Math.ceil(parseInt(countRow?.count || '0') / limit),
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /orders failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/orders/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await queryOne(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
       FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.id = $1 AND o.store_id = $2`,
      [req.params.id, req.auth!.storeId]
    );
    if (!order) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(order);
  } catch (err) {
    logger.error({ err }, 'GET /orders/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/v1/orders/:id/status
router.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, estimated_delivery } = req.body as {
      status?: string;
      estimated_delivery?: string;
    };

    if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({
        error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
      });
      return;
    }

    const typedStatus = status as OrderStatus;

    // Use separate queries to avoid dynamic SQL with delivered_at
    let order;
    if (typedStatus === 'delivered') {
      order = await queryOne(
        `UPDATE orders
         SET status=$1, estimated_delivery=$2, delivered_at=NOW(), updated_at=NOW()
         WHERE id=$3 AND store_id=$4
         RETURNING *`,
        [typedStatus, estimated_delivery || null, req.params.id, req.auth!.storeId]
      );
    } else {
      order = await queryOne(
        `UPDATE orders
         SET status=$1, estimated_delivery=$2, delivered_at=NULL, updated_at=NOW()
         WHERE id=$3 AND store_id=$4
         RETURNING *`,
        [typedStatus, estimated_delivery || null, req.params.id, req.auth!.storeId]
      );
    }

    if (!order) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    // Fire-and-forget: send WhatsApp notification to customer
    const typedOrder = order as unknown as Order;
    queryOne<Customer>(
      'SELECT * FROM customers WHERE id = $1',
      [typedOrder.customer_id]
    ).then((customer) => {
      if (customer) {
        NotificationService.notifyOrderStatus(typedOrder, customer, customer.language || 'ar');
      }
    }).catch(() => {});

    res.json(order);
  } catch (err) {
    logger.error({ err }, 'PATCH /orders/:id/status failed');
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
