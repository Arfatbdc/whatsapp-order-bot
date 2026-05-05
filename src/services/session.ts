/**
 * Session Service — conversation flow state stored in Redis.
 *
 * Tracks WHERE the user is in the order flow so the backend
 * can route button/list clicks without calling the AI.
 */

import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import type { AIResponse } from '../types';

// ─── Types ─────────────────────────────────────────────────────────────────

export type FlowState =
  | 'idle'
  | 'main_menu'
  | 'search_mode'
  | 'browsing_categories'
  | 'browsing_products'
  | 'viewing_product'
  | 'entering_custom_qty'            // user tapped "كمية أخرى" — now waiting for typed number
  | 'waiting_special_instructions'   // first item added — waiting for special instructions choice
  | 'entering_special_instructions'  // user tapped "تعديل الطلب" — now typing instructions
  | 'cart_view'
  | 'removing_item'
  | 'entering_promo_code'             // user tapped "promo code" — typing code
  | 'modifying_cart_item'             // showing per-item +/- actions
  | 'selecting_saved_address'         // showing saved address list
  | 'checkout_zones'        // showing delivery zone list — waiting for zone button
  | 'checkout_address'      // zone selected — waiting for address text
  | 'checkout_payment'      // address received — waiting for payment method button
  | 'checkout_confirm';     // payment selected — waiting for confirm/cancel button

export interface SessionData {
  state: FlowState;
  // Category context
  categoryId?: string;
  categoryName?: string;
  // Product context (set when user views a product, used when they pick a qty)
  productId?: string;
  productName?: string;
  productPrice?: number;
  productUnit?: string;
  // Checkout context (accumulated through the checkout steps)
  checkoutZoneIndex?: number;
  checkoutZoneName?: string;
  checkoutDeliveryFee?: number;
  checkoutAddress?: string;
  checkoutPaymentMethod?: string;
  // Cart modification context
  modifyingProductId?: string;
  // Saved addresses (populated during checkout zone selection)
  checkoutSavedAddresses?: string[];
  // Last placed order (used for tracking without a DB round-trip)
  lastOrderId?: string;
  lastOrderNumber?: number;
  updatedAt: number;
}

/**
 * FlowResult — returned by every CatalogFlow / CheckoutFlow method.
 * Contains the WhatsApp response AND the session state patch to apply.
 */
export type FlowResult = {
  response: AIResponse;
  newState: Partial<SessionData>;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const SESSION_TTL_SECONDS = 60 * 30; // 30 minutes of inactivity
const sessionKey = (storeId: string, customerId: string) =>
  `session:${storeId}:${customerId}`;

// ─── Service ────────────────────────────────────────────────────────────────

export const SessionService = {
  async get(storeId: string, customerId: string): Promise<SessionData> {
    try {
      const raw = await getRedis().get(sessionKey(storeId, customerId));
      if (raw) return JSON.parse(raw) as SessionData;
    } catch (err) {
      logger.warn({ err }, 'Session.get failed — returning idle session');
    }
    return { state: 'idle', updatedAt: Date.now() };
  },

  async set(
    storeId: string,
    customerId: string,
    patch: Partial<SessionData>
  ): Promise<void> {
    try {
      const current = await this.get(storeId, customerId);
      const updated: SessionData = { ...current, ...patch, updatedAt: Date.now() };
      await getRedis().setex(
        sessionKey(storeId, customerId),
        SESSION_TTL_SECONDS,
        JSON.stringify(updated)
      );
    } catch (err) {
      logger.warn({ err }, 'Session.set failed — session not saved');
    }
  },

  async clear(storeId: string, customerId: string): Promise<void> {
    try {
      await getRedis().del(sessionKey(storeId, customerId));
    } catch (err) {
      logger.warn({ err }, 'Session.clear failed');
    }
  },
};
