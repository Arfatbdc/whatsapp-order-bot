import { Product, CartItem, Category } from '../types';

const WHATSAPP_MAX_BODY = 4096;
const WHATSAPP_MAX_BUTTON_TITLE = 20;
const WHATSAPP_MAX_LIST_ROW_TITLE = 24;

// ═══════════════════════════════════════════
// PRICE FORMATTING
// ═══════════════════════════════════════════

export function formatPrice(amount: number | string, language: string): string {
  const fixed = parseFloat(String(amount)).toFixed(2);
  return language === 'ar' ? `${fixed} ر.س` : `SAR ${fixed}`;
}

// ═══════════════════════════════════════════
// PRODUCT FORMATTING
// ═══════════════════════════════════════════

export function formatProductName(product: Product, language: string): string {
  return language === 'ar'
    ? product.name_ar
    : (product.name_en || product.name_ar);
}

export function formatUnit(unit: string, language: string): string {
  if (language !== 'ar') return unit;
  const map: Record<string, string> = {
    kg: 'كيلو',
    piece: 'حبة',
    pack: 'علبة',
    box: 'علبة',
    liter: 'لتر',
    g: 'جرام',
    ml: 'مل',
  };
  return map[unit.toLowerCase()] || unit;
}

/**
 * Format a single product for a WhatsApp text message.
 * Example: "1. حليب المراعي 2 لتر — 14.00 ر.س ✅"
 */
export function formatProductLine(
  product: Product,
  index: number,
  language: string
): string {
  const name = formatProductName(product, language);
  const price = formatPrice(product.price, language);
  const unit = formatUnit(product.unit, language);
  const stock = product.in_stock ? '✅' : '❌';
  return `${index}. ${name} (${unit}) — ${price} ${stock}`;
}

/**
 * Format a numbered product list for WhatsApp text.
 * Truncates to fit within WhatsApp body limit.
 */
export function formatProductList(products: Product[], language: string): string {
  if (products.length === 0) {
    return language === 'ar'
      ? 'لم أجد أي منتجات.'
      : 'No products found.';
  }

  const lines = products.map((p, i) => formatProductLine(p, i + 1, language));

  const footer = language === 'ar'
    ? '\n\nاكتب رقم المنتج لإضافته للسلة، مثال: "1 × 2" (المنتج رقم 1 بكمية 2)'
    : '\n\nType the product number to add it, e.g. "1 × 2" (product #1, qty 2)';

  return truncateForWhatsApp(lines.join('\n') + footer);
}

/**
 * Format product details (for get_product_details tool result display).
 */
export function formatProductDetails(product: Product, language: string): string {
  const name = formatProductName(product, language);
  const price = formatPrice(product.price, language);
  const unit = formatUnit(product.unit, language);

  if (language === 'ar') {
    const desc = product.description_ar || '';
    const stockLine = product.in_stock
      ? `✅ متوفر${product.stock_qty ? ` (${product.stock_qty} ${unit})` : ''}`
      : '❌ غير متوفر حالياً';
    return [
      `📦 *${name}*`,
      desc ? desc : null,
      `السعر: ${price} (شامل الضريبة)`,
      `الوحدة: ${unit}`,
      stockLine,
    ].filter(Boolean).join('\n');
  }

  const desc = product.description_en || product.description_ar || '';
  const stockLine = product.in_stock
    ? `✅ In stock${product.stock_qty ? ` (${product.stock_qty} ${unit})` : ''}`
    : '❌ Out of stock';
  return [
    `📦 *${name}*`,
    desc ? desc : null,
    `Price: ${price} (VAT included)`,
    `Unit: ${unit}`,
    stockLine,
  ].filter(Boolean).join('\n');
}

// ═══════════════════════════════════════════
// CATEGORY FORMATTING
// ═══════════════════════════════════════════

export function formatCategoryList(categories: Category[], language: string): string {
  if (categories.length === 0) {
    return language === 'ar' ? 'لا توجد أقسام.' : 'No categories available.';
  }

  const isArabic = language === 'ar';
  const lines = categories.map((c, i) => {
    const name = isArabic ? c.name_ar : (c.name_en || c.name_ar);
    const count = c.product_count ? ` (${c.product_count})` : '';
    return `${i + 1}. ${name}${count}`;
  });

  const header = isArabic ? '📋 *أقسامنا:*\n' : '📋 *Our Categories:*\n';
  const footer = isArabic
    ? '\n\nاكتب رقم القسم أو اسم المنتج مباشرة'
    : '\n\nType a category number or search by product name';

  return truncateForWhatsApp(header + lines.join('\n') + footer);
}

// ═══════════════════════════════════════════
// CART FORMATTING
// ═══════════════════════════════════════════

export function formatCartSummary(
  items: CartItem[],
  subtotal: number | string,
  deliveryFee: number | string,
  discount: number | string,
  language: string
): string {
  if (items.length === 0) {
    return language === 'ar'
      ? '🛒 سلتك فارغة'
      : '🛒 Your cart is empty';
  }

  const isArabic = language === 'ar';
  const subtotalNum = parseFloat(String(subtotal));
  const deliveryFeeNum = parseFloat(String(deliveryFee));
  const discountNum = parseFloat(String(discount));
  const total = subtotalNum - discountNum + deliveryFeeNum;

  const lines = items.map((item, i) => {
    const name = isArabic ? item.name_ar : (item.name_en || item.name_ar);
    const price = formatPrice(item.subtotal, language);
    return `${i + 1}. ${name} × ${item.quantity} — ${price}`;
  });

  if (isArabic) {
    return [
      '🛒 *سلة مشترياتك:*',
      '',
      ...lines,
      '',
      `المجموع الفرعي: ${formatPrice(subtotalNum, language)}`,
      `شامل الضريبة (15%): ✅`,
      discountNum > 0 ? `الخصم: -${formatPrice(discountNum, language)}` : null,
      `التوصيل: ${deliveryFeeNum > 0 ? formatPrice(deliveryFeeNum, language) : 'مجاني 🎉'}`,
      '─────────────',
      `*الإجمالي: ${formatPrice(total, language)}*`,
      '',
      'اكتب "تأكيد" للطلب أو "تعديل" للتغيير',
    ].filter((l) => l !== null).join('\n');
  }

  return [
    '🛒 *Your Cart:*',
    '',
    ...lines,
    '',
    `Subtotal: ${formatPrice(subtotalNum, language)}`,
    `VAT (15%) Included: ✅`,
    discountNum > 0 ? `Discount: -${formatPrice(discountNum, language)}` : null,
    `Delivery: ${deliveryFeeNum > 0 ? formatPrice(deliveryFeeNum, language) : 'Free 🎉'}`,
    '─────────────',
    `*Total: ${formatPrice(total, language)}*`,
    '',
    'Type "confirm" to order or "edit" to modify',
  ].filter((l) => l !== null).join('\n');
}

// ═══════════════════════════════════════════
// WHATSAPP TRUNCATION HELPERS
// ═══════════════════════════════════════════

export function truncateForWhatsApp(text: string, maxLength = WHATSAPP_MAX_BODY): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function truncateButtonTitle(title: string): string {
  if (title.length <= WHATSAPP_MAX_BUTTON_TITLE) return title;
  return title.substring(0, WHATSAPP_MAX_BUTTON_TITLE - 1) + '…';
}

export function truncateListRowTitle(title: string): string {
  if (title.length <= WHATSAPP_MAX_LIST_ROW_TITLE) return title;
  return title.substring(0, WHATSAPP_MAX_LIST_ROW_TITLE - 1) + '…';
}
