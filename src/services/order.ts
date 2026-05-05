/**
 * OrderService — creates, reads, and cancels orders.
 *
 * createFromCart() runs in a DB transaction:
 *   1. Read cart rows
 *   2. Calculate subtotal / VAT / total
 *   3. INSERT into orders
 *   4. DELETE from carts
 *   5. UPDATE customer stats
 *   6. COMMIT
 *
 * VAT rule: prices are stored VAT-inclusive (ZATCA 15%).
 * vat_amount = subtotal × rate / (1 + rate)
 */

import { getPool, queryOne, query } from '../database/connection';
import { Order, OrderStatus, Store, CartItem } from '../types';
import { logger } from '../utils/logger';
import { invalidateCartCache } from '../database/redis';
import { AnalyticsService } from './analytics';
import { PromotionService } from './promotion';
import { PaymentService } from './payment';

// ─── Params ────────────────────────────────────────────────────────────────

export interface CreateOrderParams {
  storeId: string;
  customerId: string;
  deliveryAddress: {
    address: string;
    zone: string;
    label?: string;
    is_default?: boolean;
  };
  paymentMethod: string;
  deliveryFee: number;
  notes?: string;
}

// ─── Service ───────────────────────────────────────────────────────────────

export const OrderService = {

  /**
   * Create an order from the customer's current cart (within a transaction).
   * Clears the cart and updates customer stats atomically.
   * Returns null on any failure (transaction is rolled back).
   */
  async createFromCart(params: CreateOrderParams, store: Store): Promise<Order | null> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      // 1. Load cart
      const cartRes = await client.query(
        'SELECT * FROM carts WHERE store_id = $1 AND customer_id = $2',
        [params.storeId, params.customerId]
      );
      const cartRow = cartRes.rows[0];
      const items: CartItem[] = cartRow?.items ?? [];

      if (items.length === 0) throw new Error('Cart is empty');

      // 2. Financials
      const subtotal   = items.reduce((s, i) => s + parseFloat(String(i.subtotal)), 0);
      const discount   = parseFloat(String(cartRow?.discount)) || 0;
      const vatRate    = parseFloat(String(store.vat_rate))    || 0.15;
      const vatAmount  = subtotal * vatRate / (1 + vatRate);
      const total      = subtotal - discount + params.deliveryFee;

      // 3. Insert order
      const orderRes = await client.query<Order & { order_number: number }>(
        `INSERT INTO orders (
           store_id, customer_id,
           items, subtotal, vat_amount, delivery_fee, discount, total,
           status, payment_method, payment_status,
           delivery_address, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,'pending',$10,$11)
         RETURNING *`,
        [
          params.storeId,
          params.customerId,
          JSON.stringify(items),
          subtotal.toFixed(2),
          vatAmount.toFixed(2),
          params.deliveryFee.toFixed(2),
          discount.toFixed(2),
          total.toFixed(2),
          params.paymentMethod,
          JSON.stringify(params.deliveryAddress),
          params.notes || null,
        ]
      );
      const order = orderRes.rows[0];

      // 4. Clear cart
      await client.query(
        'DELETE FROM carts WHERE store_id = $1 AND customer_id = $2',
        [params.storeId, params.customerId]
      );

      // 5. Update customer stats
      await client.query(
        `UPDATE customers
         SET total_orders  = total_orders + 1,
             total_spent   = total_spent  + $1,
             last_order_at = NOW(),
             updated_at    = NOW()
         WHERE id = $2`,
        [total, params.customerId]
      );

      await client.query('COMMIT');
      logger.info(
        { orderId: order.id, orderNumber: order.order_number, total },
        'Order created'
      );

      // ── Invalidate Redis cart cache so next getOrCreate creates a fresh cart
      invalidateCartCache(params.customerId).catch((err) =>
        logger.warn({ err, customerId: params.customerId }, 'Failed to invalidate cart cache after order')
      );

      // ── Post-commit side-effects (fire-and-forget) ──────────────────────
      // Increment promo usage if a code was applied
      if (cartRow?.promo_code) {
        try {
          const promoRow = await queryOne<{ id: string }>(
            `SELECT id FROM promotions WHERE store_id = $1 AND UPPER(code) = UPPER($2)`,
            [params.storeId, cartRow.promo_code]
          );
          if (promoRow) PromotionService.incrementUsage(promoRow.id);
        } catch { /* ignore */ }
      }

      // Log analytics event for COD orders (online payment is logged on callback)
      if (params.paymentMethod === 'cod' || params.paymentMethod === 'cash') {
        AnalyticsService.log('order_placed', params.storeId, params.customerId, {
          order_id: order.id,
          order_number: order.order_number,
          total,
          payment_method: params.paymentMethod,
          item_count: items.length,
        });
      }

      return order;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, storeId: params.storeId, customerId: params.customerId }, 'OrderService.createFromCart failed');
      return null;
    } finally {
      client.release();
    }
  },

  /**
   * Generate a Moyasar payment link for an order.
   * Returns null for COD orders or when payment service is unavailable.
   */
  async generatePaymentLink(
    order: Order,
    customerPhone: string,
    baseUrl: string
  ): Promise<string | null> {
    if (order.payment_method === 'cod' || order.payment_method === 'cash') {
      return null; // No link for cash on delivery
    }

    const callbackUrl = `${baseUrl}/payment/callback`;
    const result = await PaymentService.createPaymentLink(
      order.id,
      order.order_number,
      order.total,
      customerPhone,
      `طلب #${order.order_number} — SmartOrder`,
      callbackUrl
    );

    if (result) {
      // Save the payment reference so we can check status later
      await queryOne(
        `UPDATE orders SET payment_reference = $1, updated_at = NOW() WHERE id = $2`,
        [result.paymentId, order.id]
      );
    }

    return result?.paymentUrl ?? null;
  },

  /** Get one order by its UUID (store-scoped). */
  async getById(storeId: string, orderId: string): Promise<Order | null> {
    return queryOne<Order>(
      'SELECT * FROM orders WHERE id = $1 AND store_id = $2',
      [orderId, storeId]
    );
  },

  /** Get the most recent order for a customer. */
  async getLastOrder(storeId: string, customerId: string): Promise<Order | null> {
    return queryOne<Order>(
      `SELECT * FROM orders
       WHERE store_id = $1 AND customer_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [storeId, customerId]
    );
  },

  /** Get recent orders for a customer. */
  async getCustomerOrders(storeId: string, customerId: string, limit = 5): Promise<Order[]> {
    return query<Order>(
      `SELECT * FROM orders
       WHERE store_id = $1 AND customer_id = $2
       ORDER BY created_at DESC LIMIT $3`,
      [storeId, customerId, limit]
    );
  },

  /**
   * Cancel an order — only allowed when status is 'pending' or 'confirmed'.
   * Returns { success, reason } where reason is 'ok' | 'not_found' | 'too_late'.
   */
  async cancelOrder(
    storeId: string,
    orderId: string,
    customerId: string,
    reason?: string
  ): Promise<{ success: boolean; reason: string }> {
    const order = await queryOne<Order>(
      'SELECT * FROM orders WHERE id = $1 AND store_id = $2 AND customer_id = $3',
      [orderId, storeId, customerId]
    );

    if (!order) return { success: false, reason: 'not_found' };
    if (order.status !== 'pending' && order.status !== 'confirmed') {
      return { success: false, reason: 'too_late' };
    }

    await queryOne(
      `UPDATE orders
       SET status = 'cancelled', cancelled_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason || 'Customer requested cancellation', orderId]
    );

    logger.info({ orderId, customerId }, 'Order cancelled');

    // Fire analytics event
    AnalyticsService.log('order_cancelled', storeId, customerId, {
      order_id: orderId,
      order_number: order.order_number,
      reason: reason || 'Customer requested cancellation',
    });

    return { success: true, reason: 'ok' };
  },

  /** Human-readable order status string in Arabic or English. */
  formatStatus(status: OrderStatus, lang: string): string {
    const map: Record<OrderStatus, { ar: string; en: string }> = {
      pending:          { ar: 'تم استلام طلبك ⏳',       en: 'Order received ⏳'        },
      confirmed:        { ar: 'تم تأكيد طلبك ✅',        en: 'Order confirmed ✅'       },
      preparing:        { ar: 'جاري تجهيز طلبك 📦',      en: 'Preparing your order 📦' },
      out_for_delivery: { ar: 'طلبك في الطريق 🚗',       en: 'Out for delivery 🚗'      },
      delivered:        { ar: 'تم التوصيل ✅ شكراً لك!', en: 'Delivered ✅ Thank you!'  },
      cancelled:        { ar: 'تم إلغاء الطلب ❌',       en: 'Order cancelled ❌'       },
    };
    const entry = map[status];
    if (!entry) return status;
    return lang === 'ar' ? entry.ar : entry.en;
  },
};
