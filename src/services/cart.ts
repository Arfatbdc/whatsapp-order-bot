/**
 * CartService — PostgreSQL-backed shopping cart with Redis cache.
 *
 * Golden Rule: Cart operations NEVER depend on AI.
 * This service is the single source of truth for cart state.
 *
 * Cart items are stored as JSONB in PostgreSQL.
 * Redis caches the full cart for fast reads (invalidated on every write).
 */

import { Cart, CartItem, Product, Store } from '../types';
import { queryOne } from '../database/connection';
import { cacheCart, getCachedCart, invalidateCartCache } from '../database/redis';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface CartSummary {
  cart: Cart;
  deliveryFee: number;
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
  isFreeDelivery: boolean;
}

// ═══════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════

export class CartService {
  /**
   * Get the active cart for a customer, or create one if it doesn't exist.
   * Tries Redis first, then PostgreSQL.
   */
  static async getOrCreate(storeId: string, customerId: string): Promise<Cart> {
    // 1. Try Redis cache
    const cached = await getCachedCart(customerId);
    if (cached) {
      const c = cached as Cart;
      c.items = parseItems(c.items);
      return c;
    }

    // 2. Try existing cart from DB
    let cart = await queryOne<Cart>(
      `SELECT * FROM carts
       WHERE store_id = $1 AND customer_id = $2 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [storeId, customerId]
    );

    // 3. Create a new cart if none found
    if (!cart) {
      cart = await queryOne<Cart>(
        `INSERT INTO carts (store_id, customer_id, items, subtotal, discount, expires_at)
         VALUES ($1, $2, '[]'::jsonb, 0, 0, NOW() + INTERVAL '24 hours')
         RETURNING *`,
        [storeId, customerId]
      );
    }

    if (!cart) throw new Error('Failed to get or create cart');

    cart = normalizeCart(cart);
    await cacheCart(customerId, cart);
    return cart;
  }

  /**
   * Add a product to the cart.
   * If the product already exists, its quantity is incremented.
   * If quantity results in 0 or less, the item is removed.
   */
  static async addItem(
    storeId: string,
    customerId: string,
    product: Product,
    quantity: number,
    specialInstructions?: string
  ): Promise<Cart> {
    if (quantity <= 0) throw new Error('Quantity must be > 0');

    const cart = await this.getOrCreate(storeId, customerId);

    const existingIdx = cart.items.findIndex(
      (i) => i.product_id === product.id &&
              (i.special_instructions || '') === (specialInstructions || '')
    );
    const productPrice = parseFloat(String(product.price));

    if (existingIdx >= 0) {
      // Update existing item (same product + same special instructions)
      const item = cart.items[existingIdx];
      item.quantity = parseFloat(String(item.quantity)) + quantity;
      item.subtotal = productPrice * item.quantity;
    } else {
      // Add new item — guard against null names from bad DB data
      cart.items.push({
        product_id: product.id,
        name_ar: product.name_ar || product.name_en || 'صنف',
        name_en: product.name_en || product.name_ar || 'Item',
        price: productPrice,
        quantity,
        unit: product.unit || 'portion',
        subtotal: productPrice * quantity,
        ...(specialInstructions ? { special_instructions: specialInstructions } : {}),
      });
    }

    recalcSubtotal(cart);
    return this.persist(storeId, customerId, cart);
  }

  /**
   * Remove a product from the cart entirely.
   */
  static async removeItem(
    storeId: string,
    customerId: string,
    productId: string
  ): Promise<Cart> {
    const cart = await this.getOrCreate(storeId, customerId);
    cart.items = cart.items.filter((i) => i.product_id !== productId);
    recalcSubtotal(cart);
    return this.persist(storeId, customerId, cart);
  }

  /**
   * Set the quantity of a cart item (absolute, not delta).
   * If quantity ≤ 0, removes the item.
   */
  static async setQuantity(
    storeId: string,
    customerId: string,
    productId: string,
    quantity: number
  ): Promise<Cart> {
    if (quantity <= 0) return this.removeItem(storeId, customerId, productId);

    const cart = await this.getOrCreate(storeId, customerId);
    const item = cart.items.find((i) => i.product_id === productId);
    if (!item) return cart;

    item.quantity = quantity;
    item.subtotal = parseFloat(String(item.price)) * quantity;
    recalcSubtotal(cart);
    return this.persist(storeId, customerId, cart);
  }

  /**
   * Empty the cart (keep the cart record, clear items).
   */
  static async clear(storeId: string, customerId: string): Promise<Cart> {
    const cart = await this.getOrCreate(storeId, customerId);
    cart.items = [];
    cart.subtotal = 0;
    cart.discount = 0;
    return this.persist(storeId, customerId, cart);
  }

  /**
   * Get a full cart summary including delivery fee and totals.
   */
  static async getSummary(
    storeId: string,
    customerId: string,
    store: Store
  ): Promise<CartSummary> {
    const cart = await this.getOrCreate(storeId, customerId);

    const subtotal = parseFloat(String(cart.subtotal));
    const discount = parseFloat(String(cart.discount ?? 0));
    const freeThreshold = parseFloat(String(store.free_delivery_above ?? 150));
    const isFreeDelivery = subtotal >= freeThreshold;
    const deliveryFee = isFreeDelivery ? 0 : parseFloat(String(store.delivery_fee ?? 10));
    const total = subtotal - discount + deliveryFee;
    const itemCount = cart.items.reduce((sum, item) => sum + parseFloat(String(item.quantity)), 0);

    return { cart, deliveryFee, subtotal, discount, total, itemCount, isFreeDelivery };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private static async persist(
    storeId: string,
    customerId: string,
    cart: Cart
  ): Promise<Cart> {
    let updated = await queryOne<Cart>(
      `UPDATE carts
       SET items      = $1::jsonb,
           subtotal   = $2,
           discount   = $3,
           expires_at = NOW() + INTERVAL '24 hours',
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [JSON.stringify(cart.items), cart.subtotal, cart.discount ?? 0, cart.id]
    );

    // Stale cart ID (e.g. cart was deleted after an order was placed but Redis
    // still had the old cart). Invalidate the cache and create a fresh cart row.
    if (!updated) {
      logger.warn(
        { storeId, customerId, cartId: cart.id },
        'CartService.persist: stale cart ID — creating fresh cart'
      );
      await invalidateCartCache(customerId);
      updated = await queryOne<Cart>(
        `INSERT INTO carts (store_id, customer_id, items, subtotal, discount, expires_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, NOW() + INTERVAL '24 hours')
         RETURNING *`,
        [storeId, customerId, JSON.stringify(cart.items), cart.subtotal, cart.discount ?? 0]
      );
      if (!updated) throw new Error('Failed to persist cart');
    }

    const result = normalizeCart(updated);
    await cacheCart(customerId, result);

    logger.debug(
      { customerId, items: result.items.length, subtotal: result.subtotal },
      'Cart persisted'
    );

    return result;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseItems(raw: unknown): CartItem[] {
  if (Array.isArray(raw)) return raw as CartItem[];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as CartItem[]; } catch { return []; }
  }
  return [];
}

function normalizeCart(cart: Cart): Cart {
  return {
    ...cart,
    items: parseItems(cart.items),
    subtotal: parseFloat(String(cart.subtotal ?? 0)),
    discount: parseFloat(String(cart.discount ?? 0)),
  };
}

function recalcSubtotal(cart: Cart): void {
  cart.subtotal = cart.items.reduce(
    (sum, item) => sum + parseFloat(String(item.subtotal)),
    0
  );
}
