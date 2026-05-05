/**
 * FALLBACK ROUTER — Backend-controlled responses.
 *
 * Golden Rule: AI = assistant, Backend = decision maker.
 *
 * This module handles messages WITHOUT calling the AI:
 *  - Greetings → interactive main menu
 *  - Browse/categories → interactive category list
 *  - Product search by keyword → interactive product list
 *  - Emergency fallback when AI completely fails
 *
 * Note: CatalogFlow is the PRIMARY handler. FallbackRouter is the SECONDARY
 * handler — called only when CatalogFlow returns null (no pattern matched).
 * Both delegate to CatalogFlow's methods to ensure consistent interactive UI.
 */

import { Store, Customer, AIResponse } from '../types';
import { CatalogFlow } from './catalogFlow';
import { ProductService } from '../services/product';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════
// INTENT PATTERNS
// ═══════════════════════════════════════════

// Greetings (whole-message match)
const GREETING_AR =
  /^(هلا|هلا هلا|السلام عليكم|وعليكم السلام|مرحبا|مرحباً|اهلا|أهلا|أهلاً|اهلاً|صباح الخير|مساء الخير|يهلا|يا هلا|هلا والله|كيفك|كيف حالك|اهلين|مرحبتين|مرحبتين|مرحب|يهلي|هاي|ما السلام|الله يهلاك)[؟?!.\s]*$/i;
const GREETING_EN =
  /^(hi|hello|hey|good morning|good evening|good afternoon|salam|salaam|yo|howdy|greetings|start)[?!.\s]*$/i;

// Browse / "show me categories"
const BROWSE_AR =
  /^(وش عندكم|ايش عندكم|ابي اشوف|ابغى اشوف|اشوف المنتجات|الاقسام|الأقسام|المنتجات|الكتالوج|عروض|ايش موجود|ايش عندك|ابي اتصفح|ابغى اتصفح|منيو|المنيو|قايمة|قائمة|الاكل|الوجبات|الاصناف|الأصناف|ايش عندكم اكل|ابي اشوف الاكل|الأكلات)[؟?.\s]*$/i;
const BROWSE_EN =
  /^(what do you (have|sell)|show me (products|categories)|browse|categories|products|catalog|what's available|what's in stock|menu|dishes|meals|food|what do you serve|what can i order)[?.\s]*$/i;

// Special request / custom order notes
const SPECIAL_REQUEST_AR =
  /^(بدون بصل|بدون ثوم|حار|حار زيادة|طهي جيد|اضافات|تعديل الطلب|ملاحظات)[؟?.\s]*$/i;

// Cart display
const CART_VIEW_AR = /^(سلتي|عرض السلة|اشوف سلتي|وش في السلة|السلة|شوف سلتي|كم في سلتي)[؟?.\s]*$/i;
const CART_VIEW_EN = /^(my cart|view cart|show cart|cart)[?.\s]*$/i;

// Order tracking
const ORDER_TRACK_AR = /^(وين طلبي|تتبع طلبي|تتبع الطلب|أين طلبي|متى يوصل|طلبي وين|تتبع)[؟?.\s]*$/i;
const ORDER_TRACK_EN = /^(track my order|where is my order|order status|track order)[?.\s]*$/i;

// Product search — strips command prefix then uses remainder as query
const SEARCH_PREFIXES_AR = [
  /^(?:أبي|ابي|أبغى|ابغى|بدي|أريد|اريد|عندكم|بكم|كم سعر|وش سعر|سعر|محتاج|احتاج|اشتري|ابا|اجيب|حابب|حاب|ودي|ودّي|أودي|اودي|بغيت|ابغيت)\s+/i,
];
const SEARCH_PREFIXES_EN = [
  /^(?:i want|i need|do you have|how much (?:is|for)|price of|looking for|find me|get me|buy|add|search for|search|show me|got any)\s+/i,
];

// ═══════════════════════════════════════════
// FALLBACK ROUTER CLASS
// ═══════════════════════════════════════════

export class FallbackRouter {
  private storeId: string;
  private language: string;

  constructor(storeId: string, language: string) {
    this.storeId = storeId;
    this.language = language;
  }

  /**
   * Check if this message should be handled entirely by the backend
   * (no AI call needed). Returns true for greetings and browse requests.
   */
  isBackendMessage(message: string): boolean {
    const t = message.trim();
    return (
      GREETING_AR.test(t)     ||
      GREETING_EN.test(t)     ||
      BROWSE_AR.test(t)       ||
      BROWSE_EN.test(t)       ||
      CART_VIEW_AR.test(t)    ||
      CART_VIEW_EN.test(t)    ||
      ORDER_TRACK_AR.test(t)  ||
      ORDER_TRACK_EN.test(t)
    );
  }

