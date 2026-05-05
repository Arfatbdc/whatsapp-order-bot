import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../database/connection';
import { requireAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();
router.use(requireAuth);

// GET /api/v1/products?page=1&limit=20&category=uuid&search=text&in_stock=true
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { category, search, in_stock } = req.query;

    let where = 'WHERE p.store_id = $1 AND p.is_active = true';
    const params: unknown[] = [storeId];
    let i = 2;

    if (category) {
      where += ` AND p.category_id = $${i++}`;
      params.push(category);
    }
    if (in_stock === 'true') {
      where += ` AND p.in_stock = true`;
    }
    if (search) {
      where += ` AND (p.name_ar ILIKE $${i} OR p.name_en ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }

    const [products, countRow] = await Promise.all([
      query(
        `SELECT p.*, c.name_ar as category_name_ar, c.name_en as category_name_en
         FROM products p LEFT JOIN categories c ON p.category_id = c.id
         ${where} ORDER BY c.sort_order, p.name_ar LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM products p ${where}`,
        params
      ),
    ]);

    res.json({
      products,
      pagination: {
        page,
        limit,
        total: parseInt(countRow?.count || '0'),
        pages: Math.ceil(parseInt(countRow?.count || '0') / limit),
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /products failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/products/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await queryOne(
      `SELECT p.*, c.name_ar as category_name_ar, c.name_en as category_name_en
       FROM products p LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1 AND p.store_id = $2`,
      [req.params.id, req.auth!.storeId]
    );
    if (!product) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(product);
  } catch (err) {
    logger.error({ err }, 'GET /products/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/products
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.auth!.storeId;
    const {
      name_ar,
      name_en,
      description_ar,
      description_en,
      price,
      unit,
      category_id,
      sku,
      in_stock,
      stock_qty,
      tags,
      image_url,
    } = req.body as {
      name_ar?: string;
      name_en?: string;
      description_ar?: string;
      description_en?: string;
      price?: number;
      unit?: string;
      category_id?: string;
      sku?: string;
      in_stock?: boolean;
      stock_qty?: number;
      tags?: string[];
      image_url?: string;
    };

    if (!name_ar || price === undefined || !unit) {
      res.status(400).json({ error: 'name_ar, price, unit required' });
      return;
    }

    const product = await queryOne(
      `INSERT INTO products
         (store_id, category_id, name_ar, name_en, description_ar, description_en,
          price, unit, sku, in_stock, stock_qty, tags, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text[],$13)
       RETURNING *`,
      [
        storeId,
        category_id || null,
        name_ar,
        name_en || null,
        description_ar || null,
        description_en || null,
        price,
        unit,
        sku || null,
        in_stock ?? true,
        stock_qty ?? null,
        tags || [],
        image_url || null,
      ]
    );

    res.status(201).json(product);
  } catch (err) {
    logger.error({ err }, 'POST /products failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/v1/products/:id
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name_ar,
      name_en,
      description_ar,
      description_en,
      price,
      unit,
      category_id,
      sku,
      in_stock,
      stock_qty,
      tags,
      image_url,
    } = req.body as {
      name_ar?: string;
      name_en?: string;
      description_ar?: string;
      description_en?: string;
      price?: number;
      unit?: string;
      category_id?: string;
      sku?: string;
      in_stock?: boolean;
      stock_qty?: number;
      tags?: string[];
      image_url?: string;
    };

    if (!name_ar || price === undefined || !unit) {
      res.status(400).json({ error: 'name_ar, price, unit required' });
      return;
    }

    const product = await queryOne(
      `UPDATE products
       SET name_ar=$1, name_en=$2, description_ar=$3, description_en=$4,
           price=$5, unit=$6, category_id=$7, sku=$8, in_stock=$9,
           stock_qty=$10, tags=$11::text[], image_url=$12, updated_at=NOW()
       WHERE id=$13 AND store_id=$14
       RETURNING *`,
      [
        name_ar,
        name_en || null,
        description_ar || null,
        description_en || null,
        price,
        unit,
        category_id || null,
        sku || null,
        in_stock ?? true,
        stock_qty ?? null,
        tags || [],
        image_url || null,
        req.params.id,
        req.auth!.storeId,
      ]
    );

    if (!product) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(product);
  } catch (err) {
    logger.error({ err }, 'PUT /products/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/v1/products/:id/stock — quick stock toggle
router.patch('/:id/stock', async (req: Request, res: Response): Promise<void> => {
  try {
    const { in_stock, stock_qty } = req.body as { in_stock?: boolean; stock_qty?: number };
    const product = await queryOne(
      `UPDATE products
       SET in_stock=$1, stock_qty=$2, updated_at=NOW()
       WHERE id=$3 AND store_id=$4
       RETURNING id, name_ar, in_stock, stock_qty`,
      [in_stock ?? true, stock_qty ?? null, req.params.id, req.auth!.storeId]
    );
    if (!product) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(product);
  } catch (err) {
    logger.error({ err }, 'PATCH /products/:id/stock failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/v1/products/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await queryOne(
      `UPDATE products SET is_active=false, updated_at=NOW()
       WHERE id=$1 AND store_id=$2 RETURNING id`,
      [req.params.id, req.auth!.storeId]
    );
    if (!result) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error({ err }, 'DELETE /products/:id failed');
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
