import { Router, Request, Response } from 'express';
import { queryOne } from '../../database/connection';
import { requireAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();
router.use(requireAuth);

// GET /api/v1/store — get current store config
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const store = await queryOne(
      `SELECT id, name, name_ar, phone, city, working_hours, delivery_zones,
              delivery_fee, free_delivery_above, min_order, payment_methods,
              vat_rate, subscription_plan, is_active, created_at, updated_at
       FROM stores
       WHERE id = $1`,
      [req.auth!.storeId]
    );

    if (!store) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    res.json(store);
  } catch (err) {
    logger.error({ err }, 'GET /store failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/v1/store — update store config
router.put('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      name_ar,
      phone,
      city,
      working_hours,
      delivery_zones,
      delivery_fee,
      free_delivery_above,
      min_order,
      payment_methods,
      vat_rate,
    } = req.body as {
      name?: string;
      name_ar?: string;
      phone?: string;
      city?: string;
      working_hours?: Record<string, string>;
      delivery_zones?: unknown[];
      delivery_fee?: number;
      free_delivery_above?: number;
      min_order?: number;
      payment_methods?: string[];
      vat_rate?: number;
    };

    // Build partial update — only update provided fields
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let i = 1;

    if (name !== undefined) { setClauses.push(`name = $${i++}`); params.push(name); }
    if (name_ar !== undefined) { setClauses.push(`name_ar = $${i++}`); params.push(name_ar); }
    if (phone !== undefined) { setClauses.push(`phone = $${i++}`); params.push(phone); }
    if (city !== undefined) { setClauses.push(`city = $${i++}`); params.push(city); }
    if (working_hours !== undefined) { setClauses.push(`working_hours = $${i++}`); params.push(JSON.stringify(working_hours)); }
    if (delivery_zones !== undefined) { setClauses.push(`delivery_zones = $${i++}`); params.push(JSON.stringify(delivery_zones)); }
    if (delivery_fee !== undefined) { setClauses.push(`delivery_fee = $${i++}`); params.push(delivery_fee); }
    if (free_delivery_above !== undefined) { setClauses.push(`free_delivery_above = $${i++}`); params.push(free_delivery_above); }
    if (min_order !== undefined) { setClauses.push(`min_order = $${i++}`); params.push(min_order); }
    if (payment_methods !== undefined) { setClauses.push(`payment_methods = $${i++}::text[]`); params.push(payment_methods); }
    if (vat_rate !== undefined) { setClauses.push(`vat_rate = $${i++}`); params.push(vat_rate); }

    params.push(req.auth!.storeId);

    const store = await queryOne(
      `UPDATE stores SET ${setClauses.join(', ')}
       WHERE id = $${i}
       RETURNING id, name, name_ar, phone, city, working_hours, delivery_zones,
                 delivery_fee, free_delivery_above, min_order, payment_methods,
                 vat_rate, subscription_plan, is_active, updated_at`,
      params
    );

    if (!store) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    res.json(store);
  } catch (err) {
    logger.error({ err }, 'PUT /store failed');
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
