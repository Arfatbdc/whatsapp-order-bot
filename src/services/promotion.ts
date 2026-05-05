/**
 * PromotionService — promo code validation and application.
 *
 * Supports:
 *   - percentage  : X% off subtotal
 *   - fixed       : flat SAR amount off
 *   - free_delivery: sets delivery fee to 0
 *   - buy_x_get_y : not yet implemented (returns false)
 *
 * Prices are always VAT-inclusive, so discounts apply to the subtotal
 * (which already includes VAT) rather than adding a separate tax line.
 */

import { query, queryOne } from '../database/connection';
import { Promotion, PromoType } from '../types';
import { logger } from '../utils/logger';

export interface PromoResult {
  valid: boolean;
  promotion: Promotion | null;
  discountAmount: number;      // SAR amount to subtract from subtotal
  isFreeDelivery: boolean;
  message_ar: string;
  message_en: string;
}

export const PromotionService = {
  /**
   * Validate a promo code and calculate the discount.
   * Does NOT modify the cart — call applyPromotion() to do that.
   */
  async validateCode(
    storeId: string,
    code: string,
    subtotal: number
  ): Promise<PromoResult> {
    const invalid = (ar: string, en: string): PromoResult => ({
      valid: false,
      promotion: null,
      discountAmount: 0,
      isFreeDelivery: false,
      message_ar: ar,
      message_en: en,
    });

    if (!code?.trim()) {
      return invalid('الرجاء إدخال كود الخصم.', 'Please enter a promo code.');
    }

    let promo: Promotion | null = null;
    try {
      promo = await queryOne<Promotion>(
        `SELECT * FROM promotions
         WHERE store_id = $1
           AND UPPER(code) = UPPER($2)
           AND is_active = true
           AND (valid_from IS NULL OR valid_from <= NOW())
           AND (valid_until IS NULL OR valid_until >= NOW())`,
        [storeId, code.trim()]
      );
    } catch (err) {
      logger.error({ err, storeId, code }, 'PromotionService DB error');
      return invalid('حصل خطأ تقني.', 'A technical error occurred.');
    }

    if (!promo) {
      return invalid(
        `كود الخصم "${code}" غير صالح أو منتهي الصلاحية.`,
        `Promo code "${code}" is invalid or expired.`
      );
    }

    // Check max uses
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
      return invalid(
        'كود الخصم استُنفد ولم يعد متاحاً.',
        'This promo code has reached its usage limit.'
      );
    }

    // Check minimum order
    const minOrder = parseFloat(String(promo.min_order ?? 0));
    if (subtotal < minOrder) {
      return invalid(
        `الحد الأدنى للطلب لاستخدام هذا الكود هو ${minOrder.toFixed(2)} ر.س.`,
        `Minimum order of ${minOrder.toFixed(2)} SAR required for this code.`
      );
    }

    // Calculate discount
    const discountValue = parseFloat(String(promo.discount_value ?? 0));
    let discountAmount  = 0;
    let isFreeDelivery  = false;

    switch (promo.type as PromoType) {
      case 'percentage':
        discountAmount = Math.min(subtotal * (discountValue / 100), subtotal);
        break;
      case 'fixed':
        discountAmount = Math.min(discountValue, subtotal);
        break;
      case 'free_delivery':
        isFreeDelivery = true;
        discountAmount = 0;
        break;
      case 'buy_x_get_y':
        // Advanced logic — not yet implemented; treat as zero discount for now
        discountAmount = 0;
        break;
    }

    discountAmount = Math.round(discountAmount * 100) / 100;

    const title = promo.title_ar ?? `خصم ${discountValue}`;
    const titleEn = promo.title_en ?? `Discount ${discountValue}`;

    return {
      valid: true,
      promotion: promo,
      discountAmount,
      isFreeDelivery,
      message_ar: isFreeDelivery
        ? `✅ تم تطبيق "${title}" — توصيل مجاني!`
        : `✅ تم تطبيق "${title}" — وفرت ${discountAmount.toFixed(2)} ر.س`,
      message_en: isFreeDelivery
        ? `✅ "${titleEn}" applied — free delivery!`
        : `✅ "${titleEn}" applied — you save ${discountAmount.toFixed(2)} SAR`,
    };
  },

  /**
   * Apply a validated promotion to a cart row (writes to DB).
   * Returns the applied promo result or null on failure.
   */
  async applyPromotion(
    storeId: string,
    cartId: string,
    promoResult: PromoResult
  ): Promise<boolean> {
    if (!promoResult.valid || !promoResult.promotion) return false;

    try {
      await queryOne(
        `UPDATE carts
         SET promo_code = $1,
             discount   = $2,
             updated_at = NOW()
         WHERE id = $3 AND store_id = $4`,
        [
          promoResult.promotion.code,
          promoResult.discountAmount,
          cartId,
          storeId,
        ]
      );
      return true;
    } catch (err) {
      logger.error({ err, cartId }, 'PromotionService.applyPromotion failed');
      return false;
    }
  },

  /**
   * Increment the usage counter after a successful order.
   * Fire-and-forget (never throws).
   */
  incrementUsage(promoId: string): void {
    query(
      `UPDATE promotions SET used_count = used_count + 1 WHERE id = $1`,
      [promoId]
    ).catch((err) => logger.warn({ err, promoId }, 'Failed to increment promo usage'));
  },

  /**
   * Get all active promotions for a store (for display purposes).
   */
  async getActivePromotions(storeId: string): Promise<Promotion[]> {
    try {
      return await query<Promotion>(
        `SELECT * FROM promotions
         WHERE store_id = $1
           AND is_active = true
           AND (valid_from IS NULL OR valid_from <= NOW())
           AND (valid_until IS NULL OR valid_until >= NOW())
         ORDER BY created_at DESC`,
        [storeId]
      );
    } catch (err) {
      logger.error({ err, storeId }, 'PromotionService.getActivePromotions failed');
      return [];
    }
  },
};
