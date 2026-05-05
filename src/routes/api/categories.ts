import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../database/connection';
import { requireAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();
router.use(requireAuth);

// GET /api/v1/categories — list all active categories with product count
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;

    const categories = await query(
      `SELECT c.*,
         COUNT(p.id) FILTER (WHERE p.is_active = true) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.store_id = c.store_id
       WHERE c.store_id = $1 AND c.is_active = true
       GROUP BY c.id
       ORDER BY c.sort_order, c.name_ar`,
      [storeId]
    );

    res.json(categories);
  } catch (err) {
    logger.error({ err }, 'GET /categories failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/categories/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const category = await queryOne(
      `SELECT c.*,
         COUNT(p.id) FILTER (WHERE p.is_active = true) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.store_id = c.store_id
       WHERE c.id = $1 AND c.store_id = $2
       GROUP BY c.id`,
      [req.params.id, req.auth!.storeId]
    );
    if (!category) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(category);
  } catch (err) {
    logger.error({ err }, 'GET /categories/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/categories
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;
    const { name_ar, name_en, sort_order } = req.body as {
      name_ar?: string;
      name_en?: string;
      sort_order?: number;
    };

    if (!name_ar) {
      res.status(400).json({ error: 'name_ar required' });
      return;
    }

    const category = await queryOne(
      `INSERT INTO categories (store_id, name_ar, name_en, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [storeId, name_ar, name_en || null, sort_order ?? 0]
    );

    res.status(201).json(category);
  } catch (err) {
    logger.error({ err }, 'POST /categories failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/v1/categories/:id
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name_ar, name_en, sort_order } = req.body as {
      name_ar?: string;
      name_en?: string;
      sort_order?: number;
    };

    if (!name_ar) {
      res.status(400).json({ error: 'name_ar required' });
      return;
    }

    const category = await queryOne(
      `UPDATE categories
       SET name_ar=$1, name_en=$2, sort_order=$3
       WHERE id=$4 AND store_id=$5
       RETURNING *`,
      [name_ar, name_en || null, sort_order ?? 0, req.params.id, req.auth!.storeId]
    );

    if (!category) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(category);
  } catch (err) {
    logger.error({ err }, 'PUT /categories/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/v1/categories/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await queryOne(
      `UPDATE categories SET is_active=false
       WHERE id=$1 AND store_id=$2
       RETURNING id`,
      [req.params.id, req.auth!.storeId]
    );
    if (!result) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error({ err }, 'DELETE /categories/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
