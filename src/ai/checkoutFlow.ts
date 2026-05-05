/**
 * CheckoutFlow — multi-step checkout, order tracking, and cancellation.
 *
 * Step 1  startCheckout()   — validate cart, show delivery zone list
 * Step 2  selectZone()      — zone chosen → save fee → ask for address / location pin
 * Step 3a receiveAddress()  — user typed address text  → show payment list
 * Step 3b receiveLocation() — user sent WhatsApp location pin → confirm + show payment list
 * Step 4  selectPayment()   — payment chosen → show full order summary + confirm btn
 * Step 5  confirmOrder()    — confirm tapped → create order in DB, clear cart
 *
 * Extras: trackOrder(), cancelOrder()
 *
 * Payment method categories:
 *   Pay Now      → sabaka, transfer, mada, apple_pay, stc_pay
 *   On Delivery  → cash, cod
 */

import { Store, Customer } from '../types';
import { FlowResult, SessionData } from '../services/session';
import { CartService } from '../services/cart';
import { OrderService } from '../services/order';
import { logger } from '../utils/logger';

/** Currency symbol based on language. */
function cur(lang: string): string {
  return lang === 'ar' ? 'ر.س' : 'SAR';
}

/**
 * Smart body truncation: never cuts off the order total.
 * Truncates the item lines but always preserves the footer (separator → end).
 */
function smartTruncate(text: string, max = 1000): string {
  if (text.length <= max) return text;
  const sepIdx = text.lastIndexOf('─────────────');
  if (sepIdx > 0) {
    const footer    = text.slice(sepIdx);                  // "──── … الإجمالي … "
    const available = max - footer.length - 5;             // room for header + "...\n"
    if (available > 40) {
      return text.slice(0, available) + '...\n\n' + footer;
    }
  }
  return text.substring(0, max - 3) + '...';
}

// ─── Local button IDs (mirrors BTN in catalogFlow — keep in sync) ──────────

const B = {
  MAIN_MENU:        'back_main',
  BROWSE:           'menu_browse',
  CART:             'menu_cart',
  TRACK_ORDER:      'track_order',
  CHECKOUT_CONFIRM: 'checkout_confirm',
} as const;

// ─── Payment method categorisation ────────────────────────────────────────

const PAY_NOW_METHODS      = new Set(['sabaka', 'transfer', 'mada', 'apple_pay', 'stc_pay']);
const PAY_DELIVERY_METHODS = new Set(['cash', 'cod']);

// ─── Helpers ───────────────────────────────────────────────────────────────

function cap(str: string, max: number): string {
  return str.length <= max ? str : str.substring(0, max - 1) + '…';
}

function fmt(v: number | string): string {
  return parseFloat(String(v)).toFixed(2);
}

function payLabel(method: string, lang: string): string {
  const map: Record<string, { ar: string; en: string }> = {
    cash:      { ar: 'نقداً عند الاستلام 💵',  en: 'Cash on Delivery 💵'  },
    cod:       { ar: 'نقداً عند الاستلام 💵',  en: 'Cash on Delivery 💵'  },
    sabaka:    { ar: 'سبكة 💳',               en: 'Sabaka 💳'             },
    transfer:  { ar: 'تحويل بنكي 🏦',         en: 'Bank Transfer 🏦'      },
    mada:      { ar: 'بطاقة مدى 💳',          en: 'Mada Card 💳'          },
    apple_pay: { ar: 'Apple Pay 🍎',           en: 'Apple Pay 🍎'          },
    stc_pay:   { ar: 'STC Pay 📱',            en: 'STC Pay 📱'            },
  };
  return lang === 'ar' ? (map[method]?.ar ?? method) : (map[method]?.en ?? method);
}

function payDesc(method: string, lang: string): string {
  const map: Record<string, { ar: string; en: string }> = {
    cash:      { ar: 'ادفع نقداً عند وصول الطلب',    en: 'Pay cash when order arrives'    },
    cod:       { ar: 'ادفع نقداً عند وصول الطلب',    en: 'Pay cash when order arrives'    },
    sabaka:    { ar: 'ادفع الآن عبر سبكة',           en: 'Pay now via Sabaka'              },
    transfer:  { ar: 'تحويل بنكي فوري — ادفع الآن', en: 'Instant bank transfer — pay now' },
    mada:      { ar: 'دفع إلكتروني بالبطاقة الآن',   en: 'Pay now by Mada card'            },
    apple_pay: { ar: 'دفع سريع الآن عبر Apple Pay',  en: 'Pay now via Apple Pay'           },
    stc_pay:   { ar: 'دفع سريع الآن عبر STC Pay',   en: 'Pay now via STC Pay'             },
  };
  return lang === 'ar' ? (map[method]?.ar ?? '') : (map[method]?.en ?? '');
}

/**
 * Build WhatsApp list sections for payment methods.
 * Splits methods into "Pay Now" and "Pay on Delivery" sections.
 */
