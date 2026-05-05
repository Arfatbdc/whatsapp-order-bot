import { Product, Category } from '../types';
import { query, queryOne } from '../database/connection';
import { logger } from '../utils/logger';
import { AnalyticsService } from './analytics';

export interface ProductSearchResult {
  products: Product[];
  total: number;
}

/**
 * Product catalog service — multi-tenant, storeId on every query.
 * Day 3: search, categories, product details, stock check, alternatives.
 */
export class ProductService {
  /**
   * Full-text search using PostgreSQL GIN index (name_ar, name_en, tags).
   * Falls back to ILIKE for short or unmatched queries.
   */
  static async search(
    storeId: string,
    searchQuery: string,
    options: { categoryId?: string; limit?: number } = {}
  ): Promise<ProductSearchResult> {
    const limit = Math.min(options.limit || 10, 20);
    const q = searchQuery.trim();

    try {
      // Try full-text search first
      let rows = await this.fullTextSearch(storeId, q, options.categoryId, limit);

      // If no results, fall back to ILIKE fuzzy search
      if (rows.length === 0) {
        rows = await this.ilikeSearch(storeId, q, options.categoryId, limit);
      }

      logger.debug(
        { storeId, query: q, results: rows.length },
        'Product search completed'
      );

      // Fire analytics event (fire-and-forget, no customerId here — caller logs if needed)
      AnalyticsService.log('product_searched', storeId, null, {
        query: q,
        results_count: rows.length,
        category_id: options.categoryId ?? null,
      });

      return { products: rows, total: rows.length };
    } catch (err) {
      logger.error({ err, storeId, query: q }, 'Product search failed');
      return { products: [], total: 0 };
    }
  }

  private static async fullTextSearch(
    storeId: string,
    q: string,
    categoryId?: string,
    limit = 10
  ): Promise<Product[]> {
    const params: unknown[] = [storeId, q, limit];
    const categoryFilter = categoryId
      ? `AND category_id = $${params.push(categoryId)}`
      : '';

    return query<Product>(
      `SELECT p.*,
        ts_rank(
          to_tsvector('simple', p.name_ar || ' ' || COALESCE(p.name_en, '') || ' ' || array_to_string(p.tags, ' ')),
          plainto_tsquery('simple', $2)
        ) AS rank
       FROM products p
       WHERE p.store_id = $1
         AND p.is_active = true
         ${categoryFilter}
         AND to_tsvector('simple', p.name_ar || ' ' || COALESCE(p.name_en, '') || ' ' || array_to_string(p.tags, ' '))
             @@ plainto_tsquery('simple', $2)
       ORDER BY rank DESC, p.name_ar
       LIMIT $3`,
      params
    );
  }

  private static async ilikeSearch(
    storeId: string,
    q: string,
    categoryId?: string,
    limit = 10
  ): Promise<Product[]> {
    const pattern = `%${q}%`;
    const params: unknown[] = [storeId, pattern, limit];
    const categoryFilter = categoryId
      ? `AND category_id = $${params.push(categoryId)}`
      : '';

    return query<Product>(
      `SELECT * FROM products
       WHERE store_id = $1
         AND is_active = true
         ${categoryFilter}
         AND (name_ar ILIKE $2 OR name_en ILIKE $2 OR $2 = ANY(tags::text[]))
       ORDER BY in_stock DESC, name_ar
       LIMIT $3`,
      params
    );
  }

  /**
   * Get all active categories for a store, ordered by sort_order.
   * Includes product_count via subquery.
   */
  static async getCategories(storeId: string): Promise<Category[]> {
    try {
      return query<Category>(
        `SELECT c.*,
          (SELECT COUNT(*) FROM products p
           WHERE p.category_id = c.id AND p.is_active = true AND p.store_id = c.store_id
          ) AS product_count
         FROM categories c
         WHERE c.store_id = $1 AND c.is_active = true
         ORDER BY c.sort_order ASC, c.name_ar ASC`,
        [storeId]
      );
    } catch (err) {
      logger.error({ err, storeId }, 'Failed to get categories');
      return [];
    }
  }

  /**
   * Get a single product by ID, including its category name.
   */
  static async getById(storeId: string, productId: string): Promise<Product | null> {
    try {
      return queryOne<Product>(
        `SELECT p.* FROM products p
         WHERE p.id = $1 AND p.store_id = $2 AND p.is_active = true`,
        [productId, storeId]
      );
    } catch (err) {
      logger.error({ err, storeId, productId }, 'Failed to get product by ID');
      return null;
    }
  }

  /**
   * Get all products in a category.
   */
  static async getByCategory(
    storeId: string,
    categoryId: string,
    limit = 15
  ): Promise<Product[]> {
    try {
      return query<Product>(
        `SELECT * FROM products
         WHERE store_id = $1 AND category_id = $2 AND is_active = true
         ORDER BY in_stock DESC, name_ar ASC
         LIMIT $3`,
        [storeId, categoryId, limit]
      );
    } catch (err) {
      logger.error({ err, storeId, categoryId }, 'Failed to get products by category');
      return [];
    }
  }

  /**
   * Check if a product is in stock with sufficient quantity.
   */
  static async checkStock(
    storeId: string,
    productId: string,
    quantity: number
  ): Promise<{ inStock: boolean; availableQty: number | null; product: Product | null }> {
    const product = await this.getById(storeId, productId);
    if (!product) return { inStock: false, availableQty: null, product: null };

    const availableQty = product.stock_qty ?? null;
    const inStock =
      product.in_stock &&
      (availableQty === null || availableQty >= quantity);

    // Log out-of-stock hit for analytics
    if (!inStock) {
      AnalyticsService.log('out_of_stock_hit', storeId, null, {
        product_id: productId,
        product_name_ar: product.name_ar,
        requested_qty: quantity,
        available_qty: availableQty,
      });
    }

    return { inStock, availableQty, product };
  }

  /**
   * Fetch alternative/substitute products for an out-of-stock item.
   */
  static async getAlternatives(storeId: string, productId: string): Promise<Product[]> {
    try {
      const product = await this.getById(storeId, productId);
      if (!product || !product.alternatives || product.alternatives.length === 0) {
        return [];
      }

      // Fetch the alternatives that are in stock
      return query<Product>(
        `SELECT * FROM products
         WHERE store_id = $1
           AND id = ANY($2::uuid[])
           AND is_active = true
           AND in_stock = true
         LIMIT 3`,
        [storeId, product.alternatives]
      );
    } catch (err) {
      logger.error({ err, storeId, productId }, 'Failed to get alternatives');
      return [];
    }
  }

  /**
   * Get popular products (most ordered) or recent additions if no order data.
   */
  static async getPopular(storeId: string, limit = 8): Promise<Product[]> {
    try {
      return query<Product>(
        `SELECT * FROM products
         WHERE store_id = $1 AND is_active = true AND in_stock = true
         ORDER BY created_at DESC
         LIMIT $2`,
        [storeId, limit]
      );
    } catch (err) {
      logger.error({ err, storeId }, 'Failed to get popular products');
      return [];
    }
  }
}
