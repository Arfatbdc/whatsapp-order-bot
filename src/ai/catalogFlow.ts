/**
 * CatalogFlow — Arabic-first interactive WhatsApp shopping flow.
 *
 * Golden Rule: Backend = decision maker. AI = only for open-ended text.
 *
 * Flow:
 *   Greeting → Main Menu (6-option list message)
 *   Browse → Category List (list message)
 *   Category → Product List (list message)
 *   Product → Details + 2 preset qty buttons + "كمية أخرى ✏️"
 *   Custom qty → user types any number → added to cart
 *   Add to cart → Confirmation with cart count (buttons)
 *   Cart → Summary + Actions (buttons)
 *   Offers → Active promotions (text + buttons)
 *   Best Sellers → Top products (list message)
 *   Contact Us → Store info (text + buttons)
 */

import { Store, Customer } from '../types';
import { SessionData, FlowResult } from '../services/session';
import { ProductService } from '../services/product';
import { CartService } from '../services/cart';
import { CheckoutFlow } from './checkoutFlow';
import { AnalyticsService } from '../services/analytics';
import { query } from '../database/connection';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════
// BUTTON / LIST ROW ID CONSTANTS
// ═══════════════════════════════════════════

export const BTN = {
  // Main menu
  BROWSE:           'menu_browse',
  SEARCH:           'menu_search',
  CART:             'menu_cart',
  OFFERS:           'menu_offers',
  BESTSELLERS:      'menu_bestsellers',
  CONTACT:          'menu_contact',

  // Navigation
  MAIN_MENU:        'back_main',
  CATEGORIES:       'back_cats',

  // Cart actions
  CART_ADD:         'cart_add_more',
  CART_REMOVE:      'cart_remove',
  CART_CHECKOUT:    'cart_checkout',

  // Order / checkout
  TRACK_ORDER:      'track_order',
  CHECKOUT_CONFIRM: 'checkout_confirm',

  // Nafitha-style additions
  REORDER:          'menu_reorder',
  MODIFY_CART:      'cart_modify_menu',
  PROMO_CODE:       'enter_promo',
};

// ═══════════════════════════════════════════
// i18n STRINGS  (Arabic default, English optional)
// ═══════════════════════════════════════════

