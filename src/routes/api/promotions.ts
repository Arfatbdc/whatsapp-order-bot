import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../database/connection';
import { requireAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const VALID_TYPES = ['percentage', 'fixed', 'buy_x_get_y', 'free_delivery'] as const;

const router = Router();
router.use(requireAuth);

// GET /api/v1/promotions
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const promotions = await query(
      `SELECT * FROM promotions
       WHERE store_id = $1
       ORDER BY created_at DESC`,
      [req.auth!.storeId]
    );
    res.json(promotions);
  } catch (err) {
    logger.error({ err }, 'GET /promotions failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/promotions/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const promo = await queryOne(
      'SELECT * FROM promotions WHERE id = $1 AND store_id = $2',
      [req.params.id, req.auth!.storeId]
    );
    if (!promo) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(promo);
  } catch (err) {
    logger.error({ err }, 'GET /promotions/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/promotions
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;
    const {
      code,
      title_ar,
      title_en,
      type,
      discount_value,
      min_order,
      valid_from,
      valid_until,
      max_uses,
      product_ids,
    } = req.body as {
      code?: string;
      title_ar?: string;
      title_en?: string;
      type?: string;
      discount_value?: number;
      min_order?: number;
      valid_from?: string;
      valid_until?: string;
      max_uses?: number;
      product_ids?: string[];
    };

    if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
      res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (discount_value === undefined) {
      res.status(400).json({ error: 'discount_value required' });
      return;
    }

    const promo = await queryOne(
      `INSERT INTO promotions
         (store_id, code, title_ar, title_en, type, discount_value,
          min_order, valid_from, valid_until, max_uses, product_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        storeId,
        code || null,
        title_ar || null,
        title_en || null,
        type,
        discount_value,
        min_order ?? null,
        valid_from || null,
        valid_until || null,
        max_uses ?? null,
        product_ids ? `{${product_ids.join(',')}}` : null,
      ]
    );

    res.status(201).json(promo);
  } catch (err) {
    logger.error({ err }, 'POST /promotions failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/v1/promotions/:id
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      code,
      title_ar,
      title_en,
      type,
      discount_value,
      min_order,
      valid_from,
      valid_until,
      max_uses,
      product_ids,
    } = req.body as {
      code?: string;
      title_ar?: string;
      title_en?: string;
      type?: string;
      discount_value?: number;
      min_order?: number;
      valid_from?: string;
      valid_until?: string;
      max_uses?: number;
      product_ids?: string[];
    };

    if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
      res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (discount_value === undefined) {
      res.status(400).json({ error: 'discount_value required' });
      return;
    }

    const promo = await queryOne(
      `UPDATE promotions
       SET code=$1, title_ar=$2, title_en=$3, type=$4, discount_value=$5,
           min_order=$6, valid_from=$7, valid_until=$8, max_uses=$9, product_ids=$10
       WHERE id=$11 AND store_id=$12
       RETURNING *`,
      [
        code || null,
        title_ar || null,
        title_en || null,
        type,
        discount_value,
        min_order ?? null,
        valid_from || null,
        valid_until || null,
        max_uses ?? null,
        product_ids ? `{${product_ids.join(',')}}` : null,
        req.params.id,
        req.auth!.storeId,
      ]
    );

    if (!promo) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(promo);
  } catch (err) {
    logger.error({ err }, 'PUT /promotions/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/v1/promotions/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await queryOne(
      'DELETE FROM promotions WHERE id=$1 AND store_id=$2 RETURNING id',
      [req.params.id, req.auth!.storeId]
    );
    if (!result) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error({ err }, 'DELETE /promotions/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/v1/promotions/:id/toggle — toggle is_active
router.patch('/:id/toggle', async (req: Request, res: Response): Promise<void> => {
  try {
    const promo = await queryOne(
      `UPDATE promotions
       SET is_active = NOT is_active
       WHERE id=$1 AND store_id=$2
       RETURNING id, is_active, code, title_ar`,
      [req.params.id, req.auth!.storeId]
    );
    if (!promo) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(promo);
  } catch (err) {
    logger.error({ err }, 'PATCH /promotions/:id/toggle failed');
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