function buildPaymentSections(
  methods: string[],
  lang: string
): { title: string; rows: { id: string; title: string; description?: string }[] }[] {
  const nowRows  = methods.filter((m) => PAY_NOW_METHODS.has(m));
  const codRows  = methods.filter((m) => PAY_DELIVERY_METHODS.has(m));

  const sections: { title: string; rows: { id: string; title: string; description?: string }[] }[] = [];

  if (nowRows.length > 0) {
    sections.push({
      title: lang === 'ar' ? '💳 الدفع الآن' : '💳 Pay Now',
      rows: nowRows.map((m) => ({
        id:          `pay_${m}`,
        title:       cap(payLabel(m, lang), 24),
        description: payDesc(m, lang),
      })),
    });
  }

  if (codRows.length > 0) {
    sections.push({
      title: lang === 'ar' ? '💵 الدفع عند الاستلام' : '💵 Pay on Delivery',
      rows: codRows.map((m) => ({
        id:          `pay_${m}`,
        title:       cap(payLabel(m, lang), 24),
        description: payDesc(m, lang),
      })),
    });
  }

  // Fallback: if no section matched (unknown methods), put everything in one section
  if (sections.length === 0) {
    sections.push({
      title: lang === 'ar' ? 'طرق الدفع' : 'Payment Methods',
      rows: methods.map((m) => ({
        id:          `pay_${m}`,
        title:       cap(payLabel(m, lang), 24),
        description: payDesc(m, lang),
      })),
    });
  }

  return sections;
}

/** Address prompt text — mentions both typing AND sharing location. */
function addressPrompt(lang: string): string {
  return lang === 'ar'
    ? '📍 *أدخل عنوان التوصيل:*\n\nاكتب الحي، الشارع، وأقرب معلم\n\n_أو اضغط 📎 → الموقع لإرسال موقعك مباشرة_'
    : '📍 *Enter delivery address:*\n\nType your neighborhood, street, and landmark\n\n_Or tap 📎 → Location to share your pin directly_';
}

// ─── CheckoutFlow ──────────────────────────────────────────────────────────

export class CheckoutFlow {
  constructor(private storeId: string, private lang: string) {}

  // ══════════════════════════════════════════
  // STEP 1 — Validate cart → show zone list
  // ══════════════════════════════════════════

