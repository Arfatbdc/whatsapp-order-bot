import { ToolContext } from '../types';
import { ProductService } from '../services/product';
import { CartService } from '../services/cart';
import { PromotionService } from '../services/promotion';
import { OrderService } from '../services/order';
import { SubscriptionService } from '../services/subscription';
import {
  formatProductList,
  formatProductDetails,
  formatCategoryList,
  formatPrice,
  formatUnit,
} from '../utils/formatters';
import { logger } from '../utils/logger';

/**
 * Dispatches AI tool calls to the appropriate service methods.
 * Returns plain objects that the AI receives as tool_result.
 *
 * Day 3: product catalog tools fully implemented.
 * Day 4: cart tools fully implemented.
 */
export class ToolRouter {
  private context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
  }

  async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<unknown> {
    logger.debug({ toolName, toolInput }, 'Executing tool');

    try {
      switch (toolName) {

        // ── Store Info ────────────────────────────────────────────────────────
        case 'get_store_info':
          return {
            success: true,
            note: 'Store info is already in your system prompt. Use it to answer the customer.',
          };

        // ── Product Catalog ───────────────────────────────────────────────────
        case 'search_products':
          return this.searchProducts(toolInput);

        case 'browse_categories':
          return this.browseCategories();

        case 'get_product_details':
          return this.getProductDetails(toolInput);

        case 'check_stock':
          return this.checkStock(toolInput);

        // ── Cart ──────────────────────────────────────────────────────────────
        case 'add_to_cart':
          return this.addToCart(toolInput);

        case 'remove_from_cart':
          return this.removeFromCart(toolInput);

        case 'update_cart_quantity':
          return this.updateCartQuantity(toolInput);

        case 'view_cart':
          return this.viewCart();

        case 'clear_cart':
          return this.clearCart();

        // ── Day 6: Promotions ─────────────────────────────────────────────────
        case 'get_active_promotions':
          return this.getActivePromotions();

        case 'apply_promo_code':
          return this.applyPromoCode(toolInput);

        // ── Day 9: Subscriptions & Reorder ────────────────────────────────────
        case 'reorder_last_order':
          return this.reorderLastOrder();

        case 'get_subscriptions':
          return this.getSubscriptions();

        case 'create_subscription':
          return this.createSubscription(toolInput);

        case 'manage_subscription':
          return this.manageSubscription(toolInput);

        default:
          logger.warn({ toolName }, 'Unknown tool called');
          return { error: `Unknown tool: ${toolName}` };
      }
    } catch (err) {
      logger.error({ err, toolName }, 'Tool execution failed');
      return {
        error: 'tool_execution_failed',
        message_ar: 'عذراً، حصل خطأ تقني.',
        message_en: 'A technical error occurred.',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRODUCT TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  private async searchProducts(input: Record<string, unknown>): Promise<unknown> {
    const q = String(input.query || '').trim();
    if (!q) {
      return { success: false, error: 'query_required', message: 'Please provide a search term.' };
    }

    const rawLimit = input.limit;
    const parsedLimit =
      typeof rawLimit === 'number' ? rawLimit : Number(String(rawLimit ?? '').trim());
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 10;

    const { products, total } = await ProductService.search(
      this.context.storeId,
      q,
      { categoryId: input.category_id as string | undefined, limit }
    );

    if (total === 0) {
      return {
        success: true,
        found: 0,
        message_ar: `عذراً، لم أجد منتجات تطابق "${q}". ممكن تعطيني اسم ثاني أو أعرض لك الأقسام المتوفرة؟`,
        message_en: `Sorry, no products found matching "${q}". Try a different name or browse categories?`,
      };
    }

    const lang = this.context.language;
    const formatted = formatProductList(products, lang);

    return {
      success: true,
      found: total,
      display: formatted,
      products: products.map((p) => ({
        id: p.id,
        name: lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar),
        price: p.price,
        price_display: formatPrice(p.price, lang),
        unit: formatUnit(p.unit, lang),
        in_stock: p.in_stock,
        category_id: p.category_id,
      })),
    };
  }

  private async browseCategories(): Promise<unknown> {
    const categories = await ProductService.getCategories(this.context.storeId);

    if (categories.length === 0) {
      return {
        success: true,
        found: 0,
        message_ar: 'لا توجد أقسام متاحة حالياً.',
        message_en: 'No categories available at the moment.',
      };
    }

    const lang = this.context.language;
    const formatted = formatCategoryList(categories, lang);

    return {
      success: true,
      found: categories.length,
      display: formatted,
      categories: categories.map((c) => ({
        id: c.id,
        name: lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar),
        product_count: c.product_count || 0,
      })),
    };
  }

  private async getProductDetails(input: Record<string, unknown>): Promise<unknown> {
    const productId = String(input.product_id || '').trim();
    if (!productId) return { success: false, error: 'product_id_required' };

    const product = await ProductService.getById(this.context.storeId, productId);
    if (!product) {
      return { success: false, error: 'not_found', message_ar: 'المنتج غير موجود.', message_en: 'Product not found.' };
    }

    const lang = this.context.language;
    const display = formatProductDetails(product, lang);

    let alternatives: unknown[] = [];
    if (!product.in_stock) {
      const alts = await ProductService.getAlternatives(this.context.storeId, productId);
      alternatives = alts.map((a) => ({
        id: a.id,
        name: lang === 'ar' ? a.name_ar : (a.name_en || a.name_ar),
        price_display: formatPrice(a.price, lang),
        in_stock: a.in_stock,
      }));
    }

    return {
      success: true,
      display,
      product: {
        id: product.id,
        name: lang === 'ar' ? product.name_ar : (product.name_en || product.name_ar),
        price: product.price,
        price_display: formatPrice(product.price, lang),
        unit: formatUnit(product.unit, lang),
        in_stock: product.in_stock,
        stock_qty: product.stock_qty,
      },
      alternatives,
    };
  }

  private async checkStock(input: Record<string, unknown>): Promise<unknown> {
    const productId = String(input.product_id || '').trim();
    const quantity = Number(input.quantity) || 1;

    const { inStock, availableQty, product } = await ProductService.checkStock(
      this.context.storeId,
      productId,
      quantity
    );

    if (!product) return { success: false, error: 'not_found' };

    const lang = this.context.language;
    const name = lang === 'ar' ? product.name_ar : (product.name_en || product.name_ar);

    return {
      success: true,
      product_id: productId,
      name,
      in_stock: inStock,
      requested_qty: quantity,
      available_qty: availableQty,
      message_ar: inStock ? `✅ ${name} متوفر` : `❌ ${name} غير متوفر بالكمية المطلوبة`,
      message_en: inStock ? `✅ ${name} is in stock` : `❌ ${name} is not available in the requested quantity`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CART TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  private async addToCart(input: Record<string, unknown>): Promise<unknown> {
    const productId = String(input.product_id || '').trim();
    const quantity  = Math.max(0.1, parseFloat(String(input.quantity || 1)));
    const specialInstructions = input.special_instructions ? String(input.special_instructions).trim() : undefined;
    const lang      = this.context.language;

    if (!productId) {
      return { success: false, error: 'product_id_required', message: 'product_id is required' };
    }

    // Fetch product to validate it exists and get its details
    const product = await ProductService.getById(this.context.storeId, productId);
    if (!product) {
      return { success: false, error: 'not_found', message_ar: 'الصنف غير موجود.', message_en: 'Menu item not found.' };
    }

    if (!product.in_stock) {
      return {
        success: false,
        error: 'out_of_stock',
        message_ar: `عذراً، ${product.name_ar} غير متوفر حالياً.`,
        message_en: `Sorry, ${product.name_en || product.name_ar} is not available right now.`,
      };
    }

    const cart = await CartService.addItem(this.context.storeId, this.context.customerId, product, quantity, specialInstructions);
    const name  = lang === 'ar' ? product.name_ar : (product.name_en || product.name_ar);
    const noteText = specialInstructions ? (lang === 'ar' ? ` (${specialInstructions})` : ` (${specialInstructions})`) : '';

    return {
      success: true,
      message_ar: `✅ تمت إضافة ${name}${noteText} للطلب.`,
      message_en: `✅ Added ${name}${noteText} to your order.`,
      cart: {
        item_count: cart.items.length,
        subtotal: parseFloat(String(cart.subtotal)).toFixed(2),
        subtotal_display: formatPrice(cart.subtotal, lang),
      },
    };
  }

  private async removeFromCart(input: Record<string, unknown>): Promise<unknown> {
    const productId = String(input.product_id || '').trim();
    const lang = this.context.language;

    if (!productId) {
      return { success: false, error: 'product_id_required' };
    }

    const cart = await CartService.removeItem(this.context.storeId, this.context.customerId, productId);

    return {
      success: true,
      message_ar: '✅ تم حذف المنتج من السلة.',
      message_en: '✅ Item removed from cart.',
      cart: {
        item_count: cart.items.length,
        subtotal_display: formatPrice(cart.subtotal, lang),
      },
    };
  }

  private async updateCartQuantity(input: Record<string, unknown>): Promise<unknown> {
    const productId = String(input.product_id || '').trim();
    const quantity  = parseFloat(String(input.quantity || 0));
    const lang = this.context.language;

    if (!productId) return { success: false, error: 'product_id_required' };
    if (isNaN(quantity)) return { success: false, error: 'invalid_quantity' };

    const cart = await CartService.setQuantity(
      this.context.storeId,
      this.context.customerId,
      productId,
      quantity
    );

    return {
      success: true,
      message_ar: quantity <= 0 ? '✅ تم حذف المنتج.' : `✅ تم تحديث الكمية إلى ${quantity}.`,
      message_en: quantity <= 0 ? '✅ Item removed.' : `✅ Quantity updated to ${quantity}.`,
      cart: {
        item_count: cart.items.length,
        subtotal_display: formatPrice(cart.subtotal, lang),
      },
    };
  }

  private async viewCart(): Promise<unknown> {
    const lang = this.context.language;

    const cart = await CartService.getOrCreate(this.context.storeId, this.context.customerId);

    if (cart.items.length === 0) {
      return {
        success: true,
        empty: true,
        message_ar: '🍽️ طلبك فارغ حالياً.',
        message_en: '🍽️ Your order is currently empty.',
      };
    }

    const subtotal = parseFloat(String(cart.subtotal));
    const items = cart.items.map((item) => ({
      product_id: item.product_id,
      name: lang === 'ar' ? item.name_ar : (item.name_en || item.name_ar),
      quantity: item.quantity,
      unit: formatUnit(item.unit, lang),
      price_display: formatPrice(item.price, lang),
      subtotal_display: formatPrice(item.subtotal, lang),
      special_instructions: item.special_instructions || null,
    }));

    return {
      success: true,
      empty: false,
      items,
      subtotal_display: formatPrice(subtotal, lang),
      message_ar: `🍽️ طلبك يحتوي على ${cart.items.length} صنف — المجموع: ${formatPrice(subtotal, 'ar')}`,
      message_en: `🍽️ Your order has ${cart.items.length} item(s) — Subtotal: ${formatPrice(subtotal, 'en')}`,
    };
  }

  private async clearCart(): Promise<unknown> {
    await CartService.clear(this.context.storeId, this.context.customerId);
    return {
      success: true,
      message_ar: '✅ تم مسح طلبك.',
      message_en: '✅ Your order has been cleared.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DAY 9: SUBSCRIPTIONS & REORDER TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  private async reorderLastOrder(): Promise<unknown> {
    const lang = this.context.language;

    const lastOrder = await OrderService.getLastOrder(this.context.storeId, this.context.customerId);
    if (!lastOrder || !lastOrder.items?.length) {
      return {
        success: false,
        message_ar: 'لا يوجد طلب سابق لإعادته.',
        message_en: 'No previous order found to reorder.',
      };
    }

    // Add each item from last order back to cart
    let addedCount = 0;
    for (const item of lastOrder.items) {
      try {
        const product = await ProductService.getById(this.context.storeId, item.product_id);
        if (product && product.in_stock) {
          await CartService.addItem(this.context.storeId, this.context.customerId, product, item.quantity);
          addedCount++;
        }
      } catch {
        // Item may no longer exist — skip it
      }
    }

    if (addedCount === 0) {
      return {
        success: false,
        message_ar: 'عذراً، منتجات طلبك السابق غير متوفرة حالياً.',
        message_en: 'Sorry, the items from your last order are currently unavailable.',
      };
    }

    return {
      success: true,
      added_items: addedCount,
      total_items: lastOrder.items.length,
      message_ar: `✅ تمت إضافة ${addedCount} صنف من طلبك السابق #${lastOrder.order_number}.`,
      message_en: `✅ Added ${addedCount} item(s) from your last order #${lastOrder.order_number}.`,
    };
  }

  private async getSubscriptions(): Promise<unknown> {
    const lang = this.context.language;
    const subs = await SubscriptionService.getByCustomer(this.context.storeId, this.context.customerId);

    if (!subs.length) {
      return {
        success: true,
        found: 0,
        message_ar: 'لا يوجد لديك اشتراكات نشطة حالياً.',
        message_en: 'You have no active subscriptions.',
      };
    }

    const formatted = subs.map((s: Record<string, unknown>) => {
      const freqMap: Record<string, { ar: string; en: string }> = {
        weekly: { ar: 'أسبوعي', en: 'Weekly' },
        biweekly: { ar: 'كل أسبوعين', en: 'Biweekly' },
        monthly: { ar: 'شهري', en: 'Monthly' },
      };
      const freq = freqMap[String(s.frequency)] || { ar: String(s.frequency), en: String(s.frequency) };
      const nextDate = s.next_delivery ? new Date(String(s.next_delivery)).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-SA') : '—';
      return {
        id: s.id,
        frequency: lang === 'ar' ? freq.ar : freq.en,
        delivery_day: s.delivery_day,
        next_delivery: nextDate,
        status: s.status,
        items_count: Array.isArray(s.items) ? s.items.length : 0,
      };
    });

    return {
      success: true,
      found: subs.length,
      subscriptions: formatted,
      message_ar: `🔄 اشتراكاتك النشطة (${subs.length}):`,
      message_en: `🔄 Your active subscriptions (${subs.length}):`,
    };
  }

  private async createSubscription(input: Record<string, unknown>): Promise<unknown> {
    const lang = this.context.language;
    const frequency = String(input.frequency || 'weekly') as 'weekly' | 'biweekly' | 'monthly';
    const delivery_day = String(input.delivery_day || 'saturday').toLowerCase();

    // Get current cart items
    const cart = await CartService.getOrCreate(this.context.storeId, this.context.customerId);
    if (!cart.items.length) {
      return {
        success: false,
        message_ar: '🍽️ طلبك فارغ. أضف أصناف أولاً لإنشاء اشتراك.',
        message_en: '🍽️ Your order is empty. Add items first to create a subscription.',
      };
    }

    const sub = await SubscriptionService.create({
      storeId: this.context.storeId,
      customerId: this.context.customerId,
      items: cart.items,
      frequency,
      delivery_day,
    });

    const freqAr = frequency === 'weekly' ? 'أسبوعي' : frequency === 'biweekly' ? 'كل أسبوعين' : 'شهري';
    const freqEn = frequency.charAt(0).toUpperCase() + frequency.slice(1);

    return {
      success: true,
      subscription_id: (sub as Record<string, unknown>)?.id,
      message_ar: `✅ تم إنشاء اشتراكك ${freqAr} بنجاح! سيتم تكرار طلبك تلقائياً.`,
      message_en: `✅ ${freqEn} subscription created! Your order will repeat automatically.`,
    };
  }

  private async manageSubscription(input: Record<string, unknown>): Promise<unknown> {
    const lang = this.context.language;
    const subscriptionId = String(input.subscription_id || '').trim();
    const action = String(input.action || '').trim() as 'pause' | 'resume' | 'cancel';

    if (!subscriptionId || !['pause', 'resume', 'cancel'].includes(action)) {
      return { success: false, message_ar: 'بيانات غير صحيحة.', message_en: 'Invalid parameters.' };
    }

    const result = await SubscriptionService.manage(subscriptionId, this.context.customerId, action);
    if (!result) {
      return { success: false, message_ar: 'الاشتراك غير موجود.', message_en: 'Subscription not found.' };
    }

    const msgMap: Record<string, { ar: string; en: string }> = {
      pause:  { ar: '⏸️ تم إيقاف اشتراكك مؤقتاً.',  en: '⏸️ Subscription paused.'  },
      resume: { ar: '▶️ تم استئناف اشتراكك.',         en: '▶️ Subscription resumed.'  },
      cancel: { ar: '❌ تم إلغاء اشتراكك.',           en: '❌ Subscription cancelled.' },
    };

    return {
      success: true,
      message_ar: msgMap[action].ar,
      message_en: msgMap[action].en,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DAY 6: PROMOTION TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  private async getActivePromotions(): Promise<unknown> {
    const lang = this.context.language;
    const promos = await PromotionService.getActivePromotions(this.context.storeId);

    if (promos.length === 0) {
      return {
        success: true,
        found: 0,
        message_ar: 'لا توجد عروض نشطة حالياً.',
        message_en: 'No active promotions at the moment.',
      };
    }

    const formatted = promos.map((p) => {
      const title = lang === 'ar' ? (p.title_ar || p.code || '') : (p.title_en || p.code || '');
      let desc = '';
      if (p.type === 'percentage') desc = lang === 'ar' ? `خصم ${p.discount_value}%` : `${p.discount_value}% off`;
      else if (p.type === 'fixed') desc = lang === 'ar' ? `خصم ${p.discount_value} ر.س` : `${p.discount_value} SAR off`;
      else if (p.type === 'free_delivery') desc = lang === 'ar' ? 'توصيل مجاني' : 'Free delivery';
      else if (p.type === 'buy_x_get_y') desc = lang === 'ar' ? 'اشترِ واحصل مجاناً' : 'Buy and get free';
      const validUntil = p.valid_until
        ? new Date(p.valid_until).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-SA')
        : null;
      return { code: p.code, title, description: desc, valid_until: validUntil };
    });

    return {
      success: true,
      found: promos.length,
      promotions: formatted,
      message_ar: `🎉 العروض المتاحة (${promos.length}):`,
      message_en: `🎉 Available offers (${promos.length}):`,
    };
  }

  private async applyPromoCode(input: Record<string, unknown>): Promise<unknown> {
    const code = String(input.code || '').trim();
    const lang = this.context.language;

    if (!code) {
      return {
        success: false,
        message_ar: 'الرجاء إدخال كود الخصم.',
        message_en: 'Please provide a promo code.',
      };
    }

    // Get current cart subtotal
    const cart = await CartService.getOrCreate(this.context.storeId, this.context.customerId);
    const subtotal = parseFloat(String(cart.subtotal));

    if (subtotal === 0) {
      return {
        success: false,
        message_ar: '🛒 السلة فارغة. أضف منتجات أولاً.',
        message_en: '🛒 Cart is empty. Add items first.',
      };
    }

    const result = await PromotionService.validateCode(this.context.storeId, code, subtotal);

    if (!result.valid) {
      return {
        success: false,
        message_ar: result.message_ar,
        message_en: result.message_en,
      };
    }

    // Apply to cart
    const applied = await PromotionService.applyPromotion(
      this.context.storeId,
      cart.id,
      result
    );

    if (!applied) {
      return {
        success: false,
        message_ar: 'حصل خطأ في تطبيق الكود. حاول مرة ثانية.',
        message_en: 'Failed to apply promo code. Please try again.',
      };
    }

    const newSubtotal = subtotal - result.discountAmount;

    return {
      success: true,
      discount_amount: result.discountAmount,
      discount_display: formatPrice(result.discountAmount, lang),
      new_subtotal: newSubtotal,
      new_subtotal_display: formatPrice(newSubtotal, lang),
      is_free_delivery: result.isFreeDelivery,
      message_ar: result.message_ar,
      message_en: result.message_en,
    };
  }
}