function t(key: string, lang: string, vars: Record<string, string | number> = {}): string {
  const strings: Record<string, Record<string, string>> = {

    // ── Main menu ────────────────────────────────────────────────────────
    mainMenuBody: {
      ar: `أهلاً{name}! 👋 مرحباً في *{store}*\n\nكيف أقدر أساعدك اليوم؟`,
      en: `Hello{name}! 👋 Welcome to *{store}*\n\nHow can I help you today?`,
    },
    mainMenuBtn:    { ar: 'افتح القائمة 📋', en: 'Open Menu 📋' },
    mainMenuSec1:   { ar: '🍽️ الطلبات',         en: '🍽️ Order'     },
    mainMenuSec2:   { ar: '✨ اكتشف المزيد',   en: '✨ Discover'  },

    rowBrowse:   { ar: 'تصفح القائمة 🍽️',  en: 'Browse Menu 🍽️'    },
    rowBrowseD:  { ar: 'تصفح القائمة والأقسام', en: 'Browse menu and categories' },
    rowSearch:   { ar: 'بحث 🔍',            en: 'Search 🔍'          },
    rowSearchD:  { ar: 'ابحث عن صنف بالاسم', en: 'Search dishes by name'        },
    rowCart:     { ar: 'طلبي 🍽️',           en: 'My Order 🍽️'        },
    rowCartD:    { ar: 'عرض طلبك الحالي',   en: 'View your current order'       },
    rowOffers:   { ar: 'عروض خاصة 🎁',     en: 'Special Offers 🎁'  },
    rowOffersD:  { ar: 'أحدث العروض والخصومات', en: 'Latest deals and discounts' },
    rowBest:     { ar: 'الأكثر طلباً 🔥',   en: 'Most Popular 🔥'    },
    rowBestD:    { ar: 'أبرز أصنافنا اليوم', en: 'Our most popular dishes'       },
    rowContact:  { ar: 'تواصل معنا 📞',     en: 'Contact Us 📞'      },
    rowContactD: { ar: 'للاستفسارات والدعم', en: 'For inquiries and support'     },

    // ── Shared nav buttons ───────────────────────────────────────────────
    btnBrowse:   { ar: 'تصفح القائمة 🍽️',  en: 'Browse Menu 🍽️'    },
    btnSearch:   { ar: 'بحث 🔍',            en: 'Search 🔍'          },
    btnCart:     { ar: 'طلبي 🍽️',           en: 'My Order 🍽️'        },
    btnContinue: { ar: 'متابعة التسوق',     en: 'Keep Browsing'      },
    btnViewCart: { ar: 'عرض الطلب 🍽️',     en: 'View Order 🍽️'      },
    btnMain:     { ar: 'القائمة 🏠',        en: 'Main Menu 🏠'        },
    btnCats:     { ar: 'الأقسام 🔙',        en: 'Categories 🔙'       },
    btnBack:     { ar: 'رجوع 🔙',           en: 'Back 🔙'             },

    // ── Categories ───────────────────────────────────────────────────────
    catHeader:  { ar: '🍽️ اختر القسم', en: '🍽️ Choose Category' },
    catBody:    { ar: 'تصفح قائمة مطعمنا واختر ما يناسبك:', en: 'Browse our restaurant menu:' },
    catBtn:     { ar: 'اختر قسماً', en: 'Choose Category' },

    // ── Products ─────────────────────────────────────────────────────────
    prodBody:     { ar: 'اختر صنفاً لعرض التفاصيل والسعر:', en: 'Select a dish for details:' },
    prodBtn:      { ar: 'اختر صنفاً', en: 'Select Dish' },
    noProdsInCat: { ar: 'لا توجد أصناف في هذا القسم حالياً.', en: 'No dishes in this category.' },

    // ── Product detail ───────────────────────────────────────────────────
    qtyPrompt:    { ar: 'اختر الكمية:', en: 'Select quantity:' },
    btnCustomQty: { ar: 'كمية أخرى ✏️', en: 'Custom qty ✏️' },
    inStock:      { ar: '✅ متوفر',      en: '✅ Available'  },
    outStock:     { ar: '❌ غير متوفر', en: '❌ Unavailable' },
    vatNote:      { ar: 'شامل الضريبة (15%)', en: 'VAT included (15%)' },

    // ── Custom qty ───────────────────────────────────────────────────────
    customQtyPrompt: {
      ar: '✏️ *أدخل الكمية*\n\nالصنف: *{name}*\nالوحدة: {unit}\n\nاكتب أي رقم (مثال: 1 أو 2 أو 3):',
      en: '✏️ *Enter quantity*\n\nDish: *{name}*\nUnit: {unit}\n\nType any number (e.g. 1, 2, or 3):',
    },
    customQtyInvalid: {
      ar: '❌ الرجاء إدخال رقم صحيح للكمية.\nمثال: 1 أو 2 أو 3\n\nالصنف: *{name}*',
      en: '❌ Please enter a valid quantity.\nExample: 1, 2, or 3\n\nDish: *{name}*',
    },

    // ── Cart / Order ──────────────────────────────────────────────────────
    addedBody: {
      ar: '✅ تمت الإضافة للطلب!\n\n🍽️ *{name}*\n{qty} {unit} — {total} ر.س\n\n📊 لديك *{count}* صنف في طلبك\n\nماذا تريد الآن؟',
      en: '✅ Added to your order!\n\n🍽️ *{name}*\n{qty} {unit} — {total} SAR\n\n📊 *{count}* item(s) in your order\n\nWhat next?',
    },
    addFailed: {
      ar: '❌ عذراً، لم أتمكن من إضافة الصنف. حاول مرة ثانية.',
      en: '❌ Sorry, could not add item. Please try again.',
    },
    cartEmpty: {
      ar: '🍽️ طلبك فارغ!\n\nابدأ بتصفح القائمة أو ابحث عن صنف.',
      en: '🍽️ Your order is empty!\n\nBrowse our menu or search for a dish.',
    },
    cartTitle:    { ar: '🍽️ *طلبك:*', en: '🍽️ *Your Order:*' },
    cartSubtotal: { ar: 'المجموع الفرعي:', en: 'Subtotal:' },
    cartVat:      { ar: 'شامل الضريبة (15%) ✅', en: 'VAT (15%) Included ✅' },
    cartDelivery: { ar: 'التوصيل:', en: 'Delivery:' },
    cartFreeDeliv:{ ar: 'مجاني 🎉', en: 'Free 🎉' },
    cartTotal:    { ar: 'الإجمالي:', en: 'Total:' },
    cartCheckoutPrompt: {
      ar: 'اكتب "تأكيد" للطلب أو اختر من الأزرار:',
      en: 'Type "confirm" to place your order or use buttons:',
    },
    cartRemoveTitle: { ar: '❌ اختر الصنف للحذف:', en: '❌ Choose item to remove:' },
    cartRemoveBtn:   { ar: 'اختر صنفاً', en: 'Select Item' },
    removedOk:    { ar: '✅ تم الحذف من الطلب.', en: '✅ Item removed from order.' },
    btnAddMore:   { ar: 'إضافة صنف 🍽️',   en: 'Add More 🍽️'  },
    btnRemove:    { ar: 'حذف صنف ❌',      en: 'Remove Item ❌' },
    btnCheckoutAction: { ar: 'إتمام الطلب ✅', en: 'Place Order ✅' },

    // ── Search ───────────────────────────────────────────────────────────
    searchPrompt:    { ar: '🔍 اكتب اسم الصنف الذي تبحث عنه:', en: '🔍 Type the dish name to search:' },
    searchResultHdr: { ar: '🔍 نتائج "{q}"', en: '🔍 Results for "{q}"' },
    searchResultSec: { ar: 'الأصناف', en: 'Dishes' },
    searchNoResult:  {
      ar: 'عذراً، لم أجد "{q}" 😔\n\nجرب كلمة أخرى أو تصفح القائمة.',
      en: 'No results for "{q}" 😔\n\nTry another word or browse our menu.',
    },
    searchBtn: { ar: 'اختر صنفاً', en: 'Select' },

    // ── Special Offers ───────────────────────────────────────────────────
    offersTitle:   { ar: '🎁 *العروض الخاصة*', en: '🎁 *Special Offers*' },
    offersEmpty:   {
      ar: '🎁 لا توجد عروض نشطة حالياً.\n\nترقبوا عروضنا القادمة! ✨',
      en: '🎁 No active offers right now.\n\nStay tuned for upcoming deals! ✨',
    },

    // ── Best Sellers ─────────────────────────────────────────────────────
    bestTitle:    { ar: '🔥 *الأكثر طلباً*',  en: '🔥 *Most Popular*'   },
    bestSubtitle: { ar: 'أبرز أصنافنا اليوم:', en: 'Our most popular dishes:' },
    bestBtn:      { ar: 'اختر صنفاً', en: 'Select'               },

    // ── Contact Us ───────────────────────────────────────────────────────
    contactTitle:   { ar: '📞 *تواصل معنا*', en: '📞 *Contact Us*' },

    // ── Unknown / Error ──────────────────────────────────────────────────
    unknownMsg: {
      ar: 'لم أفهم طلبك 😊\nاختر من الخيارات أو اكتب اسم الصنف:',
      en: "I didn't understand 😊\nChoose from the menu or type a dish name:",
    },
  };

  let str = strings[key]?.[lang] ?? strings[key]?.ar ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function unitLabel(unit: string, lang: string): string {
  if (lang !== 'ar') return unit;
  const map: Record<string, string> = {
    kg: 'كيلو', piece: 'حبة', pack: 'علبة', box: 'علبة',
    liter: 'لتر', g: 'جرام', ml: 'مل',
  };
  return map[unit.toLowerCase()] ?? unit;
}

/** Two preset qty options shown as buttons (max 2 so we can fit custom-qty button). */
function qtyPresets(unit: string): number[] {
  const u = unit.toLowerCase();
  if (u === 'kg')    return [0.5, 1];
  if (u === 'liter') return [1, 2];
  if (u === 'piece') return [1, 2];
  return [1, 2];
}

/** Emoji for category based on Arabic/English name. */
function categoryEmoji(name: string): string {
  const checks: Array<[RegExp, string]> = [
    // ── Restaurant-specific (checked first) ──────────────────────────────
    [/مقبلات?|starters?|appetizers?/i,                          '🥗'],
    [/أطباق رئيسية|رئيسي|main dishes?/i,                        '🍛'],
    [/مشاوي|مندي|grills?|bbq|مشوي/i,                           '🔥'],
    [/وجبات سريعة|fast food|برغر|بيتزا|شاورما/i,               '🍔'],
    [/حلويات?|sweets?|desserts?|كنافة|كيك/i,                    '🍰'],
    [/مشروبات?|drinks?|beverages?|عصير|قهوة|شاي/i,             '☕'],
    [/وجبات عائلية|family meals?|عائلي/i,                       '👨‍👩‍👧‍👦'],
    // ── Grocery / general ────────────────────────────────────────────────
    [/خضار|vegetables?/i,                                        '🥦'],
    [/فواكه?|fruits?/i,                                          '🍎'],
    [/لحوم?|meat|beef|lamb/i,                                   '🥩'],
    [/دواجن|chicken|poultry/i,                                  '🍗'],
    [/ألبان|أجبان|dairy|milk|cheese|لبن/i,                      '🥛'],
    [/معلبات?|canned/i,                                         '🥫'],
    [/حبوب|أرز|rice|grains?/i,                                  '🌾'],
    [/مخبوزات?|bread|bakery/i,                                  '🍞'],
    [/منظفات?|cleaning|detergents?/i,                           '🧹'],
    [/تجميل|beauty|cosmetics/i,                                 '💄'],
    [/مجمدات?|frozen/i,                                         '❄️'],
    [/توابل?|spices?|بهارات/i,                                  '🌶️'],
    [/أسماك?|fish|seafood/i,                                    '🐟'],
    [/بيض|eggs?/i,                                              '🥚'],
    [/زيت|oil/i,                                                '🫙'],
    [/مطعم|restaurant|general/i,                                '🍽️'],
  ];
  for (const [pattern, emoji] of checks) {
    if (pattern.test(name)) return emoji;
  }
  return '📦';
}

function cap(str: string, max: number): string {
  return str.length <= max ? str : str.substring(0, max - 1) + '…';
}

function price(v: number | string): string {
  return parseFloat(String(v)).toFixed(2);
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

const GREETING = /^(هلا|هلا هلا|السلام عليكم|وعليكم السلام|مرحبا|مرحباً|اهلا|أهلا|أهلاً|اهلاً|صباح الخير|مساء الخير|يهلا|يا هلا|هلا والله|هاي|hi|hello|hey|salam|salaam|start|begin)[؟?!.\s]*$/i;
const CART_VIEW = /^(سلتي|عرض السلة|اشوف سلتي|وش في السلة|السلة|شوف سلتي|my cart|view cart|cart)[?.\s]*$/i;
const MAIN_MENU_REQ = /^(القائمة|القائمة الرئيسية|رجوع|رجع|main menu|menu|home|back)[؟?.\s]*$/i;
const ORDER_TRACK = /^(وين طلبي|تتبع طلبي|تتبع الطلب|أين طلبي|متى يوصل|طلبي وين|تتبع|track my order|where is my order|order status|track order)[؟?.\s]*$/i;
const ORDER_CONFIRM = /^(تأكيد|أكد|نعم اكيد|confirm|yes confirm|place order)[؟?.\s]*$/i;

// ═══════════════════════════════════════════
// CATALOG FLOW CLASS
// ═══════════════════════════════════════════

// FlowResult is defined in session.ts and re-exported here for backward compatibility.
export type { FlowResult };

export class CatalogFlow {
  private storeId: string;
  private lang: string;

  constructor(storeId: string, language: string) {
    this.storeId = storeId;
    this.lang = language === 'en' ? 'en' : 'ar';
  }

  /**
   * Primary entry point.
   * Returns FlowResult or null (→ AI handles it).
   */
  async handle(
    content: string,
    messageType: string,
    store: Store,
    customer: Customer,
    session: SessionData
  ): Promise<FlowResult | null> {
    const c = content.trim();
    const lang = this.lang;

    // ── 1. Greetings ──────────────────────────────────────────────────────
    if (GREETING.test(c)) return this.mainMenu(store, customer);

    // ── 2. Cart shortcut ──────────────────────────────────────────────────
    if (CART_VIEW.test(c) || c === BTN.CART) return this.cartView(customer, store);

    // ── 3. Main menu shortcut ─────────────────────────────────────────────
    if (MAIN_MENU_REQ.test(c) || c === BTN.MAIN_MENU) return this.mainMenu(store, customer);

    // ── 4. Interactive button / list ID routing ───────────────────────────
    if (messageType === 'interactive') {
      const result = await this.routeById(c, store, customer, session);
      return result ?? this.unknownMessageResponse(lang);
    }

    // ── 4b. WhatsApp location pin ─────────────────────────────────────────
    // Location messages reach here with messageType === 'location' and
    // content formatted as "[LOCATION: lat=X, lng=Y, name=N, address=A]".
    if (messageType === 'location') {
      if (session.state === 'checkout_address') {
        const co = new CheckoutFlow(this.storeId, lang);
        return co.receiveLocation(c, customer, store, session);
      }
      // Location pin outside checkout — guide the user
      const body = lang === 'ar'
        ? '📌 تم استلام موقعك.\nلاستخدام موقعك كعنوان للتوصيل، ابدأ بالطلب أولاً:\n\nاضغط *إتمام الطلب ✅* من سلتك.'
        : '📌 Location received.\nTo use your location as a delivery address, start a checkout first:\n\nTap *Checkout ✅* from your cart.';
      return { response: { text: body, language: lang, suggestedUI: 'text' }, newState: {} };
    }

    // ── 5. Text — checkout: address input (user typed their address) ────────
    if (session.state === 'checkout_address') {
      const co = new CheckoutFlow(this.storeId, lang);
      return co.receiveAddress(c, customer, store, session);
    }

    // ── 5b. Text — "تأكيد" in confirm state → place the order ──────────────
    if (session.state === 'checkout_confirm' && ORDER_CONFIRM.test(c)) {
      const co = new CheckoutFlow(this.storeId, lang);
      return co.confirmOrder(customer, store, session);
    }

    // ── 5c. Text — other checkout states (zones / payment / confirm) ────────
    // User is expected to tap a button; gently nudge them.
    if (
      session.state === 'checkout_zones' ||
      session.state === 'checkout_payment' ||
      session.state === 'checkout_confirm'
    ) {
      const body = lang === 'ar'
        ? '👆 اختر من الخيارات أعلاه للمتابعة.'
        : '👆 Please tap an option above to continue.';
      return { response: { text: body, language: lang, suggestedUI: 'text' }, newState: {} };
    }

    // ── 6. Text — custom qty input ───────────────────────────────────────
    if (session.state === 'entering_custom_qty') {
      return this.handleCustomQty(c, store, customer, session);
    }

    // ── 6c. Text — promo code input ──────────────────────────────────────
    if (session.state === 'entering_promo_code') {
      return this.applyPromoCode(c, customer, store);
    }

    // ── 6b. Text — special instructions input ────────────────────────────
    if (session.state === 'entering_special_instructions') {
      return this.handleSpecialInstructions(c, customer, session);
    }

    // ── 7. Text — search mode ────────────────────────────────────────────
    if (session.state === 'search_mode') {
      return this.searchProducts(c, lang);
    }

    // ── 7b. Text — order tracking patterns ──────────────────────────────
    if (ORDER_TRACK.test(c)) {
      const co = new CheckoutFlow(this.storeId, lang);
      return co.trackOrder(customer, store, session);
    }

    // ── 8. Text — auto-search from natural language ──────────────────────
    if (
      session.state === 'idle'      ||
      session.state === 'main_menu' ||
      session.state === 'browsing_categories' ||
      session.state === 'browsing_products'
    ) {
      // If the user is browsing a specific category, search within it first
      const found = await this.tryAutoSearch(
        c, lang,
        session.state === 'browsing_products' ? session.categoryId : undefined
      );
      if (found) return found;
    }

    // ── 9. Anything else (unknown text in any state) → show main menu ────
    // Never return null for text messages — always guide the user.
    return this.mainMenu(store, customer);
  }

  // ═══════════════════════════════════════════
  // MAIN MENU  — two stacked button cards
  //
  //  Card 1:  Browse Products | Search | My Cart
  //  Card 2:  Special Offers  | Best Sellers | Contact Us
  //           (under a "Discover" header)
  // ═══════════════════════════════════════════

  async mainMenu(store: Store, customer: Customer): Promise<FlowResult> {
    const lang      = this.lang;
    // Use Arabic name for Arabic users, English name for English users
    const storeName = lang === 'ar' ? (store.name_ar || store.name) : store.name;

    // Personal greeting — returning vs new customer, with visit count
    let greeting: string;
    if (customer.name && customer.total_orders > 0) {
      // Returning customer: show name + visit number
      greeting = lang === 'ar'
        ? `أهلاً *${customer.name}*! 👋\nزيارتك رقم ${customer.total_orders + 1} 🎉`
        : `Welcome back *${customer.name}*! 👋\nVisit #${customer.total_orders + 1} 🎉`;
    } else if (customer.total_orders === 0) {
      // Brand-new customer (may or may not have a name yet)
      greeting = lang === 'ar'
        ? 'أهلاً وسهلاً! 👋\nيسعدنا خدمتك لأول مرة 🎉'
        : 'Welcome! 👋\nGreat to have you with us 🎉';
    } else {
      // Has name but order count not tracked — plain greeting
      greeting = customer.name
        ? (lang === 'ar' ? `أهلاً *${customer.name}*! 👋` : `Hello *${customer.name}*! 👋`)
        : (lang === 'ar' ? 'أهلاً! 👋' : 'Hello! 👋');
    }

    // ── Card 1 ────────────────────────────────────────────────────────────
    // Store name mentioned ONCE here — not in any header, not repeated.
    const card1Body = lang === 'ar'
      ? `${greeting}\n*${storeName}*\n\nاختر من القائمة:`
      : `${greeting}\n*${storeName}*\n\nChoose from the menu:`;

    // ── Card 2: Discover ──────────────────────────────────────────────────
    // No store name — just the section label as header
    const discoverHeader = lang === 'ar' ? '✨ اكتشف المزيد' : '✨ Discover More';
    const discoverBody   = lang === 'ar'
      ? 'عروض خاصة، الأكثر مبيعاً، وتواصل معنا:'
      : 'Special offers, best sellers, and contact:';

    // Returning customers get quick-reorder instead of search in card 1
    const isReturning = customer.total_orders > 0;
    const card1Buttons = isReturning
      ? [
          { id: BTN.BROWSE,  title: cap(lang === 'ar' ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️', 20) },
          { id: BTN.REORDER, title: cap(lang === 'ar' ? 'أعد آخر طلب ⚡'   : 'Reorder ⚡',        20) },
          { id: BTN.CART,    title: cap(lang === 'ar' ? 'سلتي 🛒'           : 'My Cart 🛒',        20) },
        ]
      : [
          { id: BTN.BROWSE,  title: cap(lang === 'ar' ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️', 20) },
          { id: BTN.SEARCH,  title: cap(lang === 'ar' ? 'بحث 🔍'            : 'Search 🔍',          20) },
          { id: BTN.CART,    title: cap(lang === 'ar' ? 'سلتي 🛒'           : 'My Cart 🛒',         20) },
        ];

    return {
      response: {
        text: card1Body,
        language: lang,
        suggestedUI: 'buttons',
        buttons: {
          // No header here — store name is already in the body (once)
          body: card1Body,
          buttons: card1Buttons,
        },
        /* followUp: {
          text: discoverBody,
          language: lang,
          suggestedUI: 'buttons',
          buttons: {
            header: discoverHeader,   // "✨ اكتشف المزيد" — no store name
            body:   discoverBody,
            buttons: [
              { id: BTN.OFFERS,      title: cap(lang === 'ar' ? 'عروض خاصة 🎁'    : 'Special Offers 🎁', 20) },
              { id: BTN.BESTSELLERS, title: cap(lang === 'ar' ? 'الأكثر مبيعاً 🔥' : 'Best Sellers 🔥',   20) },
              { id: BTN.CONTACT,     title: cap(lang === 'ar' ? 'تواصل معنا 📞'    : 'Contact Us 📞',     20) },
            ],
          },
        }, */
      },
      newState: { state: 'main_menu' },
    };
  }

  // ═══════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════

  async showCategories(): Promise<FlowResult> {
    const lang = this.lang;
    try {
      const cats = await ProductService.getCategories(this.storeId);

      if (cats.length === 0) {
        const body = lang === 'ar' ? 'لا توجد أقسام متاحة حالياً.' : 'No categories available.';
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [{ id: BTN.MAIN_MENU, title: cap(t('btnMain', lang), 20) }] },
          },
          newState: { state: 'browsing_categories' },
        };
      }

      const rows = cats.slice(0, 10).map((c) => {
        const name = lang === 'ar' ? c.name_ar : (c.name_en ?? c.name_ar);
        const emoji = categoryEmoji(name);
        const countDesc = c.product_count
          ? `${c.product_count} ${lang === 'ar' ? 'منتج' : 'items'}`
          : undefined;
        return { id: `cat_${c.id}`, title: cap(`${emoji} ${name}`, 24), description: countDesc };
      });

      return {
        response: {
          text: t('catBody', lang), language: lang, suggestedUI: 'list',
          listData: {
            header: t('catHeader', lang),
            body: t('catBody', lang),
            buttonText: cap(t('catBtn', lang), 20),
            sections: [{ title: lang === 'ar' ? 'الأقسام' : 'Categories', rows }],
          },
        },
        newState: { state: 'browsing_categories' },
      };
    } catch (err) {
      logger.warn({ err }, 'CatalogFlow: getCategories failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // PRODUCTS IN CATEGORY
  // ═══════════════════════════════════════════

  async showProducts(categoryId: string, categoryName: string): Promise<FlowResult> {
    const lang = this.lang;
    try {
      // Fetch all products (up to 30) — we paginate via multiple WhatsApp list sections
      const products = await ProductService.getByCategory(this.storeId, categoryId, 30);

      if (products.length === 0) {
        const body = t('noProdsInCat', lang);
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.CATEGORIES, title: cap(t('btnCats', lang), 20) },
              { id: BTN.MAIN_MENU,  title: cap(t('btnMain', lang), 20) },
            ]},
          },
          newState: { state: 'browsing_categories' },
        };
      }

      const c = lang === 'ar' ? 'ر.س' : 'SAR';

      // Split into sections of 10 (WhatsApp list max per section)
      const ROWS_PER_SECTION = 10;
      const sections: { title: string; rows: { id: string; title: string; description?: string }[] }[] = [];
      for (let i = 0; i < products.length; i += ROWS_PER_SECTION) {
        const batch = products.slice(i, i + ROWS_PER_SECTION);
        const rows = batch.map((p) => {
          const name = lang === 'ar' ? p.name_ar : (p.name_en ?? p.name_ar);
          const unit = unitLabel(p.unit, lang);
          const stockBadge = p.in_stock ? '' : ' ❌';
          return {
            id: `prod_${p.id}`,
            title: cap(`${name}${stockBadge}`, 24),
            description: `${price(p.price)} ${c} / ${unit}`,
          };
        });
        const sectionTitle = sections.length === 0
          ? categoryName
          : lang === 'ar' ? `${categoryName} (المزيد)` : `${categoryName} (more)`;
        sections.push({ title: sectionTitle, rows });
      }

      return {
        response: {
          text: t('prodBody', lang), language: lang, suggestedUI: 'list',
          listData: {
            header: `${categoryEmoji(categoryName)} ${categoryName}`,
            body: t('prodBody', lang),
            buttonText: cap(t('prodBtn', lang), 20),
            sections,
          },
        },
        newState: { state: 'browsing_products', categoryId, categoryName },
      };
    } catch (err) {
      logger.warn({ err }, 'CatalogFlow: getByCategory failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // PRODUCT DETAIL  (2 preset qty + custom)
  // ═══════════════════════════════════════════

  /** Always returns FlowResult — never null. */
  async showProductDetail(productId: string): Promise<FlowResult> {
    const lang = this.lang;
    try {
      const product = await ProductService.getById(this.storeId, productId);

      if (!product) {
        const body = lang === 'ar'
          ? 'عذراً، المنتج غير موجود. تصفح الأقسام للعثور على ما تريد.'
          : 'Product not found. Browse categories to find what you need.';
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.CATEGORIES, title: cap(t('btnCats', lang), 20) },
              { id: BTN.MAIN_MENU,  title: cap(t('btnMain', lang), 20) },
            ]},
          },
          newState: { state: 'browsing_categories' },
        };
      }

      if (!product.in_stock) {
        const name = lang === 'ar' ? product.name_ar : (product.name_en ?? product.name_ar);

        // Try alternatives first
        if (product.alternatives && product.alternatives.length > 0) {
          try {
            const altIds = (product.alternatives as string[]).slice(0, 5);
            const altProducts = await Promise.all(
              altIds.map((id) => ProductService.getById(this.storeId, id).catch(() => null))
            );
            const available = altProducts.filter(
              (p): p is NonNullable<typeof p> => p !== null && p.is_active && p.in_stock
            );
            if (available.length > 0) {
              const c = lang === 'ar' ? 'ر.س' : 'SAR';
              const rows = available.map((p) => ({
                id:          `prod_${p.id}`,
                title:       cap(lang === 'ar' ? p.name_ar : (p.name_en ?? p.name_ar), 24),
                description: `${price(p.price)} ${c} / ${unitLabel(p.unit, lang)}`,
              }));
              const header = lang === 'ar' ? '🔄 بدائل مقترحة' : '🔄 Available Alternatives';
              const body   = lang === 'ar'
                ? `😔 *${name}* غير متوفر حالياً.\n\nلدينا بدائل مشابهة — اختر ما يناسبك:`
                : `😔 *${name}* is out of stock.\n\nHere are similar options:`;
              return {
                response: {
                  text: body, language: lang, suggestedUI: 'list',
                  listData: {
                    header, body,
                    buttonText: cap(lang === 'ar' ? 'اختر بديلاً' : 'Choose Alternative', 20),
                    sections: [{ title: lang === 'ar' ? 'بدائل متوفرة' : 'Available Now', rows }],
                  },
                },
                newState: { state: 'browsing_products' },
              };
            }
          } catch { /* fall through to plain OOS message */ }
        }

        // Plain OOS (no alternatives)
        const body = lang === 'ar'
          ? `❌ *${name}* غير متوفر حالياً.\n\nتصفح الأقسام أو ابحث عن منتج آخر:`
          : `❌ *${name}* is currently out of stock.\n\nBrowse or search for another product:`;
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.CATEGORIES, title: cap(t('btnCats', lang), 20) },
              { id: BTN.SEARCH,     title: cap(t('btnSearch', lang), 20) },
              { id: BTN.MAIN_MENU,  title: cap(t('btnMain', lang), 20) },
            ]},
          },
          newState: { state: 'browsing_categories' },
        };
      }

      const name    = lang === 'ar' ? product.name_ar : (product.name_en ?? product.name_ar);
      const unit    = unitLabel(product.unit, lang);
      const desc    = (lang === 'ar' ? product.description_ar : product.description_en) || '';

      const c = lang === 'ar' ? 'ر.س' : 'SAR';

      // 2 preset quantities + 1 "كمية أخرى ✏️" (WhatsApp max = 3 buttons)
      const presets = qtyPresets(product.unit);
      const buttons = [
        ...presets.slice(0, 2).map((q) => ({
          id:    `qty_${product.id}_${q}_${product.unit}`,
          title: cap(`${q} ${unit}`, 20),
        })),
        {
          id:    `custom_qty_${product.id}_${product.unit}`,
          title: cap(t('btnCustomQty', lang), 20),
        },
      ];

      const newState = {
        state:        'viewing_product' as const,
        productId:    product.id,
        productName:  name,
        productPrice: parseFloat(price(product.price)),
        productUnit:  product.unit,
      };

      // ── Image-first approach ────────────────────────────────────────────
      // Send product image as a standalone WhatsApp image message (larger, more
      // attractive, and avoids the "status: failed" bug that happens when images
      // are embedded as interactive button headers via external CDN URLs).
      // The quantity-selection buttons follow as a separate message (followUp).
      if (product.image_url) {
        const caption = [
          `*${name}*`,
          desc || null,
          `💰 *${price(product.price)} ${c}* / ${unit}`,
          `${t('inStock', lang)} • ${t('vatNote', lang)}`,
        ].filter(Boolean).join('\n');

        const btnBody = t('qtyPrompt', lang);

        return {
          response: {
            text:        caption,
            language:    lang,
            suggestedUI: 'image',
            imageUrl:    product.image_url,
            followUp: {
              text:        btnBody,
              language:    lang,
              suggestedUI: 'buttons',
              buttons:     { body: btnBody, buttons },
            },
          },
          newState,
        };
      }

      // ── Text-only fallback (no image) ───────────────────────────────────
      let body = `*${name}*\n`;
      if (desc) body += `\n${desc}\n`;
      body += `\n💰 *${price(product.price)} ${c}* / ${unit}\n`;
      body += `${t('inStock', lang)}\n`;
      body += `${t('vatNote', lang)}\n\n`;
      body += t('qtyPrompt', lang);
      body = body.trimStart();

      return {
        response: {
          text: body,
          language: lang,
          suggestedUI: 'buttons',
          buttons: { body, buttons },
        },
        newState,
      };
    } catch (err) {
      logger.warn({ err }, 'CatalogFlow: showProductDetail failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // CUSTOM QUANTITY INPUT
  // ═══════════════════════════════════════════

  /**
   * Handle the custom quantity state: user typed a number after tapping "كمية أخرى".
   * Validates the number and calls addToCart.
   */
  private async handleCustomQty(
    content: string,
    store: Store,
    customer: Customer,
    session: SessionData
  ): Promise<FlowResult> {
    const lang = this.lang;
    const productName = session.productName || '';
    const productUnit = session.productUnit || 'kg';

    // Normalize: Arabic-Indic digits → ASCII, Arabic/Latin comma → decimal point
    // Supports: ١٢٣ → 123  ،  → .  ٣ → 3  ½ → 0.5
    const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
    const normalized = content.trim()
      .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
      .replace(/[،,،]/g, '.')
      .replace(/½/g, '0.5')
      .replace(/¼/g, '0.25')
      .replace(/¾/g, '0.75');
    const qty = parseFloat(normalized);

    if (isNaN(qty) || qty <= 0 || qty > 999) {
      const body = t('customQtyInvalid', lang, { name: productName });
      return {
        response: {
          text: body, language: lang, suggestedUI: 'buttons',
          buttons: { body, buttons: [
            { id: BTN.CATEGORIES, title: cap(t('btnCats', lang), 20) },
            { id: BTN.MAIN_MENU,  title: cap(t('btnMain', lang), 20) },
          ]},
        },
        newState: { state: 'entering_custom_qty' }, // stay — let them retry
      };
    }

    if (!session.productId) return this.errorResponse();

    logger.debug({ customerId: customer.id, productId: session.productId, qty }, 'Custom qty entered');
    return this.addToCart(customer.id, session.productId, qty, productUnit, store, session);
  }

  // ═══════════════════════════════════════════
  // ADD TO CART
  // ═══════════════════════════════════════════

  async addToCart(
    customerId: string,
    productId: string,
    qty: number,
    unit: string,
    _store: Store,
    _session: SessionData
  ): Promise<FlowResult> {
    const lang = this.lang;
    try {
      const product = await ProductService.getById(this.storeId, productId);
      if (!product) return this.errorResponse();

      if (!product.in_stock) {
        const name = lang === 'ar' ? product.name_ar : (product.name_en ?? product.name_ar);
        const body = lang === 'ar'
          ? `❌ عذراً، *${name}* غير متوفر حالياً.`
          : `❌ Sorry, *${name}* is out of stock.`;
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.CATEGORIES, title: cap(t('btnCats', lang), 20) },
              { id: BTN.MAIN_MENU,  title: cap(t('btnMain', lang), 20) },
            ]},
          },
          newState: { state: 'browsing_categories' },
        };
      }

      const cart      = await CartService.addItem(this.storeId, customerId, product, qty);
      const itemCount = cart.items.length;
      const name      = lang === 'ar' ? product.name_ar : (product.name_en ?? product.name_ar);
      const unitStr   = unitLabel(unit, lang);
      const total     = (parseFloat(price(product.price)) * qty).toFixed(2);
      const baseBody  = t('addedBody', lang, { name, qty, unit: unitStr, total, count: itemCount });

      // Append running cart total
      const runningTotal = cart.items.reduce((s, i) => s + parseFloat(String(i.subtotal)), 0);
      const totalLine = `\n💰 ${lang === 'ar' ? 'إجمالي طلبك:' : 'Order total:'} *${runningTotal.toFixed(2)} ${lang === 'ar' ? 'ر.س' : 'SAR'}*`;
      const body = (baseBody + totalLine).length <= 1024 ? baseBody + totalLine : baseBody;

      logger.info({ customerId, productId, qty, cartItems: itemCount }, 'Item added to cart');

      // For the FIRST item added, ask if the customer has special instructions
      if (itemCount === 1) {
        const instrBody = lang === 'ar'
          ? `${body}\n\n✏️ هل تريد إضافة ملاحظات خاصة للطلب؟`
          : `${body}\n\n✏️ Would you like to add special instructions?`;
        const instrBodyTruncated = instrBody.length > 1024 ? instrBody.substring(0, 1020) + '...' : instrBody;
        return {
          response: {
            text: instrBodyTruncated, language: lang, suggestedUI: 'buttons',
            buttons: { body: instrBodyTruncated, buttons: [
              { id: `special_instr_${product.id}`, title: cap(lang === 'ar' ? 'ملاحظات ✏️' : 'Add Note ✏️', 20) },
              { id: 'skip_instructions',            title: cap(lang === 'ar' ? 'تخطي'          : 'Skip',         20) },
              { id: BTN.CART,                       title: cap(t('btnViewCart', lang), 20) },
            ]},
          },
          newState: { state: 'waiting_special_instructions', productId: product.id },
        };
      }

      // ── Smart upsell after 3rd item ──────────────────────────────────────
      // Suggest a complementary category based on what's already in cart
      let upsellSuffix = '';
      if (itemCount === 3) {
        const cartNames = cart.items.map((i) => (i.name_ar + ' ' + (i.name_en ?? '')).toLowerCase());
        const hasChicken = cartNames.some((n) => /دجاج|chicken|فحم|شواية|مضغوط/.test(n));
        const hasDrinks  = cartNames.some((n) => /بيبسي|ماء|لبن|مشروب|drink|water|juice/.test(n));
        const hasDesert  = cartNames.some((n) => /كنافة|حلى|dessert|مهلبية|حلا/.test(n));
        const hasSides   = cartNames.some((n) => /ايدام|أرز|rice|side/.test(n));

        if (hasChicken && !hasDrinks) {
          upsellSuffix = lang === 'ar'
            ? '\n\n💡 *عرض اليوم:* أضف مشروباً لطلبك!'
            : '\n\n💡 *Tip:* Add a drink to your order!';
        } else if ((hasChicken || hasSides) && !hasDesert) {
          upsellSuffix = lang === 'ar'
            ? '\n\n🍰 لا تنسَ الحلى — جرّب كنافتنا بالقشطة!'
            : '\n\n🍰 Don\'t forget dessert — try our kunafa!';
        } else if (hasDrinks && !hasSides) {
          upsellSuffix = lang === 'ar'
            ? '\n\n🍛 أضف طبقاً جانبياً لطلب متكامل!'
            : '\n\n🍛 Add a side dish for a complete meal!';
        }
      }

      const finalBody = upsellSuffix && (body + upsellSuffix).length <= 1024
        ? body + upsellSuffix
        : body;

      return {
        response: {
          text: finalBody, language: lang, suggestedUI: 'buttons',
          buttons: { body: finalBody, buttons: [
            { id: BTN.BROWSE,        title: cap(t('btnContinue', lang), 20) },
            { id: BTN.CART,          title: cap(t('btnViewCart', lang), 20) },
            { id: BTN.CART_CHECKOUT, title: cap(t('btnCheckoutAction', lang), 20) },
          ]},
        },
        newState: { state: 'main_menu' },
      };
    } catch (err) {
      logger.error({ err, customerId, productId }, 'CartService.addItem failed');
      return {
        response: {
          text: t('addFailed', lang), language: lang, suggestedUI: 'buttons',
          buttons: { body: t('addFailed', lang), buttons: [{ id: BTN.MAIN_MENU, title: cap(t('btnMain', lang), 20) }] },
        },
        newState: { state: 'main_menu' },
      };
    }
  }

  // ═══════════════════════════════════════════
  // CART VIEW
  // ═══════════════════════════════════════════

  async cartView(customer: Customer, store: Store): Promise<FlowResult> {
    const lang = this.lang;
    try {
      const summary = await CartService.getSummary(this.storeId, customer.id, store);
      const { cart, deliveryFee, subtotal, discount, total, isFreeDelivery } = summary;

      if (cart.items.length === 0) {
        const body = t('cartEmpty', lang);
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.BROWSE, title: cap(t('btnBrowse', lang), 20) },
              { id: BTN.SEARCH, title: cap(t('btnSearch', lang), 20) },
            ]},
          },
          newState: { state: 'cart_view' },
        };
      }

      // Use language-appropriate currency symbol
      const c = lang === 'ar' ? 'ر.س' : 'SAR';

      const lines = cart.items.map((item, i) => {
        const name = lang === 'ar' ? item.name_ar : (item.name_en ?? item.name_ar);
        const unit = unitLabel(item.unit, lang);
        return `${i + 1}. ${name} × ${item.quantity} ${unit} — ${parseFloat(String(item.subtotal)).toFixed(2)} ${c}`;
      });

      const delivLabel = isFreeDelivery ? t('cartFreeDeliv', lang) : `${deliveryFee.toFixed(2)} ${c}`;
      const body = [
        t('cartTitle', lang), '',
        ...lines, '',
        `${t('cartSubtotal', lang)} ${subtotal.toFixed(2)} ${c}`,
        t('cartVat', lang),
        discount > 0 ? `${lang === 'ar' ? 'خصم:' : 'Discount:'} -${discount.toFixed(2)} ${c}` : null,
        `${t('cartDelivery', lang)} ${delivLabel}`,
        '─────────────',
        `*${t('cartTotal', lang)} ${total.toFixed(2)} ${c}*`, '',
        t('cartCheckoutPrompt', lang),
      ].filter(Boolean).join('\n');

      // Smart truncation: always preserve the total line
      const sep = '─────────────';
      let bodyTruncated = body;
      if (body.length > 1000) {
        const sepIdx = body.lastIndexOf(sep);
        if (sepIdx > 0) {
          const footer    = body.slice(sepIdx);
          const available = 1000 - footer.length - 5;
          bodyTruncated   = available > 40 ? body.slice(0, available) + '...\n\n' + footer : body.substring(0, 997) + '...';
        } else {
          bodyTruncated = body.substring(0, 997) + '...';
        }
      }
      return {
        response: {
          text: bodyTruncated, language: lang, suggestedUI: 'buttons',
          buttons: { body: bodyTruncated, buttons: [
            { id: BTN.MODIFY_CART,   title: cap(lang === 'ar' ? 'تعديل الطلب 🔧' : 'Modify Order 🔧', 20) },
            { id: BTN.PROMO_CODE,    title: cap(lang === 'ar' ? 'كود خصم 🎁'      : 'Promo Code 🎁',   20) },
            { id: BTN.CART_CHECKOUT, title: cap(t('btnCheckoutAction', lang), 20) },
          ]},
        },
        newState: { state: 'cart_view' },
      };
    } catch (err) {
      logger.error({ err }, 'CatalogFlow: cartView failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // REMOVE FROM CART
  // ═══════════════════════════════════════════

  async showRemoveList(customer: Customer): Promise<FlowResult> {
    const lang = this.lang;
    try {
      const cart = await CartService.getOrCreate(this.storeId, customer.id);
      if (cart.items.length === 0) {
        return this.cartView(customer, { delivery_fee: 10, free_delivery_above: 150 } as Store);
      }

      const c = lang === 'ar' ? 'ر.س' : 'SAR';
      const rows = cart.items.map((item) => ({
        id:          `remove_${item.product_id}`,
        title:       cap(lang === 'ar' ? item.name_ar : (item.name_en ?? item.name_ar), 24),
        description: `${parseFloat(String(item.quantity))} × ${parseFloat(String(item.price)).toFixed(2)} ${c}`,
      }));

      const body = t('cartRemoveTitle', lang);
      return {
        response: {
          text: body, language: lang, suggestedUI: 'list',
          listData: {
            header: body, body,
            buttonText: cap(t('cartRemoveBtn', lang), 20),
            sections: [{ title: lang === 'ar' ? 'منتجات السلة' : 'Cart Items', rows }],
          },
        },
        newState: { state: 'removing_item' },
      };
    } catch (err) {
      logger.error({ err }, 'CatalogFlow: showRemoveList failed');
      return this.errorResponse();
    }
  }

  async removeItem(customerId: string, productId: string, store: Store): Promise<FlowResult> {
    const lang = this.lang;
    try {
      await CartService.removeItem(this.storeId, customerId, productId);
      logger.info({ customerId, productId }, 'Item removed from cart');

      const cartResult = await this.cartView({ id: customerId } as Customer, store);
      const confirmText = t('removedOk', lang) + '\n\n' + cartResult.response.text;
      const truncated = confirmText.length > 1024 ? confirmText.substring(0, 1020) + '...' : confirmText;

      if (cartResult.response.suggestedUI === 'buttons' && cartResult.response.buttons) {
        cartResult.response.buttons.body = truncated;
      }
      cartResult.response.text = truncated;
      return cartResult;
    } catch (err) {
      logger.error({ err }, 'CatalogFlow: removeItem failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // SEARCH
  // ═══════════════════════════════════════════

  searchPrompt(): FlowResult {
    const lang = this.lang;
    return {
      response: { text: t('searchPrompt', lang), language: lang, suggestedUI: 'text' },
      newState: { state: 'search_mode' },
    };
  }

  async searchProducts(queryStr: string, lang: string): Promise<FlowResult> {
    try {
      const result = await ProductService.search(this.storeId, queryStr, { limit: 8 });

      if (result.products.length === 0) {
        const body = t('searchNoResult', lang, { q: queryStr });
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.CATEGORIES, title: cap(t('btnCats', lang), 20) },
              { id: BTN.SEARCH,     title: cap(t('btnSearch', lang), 20) },
            ]},
          },
          newState: { state: 'search_mode' },
        };
      }

      const currSym = lang === 'ar' ? 'ر.س' : 'SAR';
      const rows = result.products.slice(0, 10).map((p) => ({
        id:          `prod_${p.id}`,
        title:       cap(lang === 'ar' ? p.name_ar : (p.name_en ?? p.name_ar), 24),
        description: `${price(p.price)} ${currSym} / ${unitLabel(p.unit, lang)}`,
      }));

      const header    = t('searchResultHdr', lang, { q: queryStr });
      const bodyText  = lang === 'ar'
        ? `وجدت ${result.products.length} نتيجة — اختر منتجاً للتفاصيل:`
        : `Found ${result.products.length} result(s) — tap to view details:`;

      return {
        response: {
          text: header, language: lang, suggestedUI: 'list',
          listData: {
            header, body: bodyText,
            buttonText: cap(t('searchBtn', lang), 20),
            sections: [{ title: t('searchResultSec', lang), rows }],
          },
        },
        newState: { state: 'search_mode' },
      };
    } catch (err) {
      logger.warn({ err, queryStr }, 'CatalogFlow: search failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // SPECIAL OFFERS  🎁
  // ═══════════════════════════════════════════

  async showOffers(): Promise<FlowResult> {
    const lang = this.lang;
    try {
      interface Promotion {
        id: string;
        title_ar: string;
        title_en: string | null;
        type: string;
        discount_value: number | null;
        valid_until: string | null;
        code: string | null;
      }

      const promotions = await query<Promotion>(
        `SELECT id, title_ar, title_en, type, discount_value, valid_until, code
         FROM promotions
         WHERE store_id = $1
           AND is_active = true
           AND (valid_until IS NULL OR valid_until > NOW())
         ORDER BY created_at DESC
         LIMIT 8`,
        [this.storeId]
      );

      if (promotions.length === 0) {
        const body = t('offersEmpty', lang);
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.BROWSE,    title: cap(t('btnBrowse', lang), 20) },
              { id: BTN.MAIN_MENU, title: cap(t('btnMain', lang), 20) },
            ]},
          },
          newState: { state: 'main_menu' },
        };
      }

      const lines = promotions.map((p, i) => {
        const title   = lang === 'ar' ? p.title_ar : (p.title_en ?? p.title_ar);
        const typeStr = this.formatOfferType(p.type, p.discount_value, lang);
        const expiry  = p.valid_until
          ? `  _(${lang === 'ar' ? 'حتى' : 'until'} ${new Date(p.valid_until).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')})_`
          : '';
        const code    = p.code ? `  كود: \`${p.code}\`` : '';
        return `${i + 1}. *${title}*\n   ${typeStr}${expiry}${code}`;
      });

      const body = `${t('offersTitle', lang)}\n\n${lines.join('\n\n')}\n\n${lang === 'ar' ? '🛒 ابدأ التسوق الآن!' : '🛒 Start shopping now!'}`;
      const truncated = body.length > 1024 ? body.substring(0, 1020) + '...' : body;

      return {
        response: {
          text: truncated, language: lang, suggestedUI: 'buttons',
          buttons: { body: truncated, buttons: [
            { id: BTN.BROWSE,    title: cap(t('btnBrowse', lang), 20) },
            { id: BTN.SEARCH,    title: cap(t('btnSearch', lang), 20) },
            { id: BTN.MAIN_MENU, title: cap(t('btnMain', lang), 20) },
          ]},
        },
        newState: { state: 'main_menu' },
      };
    } catch (err) {
      logger.warn({ err }, 'CatalogFlow: showOffers failed');
      const body = t('offersEmpty', lang);
      return {
        response: {
          text: body, language: lang, suggestedUI: 'buttons',
          buttons: { body, buttons: [
            { id: BTN.BROWSE,    title: cap(t('btnBrowse', lang), 20) },
            { id: BTN.MAIN_MENU, title: cap(t('btnMain', lang), 20) },
          ]},
        },
        newState: { state: 'main_menu' },
      };
    }
  }

  private formatOfferType(type: string, value: number | null, lang: string): string {
    const v = value ? parseFloat(String(value)) : 0;
    if (lang === 'ar') {
      if (type === 'percentage') return `خصم ${v}%`;
      if (type === 'fixed')      return `خصم ${v.toFixed(2)} ر.س`;
      if (type === 'free_delivery') return 'توصيل مجاني';
      return 'عرض خاص';
    }
    if (type === 'percentage') return `${v}% discount`;
    if (type === 'fixed')      return `SAR ${v.toFixed(2)} off`;
    if (type === 'free_delivery') return 'Free delivery';
    return 'Special offer';
  }

  // ═══════════════════════════════════════════
  // BEST SELLERS  🔥
  // ═══════════════════════════════════════════

  async showBestSellers(): Promise<FlowResult> {
    const lang = this.lang;
    try {
      const products = await ProductService.getPopular(this.storeId, 8);

      if (products.length === 0) {
        const body = lang === 'ar'
          ? '🔥 لا توجد منتجات متاحة حالياً.'
          : '🔥 No products available right now.';
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.BROWSE,    title: cap(t('btnBrowse', lang), 20) },
              { id: BTN.MAIN_MENU, title: cap(t('btnMain', lang), 20) },
            ]},
          },
          newState: { state: 'main_menu' },
        };
      }

      const bestCur = lang === 'ar' ? 'ر.س' : 'SAR';
      const rows = products.slice(0, 10).map((p) => {
        const name = lang === 'ar' ? p.name_ar : (p.name_en ?? p.name_ar);
        const unit = unitLabel(p.unit, lang);
        // Limited-stock badge: in_stock AND stock_qty is set (not null)
        const isLimited = p.in_stock && p.stock_qty != null;
        const limitedLabel = isLimited
          ? (lang === 'ar' ? ' — متوفر محدود' : ' — Limited qty')
          : '';
        const titlePrefix = isLimited ? '🔥 ' : '';
        const stockBadge  = p.in_stock ? '' : ' ❌';
        return {
          id:          `prod_${p.id}`,
          title:       cap(`${titlePrefix}${name}${stockBadge}`, 24),
          description: `${price(p.price)} ${bestCur} / ${unit}${limitedLabel}`,
        };
      });

      const header     = lang === 'ar' ? '🔥 الأكثر طلباً اليوم'     : '🔥 Most Popular Today';
      const bodyText   = lang === 'ar'
        ? 'اختر من أبرز أصنافنا — تحديث يومي 📊'
        : 'Our top-rated dishes — updated daily 📊';

      return {
        response: {
          text: header, language: lang, suggestedUI: 'list',
          listData: {
            header,
            body: bodyText,
            buttonText: cap(t('bestBtn', lang), 20),
            sections: [{ title: lang === 'ar' ? 'أبرز الأصناف' : 'Top Dishes', rows }],
          },
        },
        newState: { state: 'browsing_products' },
      };
    } catch (err) {
      logger.warn({ err }, 'CatalogFlow: showBestSellers failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // CONTACT US  📞
  // ═══════════════════════════════════════════

  showContact(store: Store): FlowResult {
    const lang = this.lang;

    // Format working hours
    const hours = store.working_hours ?? {};
    const hoursLines = Object.entries(hours)
      .map(([day, time]) => `  ${day}: ${time}`)
      .join('\n');

    const phone = store.phone || (lang === 'ar' ? 'غير متوفر' : 'N/A');

    const body = lang === 'ar'
      ? `${t('contactTitle', lang)}\n\n` +
        `📱 *WhatsApp / هاتف:* ${phone}\n` +
        (hoursLines ? `\n🕐 *ساعات العمل:*\n${hoursLines}\n` : '') +
        `\n📍 *الموقع:* ${store.city ?? 'المملكة العربية السعودية'}\n\n` +
        `للشكاوى والاستفسارات، أرسل رسالتك وسيتواصل معك فريقنا في أقرب وقت.`
      : `${t('contactTitle', lang)}\n\n` +
        `📱 *WhatsApp / Phone:* ${phone}\n` +
        (hoursLines ? `\n🕐 *Working Hours:*\n${hoursLines}\n` : '') +
        `\n📍 *Location:* ${store.city ?? 'Saudi Arabia'}\n\n` +
        `For complaints and inquiries, send your message and our team will respond shortly.`;

    return {
      response: {
        text: body, language: lang, suggestedUI: 'buttons',
        buttons: { body, buttons: [
          { id: BTN.BROWSE,    title: cap(t('btnBrowse', lang), 20) },
          { id: BTN.MAIN_MENU, title: cap(t('btnMain', lang), 20) },
        ]},
      },
      newState: { state: 'main_menu' },
    };
  }

  // ═══════════════════════════════════════════
  // PRIVATE: ID ROUTER
  // ═══════════════════════════════════════════

  private async routeById(
    id: string,
    store: Store,
    customer: Customer,
    session: SessionData
  ): Promise<FlowResult | null> {

    // ── Main menu options ────────────────────────────────────────────────
    if (id === BTN.BROWSE || id === BTN.CART_ADD || id === BTN.CATEGORIES) return this.showCategories();
    if (id === BTN.SEARCH)      return this.searchPrompt();
    if (id === BTN.CART)        return this.cartView(customer, store);
    if (id === BTN.MAIN_MENU)   return this.mainMenu(store, customer);
    if (id === BTN.OFFERS)      return this.showOffers();
    if (id === BTN.BESTSELLERS) return this.showBestSellers();
    if (id === BTN.CONTACT)     return this.showContact(store);

    // ── Cart actions ─────────────────────────────────────────────────────
    if (id === BTN.CART_REMOVE)   return this.showRemoveList(customer);
    if (id === BTN.CART_CHECKOUT) {
      const co = new CheckoutFlow(this.storeId, this.lang);
      return co.startCheckout(customer, store, session);
    }

    // ── Order / checkout ─────────────────────────────────────────────────
    if (id === BTN.TRACK_ORDER) {
      const co = new CheckoutFlow(this.storeId, this.lang);
      return co.trackOrder(customer, store, session);
    }
    if (id === BTN.CHECKOUT_CONFIRM) {
      const co = new CheckoutFlow(this.storeId, this.lang);
      return co.confirmOrder(customer, store, session);
    }

    // ── Quick reorder ────────────────────────────────────────────────────
    if (id === BTN.REORDER) {
      const co = new CheckoutFlow(this.storeId, this.lang);
      return co.reorderLastOrder(customer, store, session);
    }

    // ── Cart modify menu ─────────────────────────────────────────────────
    if (id === BTN.MODIFY_CART) return this.showCartModifyList(customer);

    // ── Promo code ───────────────────────────────────────────────────────
    if (id === BTN.PROMO_CODE) {
      const lang = this.lang;
      const body = lang === 'ar' ? '🎁 أدخل كود الخصم:' : '🎁 Enter your promo code:';
      return { response: { text: body, language: lang, suggestedUI: 'text' }, newState: { state: 'entering_promo_code' } };
    }

    // ── Cart item select for modification: "cart_modify_{uuid}" ─────────
    if (id.startsWith('cart_modify_') && id !== BTN.MODIFY_CART) {
      return this.showCartItemActions(id.slice(12), customer);
    }

    // ── Qty up/down: "qty_up_{uuid}" / "qty_down_{uuid}" ────────────────
    if (id.startsWith('qty_up_')) {
      return this.updateCartQty(customer.id, id.slice(7), +1, store);
    }
    if (id.startsWith('qty_down_')) {
      return this.updateCartQty(customer.id, id.slice(9), -1, store);
    }

    // ── Saved address selection: "saved_addr_{index}" ────────────────────
    if (id.startsWith('saved_addr_')) {
      const idx = parseInt(id.slice(11), 10);
      const addresses = session.checkoutSavedAddresses || [];
      const addr = !isNaN(idx) ? addresses[idx] : undefined;
      if (addr) {
        const co = new CheckoutFlow(this.storeId, this.lang);
        return co.useSavedAddress(addr, store, session);
      }
    }

    // ── New address (from saved-address list): "new_address" ─────────────
    if (id === 'new_address') {
      const lang = this.lang;
      const prompt = lang === 'ar'
        ? '📍 *أدخل عنوان التوصيل:*\n\nاكتب الحي، الشارع، وأقرب معلم\n\n_أو اضغط 📎 → الموقع لإرسال موقعك مباشرة_'
        : '📍 *Enter delivery address:*\n\nType your neighborhood, street, and landmark\n\n_Or tap 📎 → Location to share your pin directly_';
      return { response: { text: prompt, language: lang, suggestedUI: 'text' }, newState: { state: 'checkout_address' } };
    }

    // ── Zone selection: "zone_{index}" ───────────────────────────────────
    if (id.startsWith('zone_')) {
      const idx = parseInt(id.slice(5), 10);
      if (!isNaN(idx)) {
        const co = new CheckoutFlow(this.storeId, this.lang);
        return co.selectZone(idx, customer, store, session);
      }
    }

    // ── Payment method: "pay_{method}" ───────────────────────────────────
    if (id.startsWith('pay_')) {
      const method = id.slice(4);
      const co = new CheckoutFlow(this.storeId, this.lang);
      return co.selectPayment(method, customer, store, session);
    }

    // ── Cancel order: "cancel_order_{uuid}" ─────────────────────────────
    if (id.startsWith('cancel_order_')) {
      const orderId = id.slice(13);
      const co = new CheckoutFlow(this.storeId, this.lang);
      return co.cancelOrder(orderId, customer, store);
    }

    // ── Category: "cat_{uuid}" ───────────────────────────────────────────
    if (id.startsWith('cat_')) {
      const catId   = id.slice(4);
      const catName = await this.resolveCategoryName(catId);
      return this.showProducts(catId, catName);
    }

    // ── Product: "prod_{uuid}" ───────────────────────────────────────────
    if (id.startsWith('prod_')) {
      return this.showProductDetail(id.slice(5)); // always returns FlowResult
    }

    // ── Preset qty: "qty_{36-char-uuid}_{qty}_{unit}" ────────────────────
    if (id.startsWith('qty_')) {
      const withoutPrefix = id.slice(4);               // remove "qty_"
      if (withoutPrefix.length > 36) {
        const productId  = withoutPrefix.slice(0, 36); // UUID always 36 chars
        const rest       = withoutPrefix.slice(37);     // skip the underscore
        const uIdx       = rest.indexOf('_');
        if (uIdx !== -1) {
          const qty  = parseFloat(rest.slice(0, uIdx));
          const unit = rest.slice(uIdx + 1);
          if (!isNaN(qty) && qty > 0) {
            return this.addToCart(customer.id, productId, qty, unit, store, session);
          }
        }
      }
    }

    // ── Custom qty prompt: "custom_qty_{uuid}_{unit}" ────────────────────
    if (id.startsWith('custom_qty_')) {
      const withoutPrefix = id.slice(11);               // remove "custom_qty_"
      if (withoutPrefix.length > 36) {
        const productId = withoutPrefix.slice(0, 36);
        const unit      = withoutPrefix.slice(37);
        const name      = session.productName || await this.resolveProductName(productId);
        const unitStr   = unitLabel(unit, this.lang);
        const body      = t('customQtyPrompt', this.lang, { name, unit: unitStr });
        return {
          response: { text: body, language: this.lang, suggestedUI: 'text' },
          newState: {
            state:       'entering_custom_qty',
            productId,
            productUnit: unit,
            productName: name,
          },
        };
      }
    }

    // ── Remove item: "remove_{uuid}" ─────────────────────────────────────
    if (id.startsWith('remove_')) {
      return this.removeItem(customer.id, id.slice(7), store);
    }

    // ── Special instructions: "skip_instructions" ────────────────────────
    // After skipping instructions, suggest continuing to browse or go to cart
    if (id === 'skip_instructions') {
      const lang = this.lang;
      const body = lang === 'ar'
        ? '👍 تمام! هل تريد إضافة المزيد أو إتمام الطلب؟'
        : '👍 Got it! Add more dishes or place your order?';
      return {
        response: {
          text: body, language: lang, suggestedUI: 'buttons',
          buttons: { body, buttons: [
            { id: BTN.BROWSE,        title: cap(lang === 'ar' ? 'أضف المزيد 🍽️' : 'Add More 🍽️',   20) },
            { id: BTN.CART,          title: cap(lang === 'ar' ? 'طلبي 🛒'        : 'My Order 🛒',   20) },
            { id: BTN.CART_CHECKOUT, title: cap(lang === 'ar' ? 'إتمام الطلب ✅' : 'Checkout ✅',   20) },
          ]},
        },
        newState: { state: 'main_menu' },
      };
    }

    // ── Special instructions: "special_instr_{uuid}" ─────────────────────
    if (id.startsWith('special_instr_')) {
      const productId = id.slice(14); // remove "special_instr_"
      const lang = this.lang;
      const body = lang === 'ar'
        ? 'اكتب ملاحظاتك للطلب (مثال: بدون بصل، حار زيادة، طهي جيد):'
        : 'Type your special instructions (e.g. no onions, extra spicy, well done):';
      return {
        response: { text: body, language: lang, suggestedUI: 'text' },
        newState: { state: 'entering_special_instructions', productId },
      };
    }

    // ── Order rating: "rate_{1|3|5}_{uuid}" ──────────────────────────────
    if (id.startsWith('rate_')) {
      return this.handleRating(id, store, customer);
    }

    return null; // unknown
  }

  // ═══════════════════════════════════════════
  // PRIVATE: SPECIAL INSTRUCTIONS
  // ═══════════════════════════════════════════

  /**
   * User typed their special instructions for the first cart item.
   * Update the cart item's special_instructions field and confirm.
   */
  private async handleSpecialInstructions(
    text: string,
    customer: Customer,
    session: SessionData
  ): Promise<FlowResult> {
    const lang = this.lang;
    const productId = session.productId;

    if (!productId) return this.errorResponse();

    try {
      // Load the cart, find the item, update its special_instructions field,
      // then write the updated items array back to the DB directly.
      const cart = await CartService.getOrCreate(this.storeId, customer.id);
      const itemIdx = cart.items.findIndex((i) => i.product_id === productId);
      if (itemIdx >= 0) {
        cart.items[itemIdx].special_instructions = text.trim();
        // Write updated items back to DB (bypass private persist via direct query)
        await query(
          `UPDATE carts
           SET items = $1::jsonb, updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(cart.items), cart.id]
        );
        // Invalidate Redis cache so next read gets fresh data
        const { invalidateCartCache } = await import('../database/redis');
        await invalidateCartCache(customer.id);
      }

      const confirmText = lang === 'ar'
        ? `✅ تم حفظ الملاحظات:\n"${text.trim()}"`
        : `✅ Instructions saved:\n"${text.trim()}"`;

      return {
        response: {
          text: confirmText, language: lang, suggestedUI: 'buttons',
          buttons: { body: confirmText, buttons: [
            { id: BTN.BROWSE,        title: cap(t('btnContinue', lang), 20) },
            { id: BTN.CART,          title: cap(t('btnViewCart', lang), 20) },
            { id: BTN.CART_CHECKOUT, title: cap(t('btnCheckoutAction', lang), 20) },
          ]},
        },
        newState: { state: 'main_menu' },
      };
    } catch (err) {
      logger.warn({ err, customerId: customer.id, productId }, 'handleSpecialInstructions failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // PRIVATE: ORDER RATING
  // ═══════════════════════════════════════════

  /**
   * Handle a rating button tap: "rate_{score}_{orderId}"
   * Logs an analytics event and replies with a thank-you message.
   */
  private handleRating(id: string, _store: Store, customer: Customer): FlowResult {
    const lang = this.lang;
    // id format: "rate_{1|3|5}_{orderId}"
    const withoutPrefix = id.slice(5); // remove "rate_"
    const underscoreIdx = withoutPrefix.indexOf('_');
    const score = underscoreIdx > 0 ? parseInt(withoutPrefix.slice(0, underscoreIdx), 10) : NaN;
    const orderId = underscoreIdx > 0 ? withoutPrefix.slice(underscoreIdx + 1) : '';

    if (!isNaN(score) && orderId) {
      AnalyticsService.log('order_rated', this.storeId, customer.id, { score, orderId });
    }

    let reply: string;
    if (score >= 5) {
      reply = lang === 'ar'
        ? 'شكراً جزيلاً! 🌟 يسعدنا أنك راضٍ عن تجربتك. نتطلع لخدمتك دائماً 😊'
        : 'Thank you so much! 🌟 We\'re glad you had a great experience. See you again! 😊';
    } else if (score >= 3) {
      reply = lang === 'ar'
        ? 'شكراً لتقييمك! 😊 نسعى دائماً للتحسين. نتطلع لخدمتك مجدداً.'
        : 'Thank you for your feedback! 😊 We\'re always working to improve. Hope to serve you again!';
    } else {
      reply = lang === 'ar'
        ? 'شكراً لتقييمك 🙏 نعتذر عن أي تقصير. سنعمل على تحسين تجربتك في المرة القادمة.'
        : 'Thank you for your feedback 🙏 We\'re sorry for any shortcomings. We\'ll do better next time.';
    }

    return {
      response: {
        text: reply, language: lang, suggestedUI: 'buttons',
        buttons: { body: reply, buttons: [
          { id: BTN.BROWSE, title: cap(lang === 'ar' ? 'طلب جديد 🍽️' : 'New Order 🍽️', 20) },
          { id: BTN.MAIN_MENU, title: cap(t('btnMain', lang), 20) },
        ]},
      },
      newState: { state: 'main_menu' },
    };
  }

  // ═══════════════════════════════════════════
  // PRIVATE: AUTO-SEARCH FROM NATURAL TEXT
  // ═══════════════════════════════════════════

  /** Strip Arabic/English search prefixes so "ابغى موز" → "موز". */
  private stripSearchPrefixes(content: string): string {
    const patterns = [
      /^(?:أبي|ابي|أبغى|ابغى|بدي|أريد|اريد|عندكم|بكم|كم سعر|وش سعر|سعر|محتاج|احتاج|اشتري|ابا|اجيب|حابب|حاب|ودي|ودّي|أودي|اودي|بغيت|ابغيت|اشوف|أشوف)\s+/i,
      /^(?:i want|i need|do you have|how much (?:is|for)|price of|looking for|find me|get me|buy|add|search for|search|show me|got any)\s+/i,
    ];
    let result = content.trim();
    for (const p of patterns) {
      const stripped = result.replace(p, '').trim();
      if (stripped !== result && stripped.length > 0) { result = stripped; break; }
    }
    return result.replace(/[؟?!.,]+$/, '').trim();
  }

  private async tryAutoSearch(
    content: string,
    lang: string,
    categoryId?: string
  ): Promise<FlowResult | null> {
    const searchQuery = this.stripSearchPrefixes(content);
    if (searchQuery.length < 2 || /^\d+$/.test(searchQuery)) return null;
    const hasArabic = /[\u0600-\u06FF]/.test(searchQuery);
    const hasLatin  = /[a-zA-Z]{2,}/.test(searchQuery);
    if (!hasArabic && !hasLatin) return null;

    try {
      // If searching within a category, try category-scoped search first
      if (categoryId) {
        const catResult = await ProductService.search(this.storeId, searchQuery, { limit: 1, categoryId });
        if (catResult.products.length > 0) {
          logger.debug({ searchQuery, categoryId }, 'CatalogFlow: in-category auto-search matched');
          return this.searchProducts(searchQuery, lang);
        }
      }

      // Fall back to store-wide search
      const result = await ProductService.search(this.storeId, searchQuery, { limit: 1 });
      if (result.products.length === 0) return null;
      logger.debug({ searchQuery, original: content }, 'CatalogFlow: auto-search matched');
      return this.searchProducts(searchQuery, lang);
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════
  // PRIVATE: RESOLVERS
  // ═══════════════════════════════════════════

  private async resolveCategoryName(categoryId: string): Promise<string> {
    try {
      const cats = await ProductService.getCategories(this.storeId);
      const cat  = cats.find((c) => c.id === categoryId);
      if (cat) return this.lang === 'ar' ? cat.name_ar : (cat.name_en ?? cat.name_ar);
    } catch { /* ignore */ }
    return this.lang === 'ar' ? 'المنتجات' : 'Products';
  }

  private async resolveProductName(productId: string): Promise<string> {
    try {
      const p = await ProductService.getById(this.storeId, productId);
      if (p) return this.lang === 'ar' ? p.name_ar : (p.name_en ?? p.name_ar);
    } catch { /* ignore */ }
    return this.lang === 'ar' ? 'المنتج' : 'Product';
  }

  // ═══════════════════════════════════════════
  // PRIVATE: GENERIC RESPONSES
  // ═══════════════════════════════════════════

  /**
   * Unknown interactive ID — show a friendly clarification then the full
   * two-card menu so the user always has a clear next step.
   */
  private unknownMessageResponse(lang: string): FlowResult {
    const hint = lang === 'ar'
      ? 'لم أفهم طلبك 😊\nاختر من القائمة:'
      : "I didn't understand 😊\nChoose from the menu:";

    const discoverHeader = lang === 'ar' ? '✨ اكتشف المزيد' : '✨ Discover More';
    const discoverBody   = lang === 'ar' ? 'عروض، مبيعات، وتواصل معنا:' : 'Offers, top sellers, and support:';

    return {
      response: {
        text: hint,
        language: lang,
        suggestedUI: 'buttons',
        buttons: {
          body: hint,
          buttons: [
            { id: BTN.BROWSE, title: cap(lang === 'ar' ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️', 20) },
            { id: BTN.SEARCH, title: cap(lang === 'ar' ? 'بحث 🔍'            : 'Search 🔍',           20) },
            { id: BTN.CART,   title: cap(lang === 'ar' ? 'سلتي 🛒'           : 'My Cart 🛒',          20) },
          ],
        },
        followUp: {
          text: discoverBody,
          language: lang,
          suggestedUI: 'buttons',
          buttons: {
            header: discoverHeader,
            body:   discoverBody,
            buttons: [
              { id: BTN.OFFERS,      title: cap(lang === 'ar' ? 'عروض خاصة 🎁'    : 'Special Offers 🎁', 20) },
              { id: BTN.BESTSELLERS, title: cap(lang === 'ar' ? 'الأكثر مبيعاً 🔥' : 'Best Sellers 🔥',   20) },
              { id: BTN.CONTACT,     title: cap(lang === 'ar' ? 'تواصل معنا 📞'    : 'Contact Us 📞',     20) },
            ],
          },
        },
      },
      newState: { state: 'idle' },
    };
  }

  // ═══════════════════════════════════════════
  // CART MODIFY LIST  🔧
  // ═══════════════════════════════════════════

  async showCartModifyList(customer: Customer): Promise<FlowResult> {
    const lang = this.lang;
    try {
      const cart = await CartService.getOrCreate(this.storeId, customer.id);
      if (cart.items.length === 0) {
        const body = t('cartEmpty', lang);
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.BROWSE, title: cap(t('btnBrowse', lang), 20) },
              { id: BTN.SEARCH, title: cap(t('btnSearch', lang), 20) },
            ]},
          },
          newState: { state: 'cart_view' },
        };
      }
      const c = lang === 'ar' ? 'ر.س' : 'SAR';
      const rows = cart.items.map((item) => ({
        id:          `cart_modify_${item.product_id}`,
        title:       cap(lang === 'ar' ? item.name_ar : (item.name_en ?? item.name_ar), 24),
        description: `${parseFloat(String(item.quantity))} × ${parseFloat(String(item.price)).toFixed(2)} ${c}`,
      }));
      const header = lang === 'ar' ? '🔧 اختر صنفاً للتعديل'                           : '🔧 Choose item to modify';
      const body   = lang === 'ar' ? 'اضغط على الصنف لتعديل كميته أو حذفه:'           : 'Tap an item to change its quantity or remove it:';
      return {
        response: {
          text: body, language: lang, suggestedUI: 'list',
          listData: {
            header, body,
            buttonText: cap(lang === 'ar' ? 'اختر صنفاً' : 'Select Item', 20),
            sections: [{ title: lang === 'ar' ? 'منتجات الطلب' : 'Order Items', rows }],
          },
        },
        newState: { state: 'modifying_cart_item' },
      };
    } catch (err) {
      logger.error({ err }, 'showCartModifyList failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // CART ITEM ACTIONS  (+1 / -1 / حذف)
  // ═══════════════════════════════════════════

  private async showCartItemActions(productId: string, customer: Customer): Promise<FlowResult> {
    const lang = this.lang;
    try {
      const cart = await CartService.getOrCreate(this.storeId, customer.id);
      const item = cart.items.find((i) => i.product_id === productId);
      if (!item) return this.errorResponse();

      const name = lang === 'ar' ? item.name_ar : (item.name_en ?? item.name_ar);
      const qty  = parseFloat(String(item.quantity));
      const c    = lang === 'ar' ? 'ر.س' : 'SAR';
      const body = lang === 'ar'
        ? `🔧 *${name}*\nالكمية الحالية: *${qty}*\nالسعر: ${parseFloat(String(item.subtotal)).toFixed(2)} ${c}\n\nاختر الإجراء:`
        : `🔧 *${name}*\nCurrent qty: *${qty}*\nSubtotal: ${parseFloat(String(item.subtotal)).toFixed(2)} ${c}\n\nChoose action:`;

      const decreaseTitle = qty <= 1
        ? cap(lang === 'ar' ? 'حذف ❌'             : 'Remove ❌',              20)
        : cap(lang === 'ar' ? `نقص كمية (${qty - 1})` : `Decrease (${qty - 1})`, 20);

      return {
        response: {
          text: body, language: lang, suggestedUI: 'buttons',
          buttons: { body, buttons: [
            { id: `qty_up_${productId}`,   title: cap(lang === 'ar' ? `زيادة كمية (${qty + 1})` : `Increase (${qty + 1})`, 20) },
            { id: `qty_down_${productId}`, title: decreaseTitle },
            { id: BTN.CART,               title: cap(lang === 'ar' ? 'رجوع للطلب 🔙' : 'Back to Order 🔙', 20) },
          ]},
        },
        newState: { state: 'modifying_cart_item', modifyingProductId: productId },
      };
    } catch (err) {
      logger.error({ err }, 'showCartItemActions failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // CART QTY UPDATE  (+delta)
  // ═══════════════════════════════════════════

  private async updateCartQty(
    customerId: string,
    productId: string,
    delta: number,
    store: Store
  ): Promise<FlowResult> {
    const lang = this.lang;
    try {
      const cart = await CartService.getOrCreate(this.storeId, customerId);
      const item = cart.items.find((i) => i.product_id === productId);
      if (!item) return this.errorResponse();

      const newQty = parseFloat(String(item.quantity)) + delta;
      await CartService.setQuantity(this.storeId, customerId, productId, newQty);

      const name = lang === 'ar' ? item.name_ar : (item.name_en ?? item.name_ar);
      const confirmText = newQty <= 0
        ? (lang === 'ar' ? `✅ تم حذف *${name}* من طلبك.`              : `✅ *${name}* removed from your order.`)
        : (lang === 'ar' ? `✅ *${name}* — الكمية الجديدة: ${newQty}` : `✅ *${name}* — new qty: ${newQty}`);

      const cartResult = await this.cartView({ id: customerId } as Customer, store);
      const prefix     = confirmText + '\n\n';
      const newText    = (prefix + cartResult.response.text).substring(0, 1020);
      cartResult.response.text = newText;
      if (cartResult.response.buttons) cartResult.response.buttons.body = newText;
      return cartResult;
    } catch (err) {
      logger.error({ err }, 'updateCartQty failed');
      return this.errorResponse();
    }
  }

  // ═══════════════════════════════════════════
  // PROMO CODE APPLICATION
  // ═══════════════════════════════════════════

  private async applyPromoCode(code: string, customer: Customer, store: Store): Promise<FlowResult> {
    const lang    = this.lang;
    const trimmed = code.trim().toUpperCase();

    if (trimmed.length < 2) {
      const body = lang === 'ar' ? '❌ كود غير صحيح. أدخل كود الخصم مرة أخرى:' : '❌ Invalid code. Enter promo code again:';
      return { response: { text: body, language: lang, suggestedUI: 'text' }, newState: { state: 'entering_promo_code' } };
    }

    try {
      const { PromotionService } = await import('../services/promotion');
      const cart     = await CartService.getOrCreate(this.storeId, customer.id);
      const subtotal = cart.items.reduce((s, i) => s + parseFloat(String(i.subtotal)), 0);

      const result = await PromotionService.validateCode(this.storeId, trimmed, subtotal);

      if (!result.valid) {
        const body = lang === 'ar'
          ? `❌ الكود *${trimmed}* غير صالح أو منتهي.\nتأكد من الكود وأعد المحاولة:`
          : `❌ Code *${trimmed}* is invalid or expired.\nCheck and try again:`;
        return {
          response: {
            text: body, language: lang, suggestedUI: 'buttons',
            buttons: { body, buttons: [
              { id: BTN.PROMO_CODE, title: cap(lang === 'ar' ? 'أعد إدخال الكود' : 'Try Again', 20) },
              { id: BTN.CART,       title: cap(lang === 'ar' ? 'رجوع للطلب 🔙'  : 'Back to Order 🔙', 20) },
            ]},
          },
          newState: { state: 'cart_view' },
        };
      }

      // Apply the discount to the cart
      await PromotionService.applyPromotion(this.storeId, cart.id, result);
      if (result.promotion) PromotionService.incrementUsage(result.promotion.id);

      const discountStr = result.discountAmount.toFixed(2);
      const successText = lang === 'ar'
        ? `🎉 تم تطبيق الكود *${trimmed}*!\nالخصم: ${discountStr} ر.س`
        : `🎉 Code *${trimmed}* applied!\nDiscount: SAR ${discountStr}`;

      const cartResult  = await this.cartView(customer, store);
      const combined    = (successText + '\n\n' + cartResult.response.text).substring(0, 1020);
      cartResult.response.text = combined;
      if (cartResult.response.buttons) cartResult.response.buttons.body = combined;
      return cartResult;
    } catch {
      // PromotionService.validateAndApply may not exist yet — graceful fallback
      const body = lang === 'ar'
        ? `❌ تعذر التحقق من الكود *${trimmed}*. حاول لاحقاً.`
        : `❌ Could not verify code *${trimmed}*. Try again later.`;
      return {
        response: {
          text: body, language: lang, suggestedUI: 'buttons',
          buttons: { body, buttons: [{ id: BTN.CART, title: cap(lang === 'ar' ? 'رجوع للطلب 🔙' : 'Back to Order', 20) }] },
        },
        newState: { state: 'cart_view' },
      };
    }
  }

  private errorResponse(): FlowResult {
    const lang = this.lang;
    const body = lang === 'ar' ? 'عذراً، حصل خطأ. حاول مرة ثانية.' : 'Sorry, an error occurred. Please try again.';
    return {
      response: {
        text: body, language: lang, suggestedUI: 'buttons',
        buttons: { body, buttons: [{ id: BTN.MAIN_MENU, title: cap(t('btnMain', lang), 20) }] },
      },
      newState: { state: 'idle' },
    };
  }
}