  async startCheckout(customer: Customer, store: Store, _session: SessionData): Promise<FlowResult> {
    const lang = this.lang;

    // ── Working-hours check ───────────────────────────────────────────────
    // If store is closed, inform customer but still allow them to see cart.
    const hoursInfo = this.checkWorkingHours(store);
    if (!hoursInfo.isOpen) {
      const closeMsg = lang === 'ar'
        ? `⏰ *المطعم مغلق حالياً*\n\nساعات العمل:\n${hoursInfo.hoursDisplay}\n\nيمكنك إضافة طلبك الآن وتأكيده عند الفتح 🛒`
        : `⏰ *Restaurant is currently closed*\n\nWorking hours:\n${hoursInfo.hoursDisplay}\n\nYou can build your order now and confirm when we open 🛒`;
      return this.btnResponse(closeMsg, lang, [
        { id: B.BROWSE,    title: lang === 'ar' ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️' },
        { id: B.MAIN_MENU, title: lang === 'ar' ? 'القائمة 🏠'       : 'Main Menu 🏠'   },
      ], 'cart_view');
    }

    const cart = await CartService.getOrCreate(this.storeId, customer.id);
    if (cart.items.length === 0) {
      const body = lang === 'ar'
        ? '🍽️ طلبك فارغ! أضف أصناف أولاً.'
        : '🍽️ Your order is empty! Add items first.';
      return this.btnResponse(body, lang, [
        { id: B.BROWSE,    title: lang === 'ar' ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️' },
        { id: B.MAIN_MENU, title: lang === 'ar' ? 'القائمة 🏠'       : 'Main Menu 🏠'   },
      ], 'main_menu');
    }

    const subtotal = cart.items.reduce((s, i) => s + parseFloat(String(i.subtotal)), 0);
    const minOrder = parseFloat(String(store.min_order)) || 30;

    if (subtotal < minOrder) {
      const body = lang === 'ar'
        ? `❌ الحد الأدنى للطلب ${fmt(minOrder)} ر.س\nإجمالي طلبك: ${fmt(subtotal)} ر.س\n\nأضف المزيد من الأصناف للمتابعة.`
        : `❌ Minimum order is SAR ${fmt(minOrder)}\nOrder total: SAR ${fmt(subtotal)}\n\nAdd more dishes to continue.`;
      return this.btnResponse(body, lang, [
        { id: B.BROWSE, title: lang === 'ar' ? 'إضافة أصناف 🍽️' : 'Add Dishes 🍽️' },
        { id: B.CART,   title: lang === 'ar' ? 'طلبي 🍽️'         : 'My Order 🍽️'  },
      ], 'cart_view');
    }

    const zones = Array.isArray(store.delivery_zones) ? store.delivery_zones : [];

    // No zones → skip straight to address / location input
    if (zones.length === 0) {
      const fee  = parseFloat(String(store.delivery_fee)) || 10;
      return {
        response: { text: addressPrompt(lang), language: lang, suggestedUI: 'text' },
        newState: {
          state:               'checkout_address',
          checkoutZoneName:    lang === 'ar' ? 'داخل المدينة' : 'City',
          checkoutDeliveryFee: fee,
        },
      };
    }

    // Show zone list
    const rows = zones.slice(0, 10).map((z, idx) => ({
      id:          `zone_${idx}`,
      title:       cap(lang === 'ar' ? z.name_ar : z.name, 24),
      description: `${lang === 'ar' ? 'التوصيل' : 'Delivery'}: ${fmt(z.fee)} ر.س`,
    }));

    const header = lang === 'ar' ? '🛒 إتمام الطلب — اختر المنطقة' : '🛒 Checkout — Select Zone';
    const body   = lang === 'ar'
      ? '1️⃣ المنطقة  →  2️⃣ العنوان  →  3️⃣ الدفع\n\nاختر أقرب منطقة توصيل:'
      : '1️⃣ Zone  →  2️⃣ Address  →  3️⃣ Payment\n\nChoose your delivery zone:';

    return {
      response: {
        text: header, language: lang, suggestedUI: 'list',
        listData: {
          header, body,
          buttonText: cap(lang === 'ar' ? 'اختر المنطقة' : 'Select Zone', 20),
          sections: [{ title: lang === 'ar' ? 'مناطق التوصيل' : 'Delivery Zones', rows }],
        },
      },
      newState: { state: 'checkout_zones' },
    };
  }

  // ══════════════════════════════════════════
  // STEP 2 — Zone tapped → prompt address/location
  // ══════════════════════════════════════════

  async selectZone(
    zoneIndex: number,
    customer: Customer,
    store: Store,
    session: SessionData
  ): Promise<FlowResult> {
    const lang  = this.lang;
    const zones = Array.isArray(store.delivery_zones) ? store.delivery_zones : [];
    const zone  = zones[zoneIndex];

    if (!zone) return this.startCheckout(customer, store, session);

    const zoneName = lang === 'ar' ? zone.name_ar : zone.name;
    const fee      = Math.max(0, parseFloat(String(zone.fee)) || 10);

    // Zone-specific min order check
    const cart     = await CartService.getOrCreate(this.storeId, customer.id);
    const subtotal = cart.items.reduce((s, i) => s + parseFloat(String(i.subtotal)), 0);
    const zoneMin  = parseFloat(String(zone.min_order)) || parseFloat(String(store.min_order)) || 30;

    if (subtotal < zoneMin) {
      const body = lang === 'ar'
        ? `❌ الحد الأدنى للطلب في *${zoneName}* هو ${fmt(zoneMin)} ر.س\nإجمالي طلبك: ${fmt(subtotal)} ر.س`
        : `❌ Minimum order for *${zoneName}* is SAR ${fmt(zoneMin)}\nOrder total: SAR ${fmt(subtotal)}`;
      return this.btnResponse(body, lang, [
        { id: B.BROWSE, title: lang === 'ar' ? 'إضافة أصناف 🍽️' : 'Add Dishes 🍽️' },
        { id: B.CART,   title: lang === 'ar' ? 'طلبي 🍽️'         : 'My Order 🍽️'  },
      ], 'cart_view');
    }

    // Offer saved addresses if the customer has any
    interface SavedAddress { label?: string; address: string; is_default?: boolean }
    const savedAddresses: SavedAddress[] = Array.isArray(
      (customer as Customer & { addresses?: unknown }).addresses
    ) ? (customer as Customer & { addresses?: SavedAddress[] }).addresses as SavedAddress[] : [];

    if (savedAddresses.length > 0) {
      const rows = savedAddresses.slice(0, 4).map((a, idx) => ({
        id:          `saved_addr_${idx}`,
        title:       cap(a.label || (lang === 'ar' ? 'عنوان محفوظ' : 'Saved Address'), 24),
        description: cap(a.address, 72),
      }));
      rows.push({
        id:          'new_address',
        title:       cap(lang === 'ar' ? '📍 عنوان جديد' : '📍 New Address', 24),
        description: lang === 'ar' ? 'أدخل عنواناً مختلفاً' : 'Type a different address',
      });

      const header = lang === 'ar' ? '2️⃣ اختر عنوان التوصيل' : '2️⃣ Select Delivery Address';
      const body   = lang === 'ar'
        ? `✅ *${zoneName}* — توصيل: ${fmt(fee)} ر.س\n\nاختر عنواناً محفوظاً أو أدخل جديداً:`
        : `✅ *${zoneName}* — Delivery: SAR ${fmt(fee)}\n\nPick a saved address or enter a new one:`;

      return {
        response: {
          text: body, language: lang, suggestedUI: 'list',
          listData: {
            header, body,
            buttonText: cap(lang === 'ar' ? 'اختر العنوان' : 'Select Address', 20),
            sections: [{ title: lang === 'ar' ? 'عناوينك المحفوظة' : 'Your Saved Addresses', rows }],
          },
        },
        newState: {
          state:                  'checkout_address',
          checkoutZoneIndex:      zoneIndex,
          checkoutZoneName:       zoneName,
          checkoutDeliveryFee:    fee,
          checkoutSavedAddresses: savedAddresses.map((a) => a.address),
        },
      };
    }

    const zoneConfirm = lang === 'ar'
      ? `✅ *${zoneName}* — توصيل: ${fmt(fee)} ر.س\n\n2️⃣ `
      : `✅ *${zoneName}* — Delivery: SAR ${fmt(fee)}\n\n2️⃣ `;

    const body = zoneConfirm + addressPrompt(lang);

    return {
      response: { text: body, language: lang, suggestedUI: 'text' },
      newState: {
        state:               'checkout_address',
        checkoutZoneIndex:   zoneIndex,
        checkoutZoneName:    zoneName,
        checkoutDeliveryFee: fee,
      },
    };
  }

  // ══════════════════════════════════════════
  // STEP 3a — User typed address text
  // ══════════════════════════════════════════

  async receiveAddress(
    address: string,
    customer: Customer,
    store: Store,
    _session: SessionData
  ): Promise<FlowResult> {
    const lang = this.lang;

    if (!address || address.trim().length < 5) {
      const body = lang === 'ar'
        ? '❌ العنوان قصير جداً.\nاكتب الحي، الشارع، وأقرب معلم:\n\n_أو اضغط 📎 → الموقع_'
        : '❌ Address too short.\nEnter neighborhood, street, and landmark:\n\n_Or tap 📎 → Location_';
      return {
        response: { text: body, language: lang, suggestedUI: 'text' },
        newState: { state: 'checkout_address' },
      };
    }

    return this.showPaymentList(address.trim(), lang, store);
  }

  // ══════════════════════════════════════════
  // STEP 3b — User sent WhatsApp location pin
  // ══════════════════════════════════════════

  /**
   * Called when messageType === 'location' and state is checkout_address.
   * Parses the [LOCATION: lat=X, lng=Y, name=N, address=A] string that the
   * webhook extracts from the WhatsApp location message.
   */
  async receiveLocation(
    locationContent: string,
    customer: Customer,
    store: Store,
    _session: SessionData
  ): Promise<FlowResult> {
    const lang = this.lang;

    // Parse the webhook-generated location string
    const latM = locationContent.match(/lat=([\d.-]+)/);
    const lngM = locationContent.match(/lng=([\d.-]+)/);
    const namM = locationContent.match(/name=([^,\]]+)/);
    const adrM = locationContent.match(/address=([^\]]+)/);

    const lat = latM ? parseFloat(latM[1]) : null;
    const lng = lngM ? parseFloat(lngM[1]) : null;

    if (!lat || !lng) {
      const body = lang === 'ar'
        ? '❌ لم أتمكن من قراءة الموقع. اكتب عنوانك بدلاً من ذلك:'
        : '❌ Could not read location. Please type your address instead:';
      return {
        response: { text: body, language: lang, suggestedUI: 'text' },
        newState: { state: 'checkout_address' },
      };
    }

    const locName = namM ? namM[1].trim() : null;
    const locAddr = adrM ? adrM[1].trim() : null;

    // Build a human-readable address combining all available data
    const parts: string[] = [];
    if (locName && locName !== locAddr) parts.push(locName);
    if (locAddr) parts.push(locAddr);
    // Always append coordinates for precision
    parts.push(`(${lat.toFixed(5)}, ${lng.toFixed(5)})`);
    const formattedAddress = parts.join(' — ');

    logger.info({ lat, lng, locName, locAddr }, 'Location pin received for checkout');

    // Show payment list with location confirmation in the header
    const payResult = await this.showPaymentList(formattedAddress, lang, store);

    // Prepend location confirmation to the list header
    if (payResult.response.suggestedUI === 'list' && payResult.response.listData) {
      const confirmed = lang === 'ar'
        ? `✅ تم استلام موقعك 📌\n📍 ${formattedAddress}`
        : `✅ Location received 📌\n📍 ${formattedAddress}`;
      payResult.response.listData.header = cap(
        lang === 'ar' ? '✅ موقعك محدد — اختر طريقة الدفع' : '✅ Location set — choose payment',
        60
      );
      payResult.response.listData.body = confirmed;
      payResult.response.text = confirmed;
    }

    return {
      ...payResult,
      newState: {
        ...payResult.newState,
        checkoutAddress: formattedAddress,
      },
    };
  }