  /**
   * Handle message with backend logic. Returns null if no pattern matched
   * and the message should fall through to the AI.
   *
   * Uses CatalogFlow internally so all responses use interactive UI.
   */
  async handle(
    message: string,
    store: Store,
    customer: Customer
  ): Promise<AIResponse | null> {
    const msg = message.trim();
    const lang = this.language;
    const catalog = new CatalogFlow(this.storeId, lang);

    // 1. Greetings — always show interactive main menu
    if (GREETING_AR.test(msg) || GREETING_EN.test(msg)) {
      logger.debug({ msg }, 'FallbackRouter: greeting detected');
      const result = await catalog.mainMenu(store, customer);
      return result.response;
    }

    // 2. Browse categories — interactive list
    if (BROWSE_AR.test(msg) || BROWSE_EN.test(msg)) {
      logger.debug({ msg }, 'FallbackRouter: browse categories detected');
      const result = await catalog.showCategories();
      return result.response;
    }

    // 2b. Special offers / best sellers / contact shortcuts
    if (/^(عروض|خصومات|عروض خاصة|offers?|deals?|discounts?)[؟?.\s]*$/i.test(msg)) {
      const result = await catalog.showOffers();
      return result.response;
    }
    if (/^(الأكثر مبيعاً|الأكثر طلباً|مشهور|best sellers?|popular|trending)[؟?.\s]*$/i.test(msg)) {
      const result = await catalog.showBestSellers();
      return result.response;
    }
    if (/^(تواصل|تواصل معنا|اتصل بنا|contact|call|phone|رقم المتجر)[؟?.\s]*$/i.test(msg)) {
      const result = catalog.showContact(store);
      return result.response;
    }

    // 3. Cart view — delegate to CatalogFlow
    if (CART_VIEW_AR.test(msg) || CART_VIEW_EN.test(msg)) {
      const result = await catalog.cartView(customer, store);
      return result.response;
    }

    // 4. Product search via keyword prefix stripping → interactive product list
    const searchQuery = this.extractSearchQuery(msg);
    if (searchQuery) {
      logger.debug({ searchQuery }, 'FallbackRouter: product search detected');
      const result = await catalog.searchProducts(searchQuery, lang);
      return result.response;
    }

    // 5. Special instructions / custom order notes
    if (SPECIAL_REQUEST_AR.test(msg)) {
      return {
        text: lang === 'ar'
          ? 'تقدر تضيف ملاحظاتك مع الطلب عند التأكيد 📝\nوش تبي تطلب؟'
          : 'You can add special instructions when confirming your order 📝\nWhat would you like to order?',
        language: lang,
        suggestedUI: 'text',
      };
    }

    return null; // no pattern matched → let AI handle
  }

  /**
   * Emergency fallback when AI fails completely.
   * Always returns something useful — never shows a raw error.
   * Uses interactive UI whenever possible.
   */
  async handleAIFailure(
    message: string,
    store: Store,
    customer: Customer
  ): Promise<AIResponse> {
    const lang = this.language;
    const catalog = new CatalogFlow(this.storeId, lang);

    // Try structured patterns first
    const structured = await this.handle(message, store, customer);
    if (structured) return structured;

    // Try treating the whole message as a product search query
    const trimmed = message.trim().replace(/[؟?!.]+$/, '').trim();
    if (trimmed.length >= 2) {
      try {
        const result = await ProductService.search(this.storeId, trimmed, { limit: 5 });
        if (result.products.length > 0) {
          const searchResult = await catalog.searchProducts(trimmed, lang);
          return searchResult.response;
        }
      } catch (err) {
        logger.warn({ err }, 'FallbackRouter: product search failed during AI failure handling');
      }
    }

    // Generic clarification with interactive buttons — much better than a scary error
    const body =
      lang === 'ar'
        ? 'ممكن توضح أكثر؟ 😊\nاكتب اسم المنتج، أو اختر من الخيارات:'
        : "Could you clarify? 😊\nType a product name, or choose from options:";

    const mainMenuResult = await catalog.mainMenu(store, customer);
    // Return main menu response with clarification as the text
    return {
      ...mainMenuResult.response,
      text: body,
      buttons: mainMenuResult.response.buttons
        ? { ...mainMenuResult.response.buttons, body }
        : undefined,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private extractSearchQuery(message: string): string | null {
    // Try Arabic prefixes
    for (const prefix of SEARCH_PREFIXES_AR) {
      if (prefix.test(message)) {
        const q = message.replace(prefix, '').replace(/[؟?!.]+$/, '').trim();
        return q.length >= 1 ? q : null;
      }
    }
    // Try English prefixes
    for (const prefix of SEARCH_PREFIXES_EN) {
      if (prefix.test(message)) {
        const q = message.replace(prefix, '').replace(/[?!.]+$/, '').trim();
        return q.length >= 1 ? q : null;
      }
    }
    return null;
  }
}