  // ══════════════════════════════════════════
  // STEP 4 — Payment chosen → order summary + confirm btn
  // ══════════════════════════════════════════

  async selectPayment(
    method: string,
    customer: Customer,
    store: Store,
    session: SessionData
  ): Promise<FlowResult> {
    const lang        = this.lang;
    const address     = session.checkoutAddress  || '';
    const zoneName    = session.checkoutZoneName || (lang === 'ar' ? 'داخل المدينة' : 'City');
    const deliveryFee = session.checkoutDeliveryFee ?? parseFloat(String(store.delivery_fee)) ?? 10;

    if (!address) return this.startCheckout(customer, store, session);

    const cart = await CartService.getOrCreate(this.storeId, customer.id);
    if (cart.items.length === 0) return this.startCheckout(customer, store, session);

    const subtotal = cart.items.reduce((s, i) => s + parseFloat(String(i.subtotal)), 0);
    const discount = parseFloat(String(cart.discount)) || 0;
    const total    = subtotal - discount + deliveryFee;
    const isPayNow = PAY_NOW_METHODS.has(method);

    const c = cur(lang);
    const lines = cart.items.map((item, i) => {
      const name = this.lang === 'ar' ? item.name_ar : (item.name_en ?? item.name_ar);
      return `${i + 1}. ${name} × ${parseFloat(String(item.quantity))} — ${parseFloat(String(item.subtotal)).toFixed(2)} ${c}`;
    });

    const summary = [
      lang === 'ar' ? '📋 *ملخص طلبك:*' : '📋 *Order Summary:*',
      '',
      ...lines,
      '',
      `${lang === 'ar' ? 'المجموع الفرعي:' : 'Subtotal:'} ${fmt(subtotal)} ${c}`,
      lang === 'ar' ? 'شامل الضريبة (15%) ✅' : 'VAT (15%) Included ✅',
      discount > 0 ? `${lang === 'ar' ? 'خصم:' : 'Discount:'} -${fmt(discount)} ${c}` : null,
      `${lang === 'ar' ? `التوصيل (${zoneName}):` : `Delivery (${zoneName}):`} ${fmt(deliveryFee)} ${c}`,
      '─────────────',
      `*${lang === 'ar' ? 'الإجمالي:' : 'Total:'} ${fmt(total)} ${c}*`,
      '',
      `📍 ${lang === 'ar' ? 'العنوان:' : 'Address:'} ${address}`,
      `💳 ${lang === 'ar' ? 'الدفع:' : 'Payment:'} ${payLabel(method, lang)}`,
      isPayNow
        ? (lang === 'ar' ? '⚡ *دفع مسبق — سيتم تأكيد الطلب بعد استلام الدفع*' : '⚡ *Pre-paid — order confirmed after payment*')
        : (lang === 'ar' ? '🚗 *الدفع عند التوصيل*'                             : '🚗 *Pay on delivery*'),
    ].filter(Boolean).join('\n');

    const body = smartTruncate(summary);

    return {
      response: {
        text: body, language: lang, suggestedUI: 'buttons',
        buttons: {
          body,
          buttons: [
            { id: B.CHECKOUT_CONFIRM, title: cap(lang === 'ar' ? '✅ تأكيد الطلب' : '✅ Place Order', 20) },
            { id: B.CART,             title: cap(lang === 'ar' ? '🔙 تعديل السلة' : '🔙 Edit Cart',   20) },
          ],
        },
      },
      newState: {
        state:                'checkout_confirm',
        checkoutPaymentMethod: method,
      },
    };
  }

  // ══════════════════════════════════════════
  // STEP 5 — Confirm tapped → create order
  // ══════════════════════════════════════════

  async confirmOrder(customer: Customer, store: Store, session: SessionData): Promise<FlowResult> {
    const lang        = this.lang;
    const address     = session.checkoutAddress     || '';
    const zoneName    = session.checkoutZoneName    || (lang === 'ar' ? 'داخل المدينة' : 'City');
    const deliveryFee = Math.max(0, session.checkoutDeliveryFee ?? (parseFloat(String(store.delivery_fee)) || 10));

    // paymentMethod is required — if missing (session expired), re-show payment step
    const paymentMethod = session.checkoutPaymentMethod;
    if (!paymentMethod) {
      if (address) {
        // Address was collected; only payment step is missing — re-show payment list
        return this.showPaymentList(address, lang, store);
      }
      return this.startCheckout(customer, store, session);
    }

    if (!address) return this.startCheckout(customer, store, session);

    const order = await OrderService.createFromCart({
      storeId:         this.storeId,
      customerId:      customer.id,
      deliveryAddress: { address, zone: zoneName, label: 'Home', is_default: false },
      paymentMethod,
      deliveryFee,
    }, store);

    if (!order) {
      const body = lang === 'ar'
        ? '❌ عذراً، حصل خطأ أثناء إنشاء الطلب.\nحاول مرة ثانية أو تواصل معنا.'
        : '❌ Sorry, an error occurred creating your order.\nPlease try again or contact us.';
      return this.btnResponse(body, lang, [
        { id: B.CART,      title: lang === 'ar' ? '🔙 رجوع للطلب' : '🔙 Back to Order' },
        { id: B.MAIN_MENU, title: lang === 'ar' ? 'القائمة 🏠'    : 'Main Menu 🏠'    },
      ], 'cart_view');
    }

    const orderNum  = order.order_number;
    const total     = parseFloat(String(order.total));
    const isPayNow  = PAY_NOW_METHODS.has(paymentMethod);
    const c         = cur(lang);

    // ── Payment link for pay-now methods ──────────────────────────────────
    // Generate a Moyasar payment link and attach it as a follow-up message.
    let paymentFollowUp: import('../types').AIResponse | undefined;
    if (isPayNow) {
      try {
        const baseUrl   = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const paymentUrl = await OrderService.generatePaymentLink(order, customer.phone, baseUrl);

        if (paymentUrl) {
          const linkText = lang === 'ar'
            ? `💳 *رابط الدفع لطلبك #${orderNum}:*\n\n${paymentUrl}\n\n⏰ الرابط صالح لمدة 30 دقيقة.\nبعد الدفع سيتم تأكيد طلبك تلقائياً ✅`
            : `💳 *Payment link for order #${orderNum}:*\n\n${paymentUrl}\n\n⏰ Link valid for 30 minutes.\nYour order will be confirmed automatically after payment ✅`;
          paymentFollowUp = { text: linkText, language: lang, suggestedUI: 'text' };
          logger.info({ orderId: order.id, orderNum }, 'Payment link attached to confirmation');
        } else {
          logger.warn({ orderId: order.id }, 'Payment link generation returned null — customer will be contacted manually');
        }
      } catch (payErr) {
        logger.error({ payErr, orderId: order.id }, 'Failed to generate payment link — order still created');
      }
    }

    const paymentNote = isPayNow
      ? (paymentFollowUp
          ? (lang === 'ar' ? '⚡ *رابط الدفع مرفق أدناه*' : '⚡ *Payment link attached below*')
          : (lang === 'ar' ? '⚡ سيتم التواصل معك لإتمام الدفع' : '⚡ We will contact you to complete payment'))
      : (lang === 'ar' ? '💵 الدفع عند الاستلام' : '💵 Pay on delivery');

    const eta = this.deliveryEta(lang);
    const body = lang === 'ar'
      ? `✅ *تم تأكيد طلبك!*\n\n🔢 رقم الطلب: *#${orderNum}*\n💰 الإجمالي: *${fmt(total)} ${c}*\n📍 العنوان: ${address}\n💳 الدفع: ${payLabel(paymentMethod, lang)}\n${paymentNote}\n\n🚗 الوقت المتوقع: ${eta}\n\nاكتب "وين طلبي" لمتابعة الطلب 📦`
      : `✅ *Order Confirmed!*\n\n🔢 Order #: *#${orderNum}*\n💰 Total: *${c} ${fmt(total)}*\n📍 Address: ${address}\n💳 Payment: ${payLabel(paymentMethod, lang)}\n${paymentNote}\n\n🚗 Estimated: ${eta}\n\nType "track my order" to follow up 📦`;

    logger.info({ orderId: order.id, orderNum, customerId: customer.id, isPayNow }, 'Checkout completed');

    return {
      response: {
        text: body, language: lang, suggestedUI: 'buttons',
        buttons: { body, buttons: [
          { id: B.TRACK_ORDER, title: cap(lang === 'ar' ? '📦 تتبع الطلب'    : '📦 Track Order', 20) },
          { id: B.BROWSE,      title: cap(lang === 'ar' ? '🛍️ متابعة التسوق' : '🛍️ Shop More',  20) },
        ]},
        ...(paymentFollowUp && { followUp: paymentFollowUp }),
      },
      newState: {
        state:                 'main_menu',
        lastOrderId:           order.id,
        lastOrderNumber:       orderNum,
        checkoutZoneIndex:     undefined,
        checkoutZoneName:      undefined,
        checkoutDeliveryFee:   undefined,
        checkoutAddress:       undefined,
        checkoutPaymentMethod: undefined,
      },
    };
  }

  // ══════════════════════════════════════════
  // ORDER TRACKING
  // ══════════════════════════════════════════

  async trackOrder(customer: Customer, store: Store, session: SessionData): Promise<FlowResult> {
    const lang = this.lang;

    let order = session.lastOrderId
      ? await OrderService.getById(this.storeId, session.lastOrderId)
      : null;
    if (!order) {
      order = await OrderService.getLastOrder(this.storeId, customer.id);
    }

    if (!order) {
      const body = lang === 'ar'
        ? '📦 لم أجد أي طلبات سابقة.\n\nابدأ تسوقك الآن!'
        : '📦 No previous orders found.\n\nStart shopping now!';
      return this.btnResponse(body, lang, [
        { id: B.BROWSE,    title: lang === 'ar' ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️' },
        { id: B.MAIN_MENU, title: lang === 'ar' ? 'القائمة 🏠'        : 'Main Menu 🏠'        },
      ], 'main_menu');
    }

    const orderNum  = order.order_number;
    const statusStr = OrderService.formatStatus(order.status, lang);
    const total     = parseFloat(String(order.total));
    const c         = cur(lang);
    const date      = new Date(order.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB');

    // delivery_address can be a JSON object, a plain string, or null — handle all cases
    let addr = '';
    const da = order.delivery_address;
    if (da) {
      if (typeof da === 'string') addr = da;
      else if (typeof da === 'object' && 'address' in da) addr = (da as { address?: string }).address ?? '';
    }

    const pay = order.payment_method ? payLabel(order.payment_method, lang) : '';
    const canCancel = order.status === 'pending' || order.status === 'confirmed';

    const body = lang === 'ar'
      ? `📦 *طلبك #${orderNum}*\n\n📊 الحالة: ${statusStr}\n💰 الإجمالي: ${fmt(total)} ${c}\n📅 التاريخ: ${date}${addr ? `\n📍 العنوان: ${addr}` : ''}${pay ? `\n💳 الدفع: ${pay}` : ''}`
      : `📦 *Order #${orderNum}*\n\nStatus: ${statusStr}\n💰 Total: ${c} ${fmt(total)}\n📅 Date: ${date}${addr ? `\n📍 Address: ${addr}` : ''}${pay ? `\n💳 Payment: ${pay}` : ''}`;

    const buttons: { id: string; title: string }[] = [];
    if (canCancel) {
      buttons.push({ id: `cancel_order_${order.id}`, title: cap(lang === 'ar' ? '❌ إلغاء الطلب' : '❌ Cancel Order', 20) });
    }
    buttons.push({ id: B.BROWSE,    title: cap(lang === 'ar' ? '🛍️ متابعة التسوق' : '🛍️ Shop More', 20) });
    buttons.push({ id: B.MAIN_MENU, title: cap(lang === 'ar' ? 'القائمة 🏠'        : 'Main Menu 🏠', 20) });

    return {
      response: {
        text: body, language: lang, suggestedUI: 'buttons',
        buttons: { body, buttons: buttons.slice(0, 3) },
      },
      newState: {
        lastOrderId:     order.id,
        lastOrderNumber: order.order_number,
      },
    };
  }

  // ══════════════════════════════════════════
  // ORDER CANCELLATION
  // ══════════════════════════════════════════

  async cancelOrder(orderId: string, customer: Customer, store: Store): Promise<FlowResult> {
    const lang   = this.lang;
    const result = await OrderService.cancelOrder(this.storeId, orderId, customer.id);

    let body: string;
    if (result.success) {
      body = lang === 'ar'
        ? '✅ *تم إلغاء طلبك بنجاح.*\n\nنأسف لعدم ملاءمة الطلب. يمكنك إجراء طلب جديد في أي وقت.'
        : '✅ *Your order has been cancelled.*\n\nSorry for any inconvenience. You can place a new order anytime.';
    } else if (result.reason === 'not_found') {
      body = lang === 'ar' ? '❌ لم أجد هذا الطلب.' : '❌ Order not found.';
    } else {
      body = lang === 'ar'
        ? `❌ عذراً، لا يمكن إلغاء الطلب لأنه قيد التجهيز.\nتواصل مع المتجر مباشرة: ${store.phone}`
        : `❌ Sorry, cannot cancel — order is already being prepared.\nContact the store: ${store.phone}`;
    }

    return this.btnResponse(body, lang, [
      { id: B.BROWSE,    title: lang === 'ar' ? '🛍️ متابعة التسوق' : '🛍️ Shop More' },
      { id: B.MAIN_MENU, title: lang === 'ar' ? 'القائمة 🏠'        : 'Main Menu 🏠' },
    ], 'main_menu');
  }

  // ══════════════════════════════════════════
  // REORDER — re-populate cart from last order
  // ══════════════════════════════════════════

  async reorderLastOrder(customer: Customer, store: Store, _session: SessionData): Promise<FlowResult> {
    const lang = this.lang;

    const lastOrder = await OrderService.getLastOrder(this.storeId, customer.id);

    if (!lastOrder || !Array.isArray(lastOrder.items) || lastOrder.items.length === 0) {
      const body = lang === 'ar'
        ? '📦 لا توجد طلبات سابقة.\n\nابدأ تسوقك الآن!'
        : '📦 No previous orders found.\n\nStart shopping now!';
      return this.btnResponse(body, lang, [
        { id: B.BROWSE,    title: lang === 'ar' ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️' },
        { id: B.MAIN_MENU, title: lang === 'ar' ? 'القائمة 🏠'        : 'Main Menu 🏠'   },
      ], 'main_menu');
    }

    // Clear current cart then re-add last order items
    await CartService.clear(this.storeId, customer.id);

    const unavailable: string[] = [];
    const { ProductService } = await import('../services/product');

    for (const rawItem of lastOrder.items as Array<{ product_id: string; quantity: number; name_ar?: string; name_en?: string }>) {
      try {
        const product = await ProductService.getById(this.storeId, rawItem.product_id);
        if (product && product.in_stock && product.is_active) {
          await CartService.addItem(this.storeId, customer.id, product, rawItem.quantity);
        } else {
          const n = (lang === 'ar' ? rawItem.name_ar : rawItem.name_en) || rawItem.name_ar || rawItem.product_id;
          unavailable.push(n);
        }
      } catch { /* skip items that fail */ }
    }

    const cart = await CartService.getOrCreate(this.storeId, customer.id);

    if (cart.items.length === 0) {
      const body = lang === 'ar'
        ? '😔 جميع منتجات طلبك الأخير غير متوفرة حالياً.\n\nتصفح القائمة لطلب جديد!'
        : '😔 All items from your last order are currently unavailable.\n\nBrowse the menu to place a new order!';
      return this.btnResponse(body, lang, [
        { id: B.BROWSE,    title: lang === 'ar' ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️' },
        { id: B.MAIN_MENU, title: lang === 'ar' ? 'القائمة 🏠'        : 'Main Menu 🏠'   },
      ], 'main_menu');
    }

    const orderNum = lastOrder.order_number;
    const c        = cur(lang);
    const subtotal = cart.items.reduce((s, i) => s + parseFloat(String(i.subtotal)), 0);
    const lines    = cart.items.map((item, i) => {
      const name = lang === 'ar' ? item.name_ar : (item.name_en ?? item.name_ar);
      return `${i + 1}. ${name} × ${parseFloat(String(item.quantity))} — ${parseFloat(String(item.subtotal)).toFixed(2)} ${c}`;
    });

    let prefix = lang === 'ar'
      ? `⚡ *تم إعادة طلبك #${orderNum}!*\n`
      : `⚡ *Order #${orderNum} restored!*\n`;
    if (unavailable.length > 0) {
      prefix += lang === 'ar'
        ? `⚠️ غير متوفر: ${unavailable.slice(0, 3).join('، ')}${unavailable.length > 3 ? '...' : ''}\n`
        : `⚠️ Unavailable: ${unavailable.slice(0, 3).join(', ')}${unavailable.length > 3 ? '...' : ''}\n`;
    }

    const cartLines = [
      lang === 'ar' ? '🍽️ *طلبك:*' : '🍽️ *Your Order:*', '',
      ...lines, '',
      `*${lang === 'ar' ? 'الإجمالي:' : 'Subtotal:'} ${subtotal.toFixed(2)} ${c}*`,
      lang === 'ar' ? 'شامل الضريبة (15%) ✅' : 'VAT (15%) Included ✅',
    ].join('\n');

    const fullBody = (prefix + '\n' + cartLines).substring(0, 1020);

    return {
      response: {
        text: fullBody, language: lang, suggestedUI: 'buttons',
        buttons: { body: fullBody, buttons: [
          { id: 'cart_modify_menu',   title: cap(lang === 'ar' ? 'تعديل الطلب 🔧'  : 'Edit Order 🔧',   20) },
          { id: 'menu_browse',        title: cap(lang === 'ar' ? 'إضافة أصناف 🍽️'  : 'Add Items 🍽️',   20) },
          { id: 'cart_checkout',      title: cap(lang === 'ar' ? 'إتمام الطلب ✅'   : 'Place Order ✅',  20) },
        ]},
      },
      newState: { state: 'cart_view' },
    };
  }

  // ══════════════════════════════════════════
  // USE SAVED ADDRESS (skips typing step)
  // ══════════════════════════════════════════

  async useSavedAddress(address: string, store: Store, session: SessionData): Promise<FlowResult> {
    return this.showPaymentList(address, this.lang, store);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Build the payment selection list message (shared by receiveAddress + receiveLocation).
   */
  private async showPaymentList(address: string, lang: string, store: Store): Promise<FlowResult> {
    const methods = Array.isArray(store.payment_methods) && store.payment_methods.length > 0
      ? store.payment_methods
      : ['cash'];

    const sections = buildPaymentSections(methods, lang);

    const header = lang === 'ar' ? '3️⃣ اختر طريقة الدفع' : '3️⃣ Choose Payment Method';
    const body   = lang === 'ar' ? 'الخطوة الأخيرة — كيف تريد الدفع؟' : 'Last step — how would you like to pay?';

    return {
      response: {
        text: header, language: lang, suggestedUI: 'list',
        listData: {
          header, body,
          buttonText: cap(lang === 'ar' ? 'اختر طريقة الدفع' : 'Select Payment', 20),
          sections,
        },
      },
      newState: {
        state:           'checkout_payment',
        checkoutAddress: address,
      },
    };
  }

  private btnResponse(
    body: string,
    lang: string,
    buttons: { id: string; title: string }[],
    state: FlowResult['newState']['state']
  ): FlowResult {
    const cappedBtns = buttons.slice(0, 3).map((b) => ({ ...b, title: cap(b.title, 20) }));
    return {
      response: {
        text: body, language: lang, suggestedUI: 'buttons',
        buttons: { body, buttons: cappedBtns },
      },
      newState: { state },
    };
  }

  // ─── Working hours helper ───────────────────────────────────────────────────

  /**
   * Check if the store is currently open based on working_hours config.
   * working_hours format: { "sat-thu": "8:00-23:00", "fri": "14:00-23:00" }
   * OR any of the common Saudi formats.
   * Returns { isOpen, hoursDisplay }.
   */
  private checkWorkingHours(store: Store): { isOpen: boolean; hoursDisplay: string } {
    const hours = store.working_hours;

    // No working hours configured → always open
    if (!hours || Object.keys(hours).length === 0) {
      return { isOpen: true, hoursDisplay: '' };
    }

    // Build human-readable display
    const lines = Object.entries(hours).map(([day, time]) => `  ${day}: ${time}`);
    const hoursDisplay = lines.join('\n');

    const now = new Date();
    // Riyadh is UTC+3
    const riyadhOffset = 3 * 60;
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const localMin = (utcMin + riyadhOffset) % (24 * 60);
    const localHour = Math.floor(localMin / 60);
    const localMinute = localMin % 60;
    // 0=Sun,1=Mon,...,5=Fri,6=Sat
    const dayOfWeek = new Date(now.getTime() + riyadhOffset * 60000).getUTCDay();

    // Determine which schedule applies today
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayOfWeek];

    let todaySchedule: string | null = null;
    for (const [key, timeRange] of Object.entries(hours)) {
      const k = key.toLowerCase().replace(/\s/g, '');
      // Match common patterns: "fri", "ج", "sat-thu", "sat-fri", "all", "daily"
      if (
        k === dayKey ||
        k === 'all' || k === 'daily' || k === 'everyday' ||
        k === 'ج' && dayKey === 'fri' ||
        k === 'ح-خ' && dayKey !== 'fri' ||   // sat-thu in Arabic (ح=sat, خ=thu)
        k === 'sat-thu' && (dayOfWeek >= 0 && dayOfWeek <= 4 || dayOfWeek === 6) ||
        k === 'sat-fri' && true ||
        k.includes(dayKey)
      ) {
        todaySchedule = String(timeRange);
        break;
      }
    }

    // If no schedule found for today, use first entry as fallback
    if (!todaySchedule) {
      const firstEntry = Object.values(hours)[0];
      todaySchedule = firstEntry ? String(firstEntry) : null;
    }

    if (!todaySchedule) return { isOpen: true, hoursDisplay };

    // Parse time range: "8:00-23:00" or "14:00-01:00" (crosses midnight)
    const match = todaySchedule.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!match) return { isOpen: true, hoursDisplay };

    const openH = parseInt(match[1], 10);
    const openM = parseInt(match[2], 10);
    const closeH = parseInt(match[3], 10);
    const closeM = parseInt(match[4], 10);

    const openMin  = openH  * 60 + openM;
    const closeMin = closeH * 60 + closeM;
    const nowMin   = localHour * 60 + localMinute;

    let isOpen: boolean;
    if (closeMin > openMin) {
      // Same day: e.g. 08:00–22:00
      isOpen = nowMin >= openMin && nowMin < closeMin;
    } else {
      // Crosses midnight: e.g. 12:00–01:00
      isOpen = nowMin >= openMin || nowMin < closeMin;
    }

    return { isOpen, hoursDisplay };
  }

  // ─── Smart ETA helper ───────────────────────────────────────────────────────

  /**
   * Return a realistic delivery ETA string based on time of day.
   * Peak hours (12:00–14:00 and 19:00–22:00) get a longer range.
   */
  private deliveryEta(lang: string): string {
    const now = new Date();
    const riyadhHour = (now.getUTCHours() + 3) % 24; // UTC+3
    const isPeak = (riyadhHour >= 12 && riyadhHour < 14) || (riyadhHour >= 19 && riyadhHour < 22);
    const range = isPeak
      ? (lang === 'ar' ? '45–75 دقيقة' : '45–75 minutes')
      : (lang === 'ar' ? '25–45 دقيقة' : '25–45 minutes');
    const note = isPeak
      ? (lang === 'ar' ? ' (وقت الذروة)' : ' (peak hours)')
      : '';
    return range + note;
  }
}
