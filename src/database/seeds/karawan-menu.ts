/**
 * Al-Karawan Restaurant — Full Menu Seed
 * مطعم الكروان 1 — بيانات القائمة الكاملة
 *
 * Extracted from menu images (all prices in SAR, VAT inclusive)
 *
 * Run: npx tsx src/database/seeds/karawan-menu.ts
 */

import { getPool } from '../connection';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ─── Image helpers ────────────────────────────────────────────────────────────
// Using stable Unsplash photo IDs for each food type
const IMG = {
  // Appetizers / Starters
  mezze:          'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80&auto=format&fit=crop',
  hummus:         'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&q=80&auto=format&fit=crop',
  tabbouleh:      'https://images.unsplash.com/photo-1593001874117-c99c800e3eb9?w=600&q=80&auto=format&fit=crop',
  salad:          'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80&auto=format&fit=crop',
  yogurt_salad:   'https://images.unsplash.com/photo-1551248429-40975aa4de74?w=600&q=80&auto=format&fit=crop',
  baba_ganoush:   'https://images.unsplash.com/photo-1625944525533-473f1a3d54e7?w=600&q=80&auto=format&fit=crop',
  grape_leaves:   'https://images.unsplash.com/photo-1574669235803-f0a2b8c7bdfa?w=600&q=80&auto=format&fit=crop',
  olive_salad:    'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=600&q=80&auto=format&fit=crop',

  // Chicken & Rice
  chicken_rice:   'https://images.unsplash.com/photo-1563379091339-03246963d651?w=600&q=80&auto=format&fit=crop',
  grilled_chick:  'https://images.unsplash.com/photo-1598103442097-8b74394b95c2?w=600&q=80&auto=format&fit=crop',
  half_chicken:   'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80&auto=format&fit=crop',
  rice_plain:     'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=600&q=80&auto=format&fit=crop',
  biryani:        'https://images.unsplash.com/photo-1563379091339-03246963d651?w=600&q=80&auto=format&fit=crop',

  // Side dishes / Idamaat
  stew_veg:       'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80&auto=format&fit=crop',
  okra:           'https://images.unsplash.com/photo-1606923829579-0cb981a83e2e?w=600&q=80&auto=format&fit=crop',
  molokhia:       'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80&auto=format&fit=crop',
  lentil_soup:    'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80&auto=format&fit=crop',
  beans:          'https://images.unsplash.com/photo-1551462108-f9a31b8e1d25?w=600&q=80&auto=format&fit=crop',
  spinach:        'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=600&q=80&auto=format&fit=crop',
  oat_soup:       'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80&auto=format&fit=crop',

  // Desserts
  kunafa:         'https://images.unsplash.com/photo-1574484284076-d9fbf9c89f86?w=600&q=80&auto=format&fit=crop',
  muhallabia:     'https://images.unsplash.com/photo-1567206563174-369fdc4fc313?w=600&q=80&auto=format&fit=crop',
  arabic_dessert: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=600&q=80&auto=format&fit=crop',

  // Drinks
  pepsi:          'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=600&q=80&auto=format&fit=crop',
  juice:          'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=600&q=80&auto=format&fit=crop',
  laban:          'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&q=80&auto=format&fit=crop',
  yogurt:         'https://images.unsplash.com/photo-1559598467-f8b76c8155d0?w=600&q=80&auto=format&fit=crop',
  tea:            'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&q=80&auto=format&fit=crop',
  water:          'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&q=80&auto=format&fit=crop',
};

async function seed() {
  const pool = getPool();
  console.log('🌱 Al-Karawan Restaurant Menu Seed\n');

  // ── 1. Update / create store ──────────────────────────────────────
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN!;

  const storeRes = await pool.query(`
    INSERT INTO stores (
      name, name_ar, phone,
      whatsapp_phone_id, whatsapp_token,
      city, working_hours, delivery_zones,
      delivery_fee, free_delivery_above, min_order,
      payment_methods, vat_rate, subscription_plan, is_active
    ) VALUES (
      'Al-Karawan Restaurant', 'مطعم الكروان 1', '+966500000000',
      $1, $2,
      'Riyadh',
      '{"sat-thu":"11:00-01:00","fri":"13:00-01:00"}'::jsonb,
      '[
        {"name":"North Riyadh","name_ar":"شمال الرياض","fee":10,"min_order":25},
        {"name":"Central Riyadh","name_ar":"وسط الرياض","fee":10,"min_order":25},
        {"name":"South Riyadh","name_ar":"جنوب الرياض","fee":15,"min_order":25},
        {"name":"East Riyadh","name_ar":"شرق الرياض","fee":15,"min_order":25},
        {"name":"West Riyadh","name_ar":"غرب الرياض","fee":15,"min_order":25}
      ]'::jsonb,
      10.00, 80.00, 25.00,
      ARRAY['cash','mada','stc_pay','apple_pay'],
      0.15, 'pro', true
    )
    ON CONFLICT (whatsapp_phone_id)
    DO UPDATE SET
      name            = EXCLUDED.name,
      name_ar         = EXCLUDED.name_ar,
      working_hours   = EXCLUDED.working_hours,
      delivery_zones  = EXCLUDED.delivery_zones,
      delivery_fee    = EXCLUDED.delivery_fee,
      free_delivery_above = EXCLUDED.free_delivery_above,
      min_order       = EXCLUDED.min_order,
      payment_methods = EXCLUDED.payment_methods,
      whatsapp_token  = EXCLUDED.whatsapp_token,
      updated_at      = NOW()
    RETURNING id
  `, [PHONE_ID, TOKEN]);

  const storeId: string = storeRes.rows[0].id;
  console.log('✅ Store:', storeId, '— مطعم الكروان 1\n');

  // ── 2. Wipe existing menu (clean slate) ──────────────────────────
  await pool.query('DELETE FROM products  WHERE store_id = $1', [storeId]);
  await pool.query('DELETE FROM categories WHERE store_id = $1', [storeId]);
  console.log('🗑️  Cleared old menu\n');

  // ── 3. Categories ─────────────────────────────────────────────────
  const CATS = [
    { name_ar: 'المقبلات',       name_en: 'Appetizers',        sort: 1 },
    { name_ar: 'الدجاج والأرز',  name_en: 'Chicken & Rice',    sort: 2 },
    { name_ar: 'الإدامات',       name_en: 'Side Dishes',       sort: 3 },
    { name_ar: 'حلى',            name_en: 'Desserts',          sort: 4 },
    { name_ar: 'المشروبات',      name_en: 'Beverages',         sort: 5 },
  ];

  const catIds: Record<string, string> = {};
  for (const c of CATS) {
    const r = await pool.query(
      `INSERT INTO categories (store_id, name_ar, name_en, sort_order, is_active)
       VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [storeId, c.name_ar, c.name_en, c.sort]
    );
    catIds[c.name_ar] = r.rows[0].id;
    console.log(`  📂 ${c.name_ar} → ${catIds[c.name_ar]}`);
  }
  console.log();

  // ── 4. Products ───────────────────────────────────────────────────

  interface ProductRow {
    cat:     string;
    name_ar: string;
    name_en: string;
    desc_ar: string;
    desc_en: string;
    price:   number;
    unit:    string;
    image:   string;
    cal?:    number;
    tags:    string[];
    in_stock?: boolean;
    stock_qty?: number | null;
  }

  const products: ProductRow[] = [

    // ════════════════════════════════════════
    // المقبلات  (Appetizers)
    // ════════════════════════════════════════
    {
      cat: 'المقبلات', name_ar: 'مقبلات مشكل', name_en: 'Mixed Appetizers Platter',
      desc_ar: 'تشكيلة من المقبلات المتنوعة — حمص، متبل، سلطات', desc_en: 'Assorted appetizers: hummus, mutabbal, salads',
      price: 8.00, unit: 'portion', image: IMG.mezze, cal: 80,
      tags: ['مقبلات', 'مشكل', 'mixed', 'appetizer', 'platter'],
    },
    {
      cat: 'المقبلات', name_ar: 'سلطة لبن خيار', name_en: 'Cucumber Yogurt Salad',
      desc_ar: 'سلطة لبن بالخيار والنعناع والثوم', desc_en: 'Yogurt with cucumber, mint, and garlic',
      price: 5.00, unit: 'portion', image: IMG.yogurt_salad, cal: 48,
      tags: ['سلطة', 'لبن', 'خيار', 'yogurt', 'cucumber', 'salad'],
    },
    {
      cat: 'المقبلات', name_ar: 'سلطة خضار', name_en: 'Fresh Vegetable Salad',
      desc_ar: 'سلطة خضار طازجة بالطماطم والخيار والخضراوات', desc_en: 'Fresh garden salad with tomatoes and cucumber',
      price: 5.00, unit: 'portion', image: IMG.salad, cal: 77,
      tags: ['سلطة', 'خضار', 'salad', 'vegetables', 'fresh'],
    },
    {
      cat: 'المقبلات', name_ar: 'متبل', name_en: 'Mutabbal',
      desc_ar: 'متبل باذنجان مشوي بالطحينة والليمون', desc_en: 'Roasted eggplant dip with tahini and lemon',
      price: 5.00, unit: 'portion', image: IMG.baba_ganoush, cal: 146,
      tags: ['متبل', 'بادنجان', 'باذنجان', 'mutabbal', 'eggplant'],
    },
    {
      cat: 'المقبلات', name_ar: 'حمص', name_en: 'Hummus',
      desc_ar: 'حمص بالطحينة وزيت الزيتون', desc_en: 'Hummus with tahini and olive oil',
      price: 5.00, unit: 'portion', image: IMG.hummus, cal: 95,
      tags: ['حمص', 'hummus', 'طحينة', 'chickpeas'],
    },
    {
      cat: 'المقبلات', name_ar: 'تبولة', name_en: 'Tabbouleh',
      desc_ar: 'تبولة طازجة بالبقدونس والبرغل والطماطم', desc_en: 'Fresh parsley tabbouleh with bulgur and tomatoes',
      price: 5.00, unit: 'portion', image: IMG.tabbouleh, cal: 90,
      tags: ['تبولة', 'tabbouleh', 'parsley', 'بقدونس'],
    },
    {
      cat: 'المقبلات', name_ar: 'ورق عنب', name_en: 'Stuffed Vine Leaves',
      desc_ar: 'ورق عنب محشي بالأرز والأعشاب', desc_en: 'Vine leaves stuffed with rice and herbs',
      price: 5.00, unit: 'portion', image: IMG.grape_leaves, cal: 100,
      tags: ['ورق عنب', 'grape leaves', 'stuffed', 'محشي'],
    },
    {
      cat: 'المقبلات', name_ar: 'بابا غنوج', name_en: 'Baba Ganoush',
      desc_ar: 'بابا غنوج من الباذنجان المشوي بالطحينة', desc_en: 'Smoky eggplant dip with tahini',
      price: 5.00, unit: 'portion', image: IMG.baba_ganoush, cal: 69,
      tags: ['بابا غنوج', 'baba ganoush', 'باذنجان', 'eggplant', 'smoked'],
    },
    {
      cat: 'المقبلات', name_ar: 'سلطة زيتون مايونيز', name_en: 'Olive Mayo Salad',
      desc_ar: 'سلطة زيتون بالمايونيز والخضروات', desc_en: 'Olive salad with mayo and vegetables',
      price: 5.00, unit: 'portion', image: IMG.olive_salad, cal: 170,
      tags: ['سلطة', 'زيتون', 'مايونيز', 'olive', 'mayo', 'salad'],
    },

    // ════════════════════════════════════════
    // الدجاج والأرز  (Chicken & Rice)
    // ════════════════════════════════════════
    {
      cat: 'الدجاج والأرز', name_ar: 'حبة فحم مع الأرز', name_en: 'Whole Charcoal Chicken + Rice',
      desc_ar: 'دجاج كامل مشوي على الفحم مع الأرز البخاري', desc_en: 'Whole charcoal-grilled chicken with basmati rice',
      price: 46.00, unit: 'portion', image: IMG.chicken_rice, cal: 2232,
      tags: ['دجاج', 'فحم', 'أرز', 'chicken', 'charcoal', 'rice', 'حبة'],
      stock_qty: 30,
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'حبة مضغوط دجاج', name_en: 'Whole Pressure-Cooked Chicken',
      desc_ar: 'دجاج كامل مطبوخ بالضغط مع المرق والبهارات', desc_en: 'Whole pressure-cooked chicken with rich broth',
      price: 44.00, unit: 'portion', image: IMG.half_chicken, cal: 2003,
      tags: ['دجاج', 'مضغوط', 'chicken', 'pressure', 'حبة'],
      stock_qty: 30,
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'حبة شواية مع الأرز', name_en: 'Whole Grilled Chicken + Rice',
      desc_ar: 'دجاج كامل مشوي مع الأرز والصوص', desc_en: 'Whole grilled chicken with rice and sauce',
      price: 44.00, unit: 'portion', image: IMG.grilled_chick, cal: 1116,
      tags: ['دجاج', 'شواية', 'مشوي', 'chicken', 'grilled', 'rice', 'حبة'],
      stock_qty: 30,
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'نصف فحم مع الأرز', name_en: 'Half Charcoal Chicken + Rice',
      desc_ar: 'نصف دجاج فحم مع الأرز البخاري', desc_en: 'Half charcoal chicken with basmati rice',
      price: 23.00, unit: 'portion', image: IMG.chicken_rice, cal: 1001,
      tags: ['دجاج', 'فحم', 'نصف', 'أرز', 'chicken', 'charcoal', 'half', 'rice'],
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'نصف مضغوط دجاج', name_en: 'Half Pressure-Cooked Chicken',
      desc_ar: 'نصف دجاج مضغوط بالمرق والبهارات', desc_en: 'Half pressure-cooked chicken with broth',
      price: 22.00, unit: 'portion', image: IMG.half_chicken, cal: 1435,
      tags: ['دجاج', 'مضغوط', 'نصف', 'chicken', 'pressure', 'half'],
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'نصف شواية مع الأرز', name_en: 'Half Grilled Chicken + Rice',
      desc_ar: 'نصف دجاج مشوي مع الأرز', desc_en: 'Half grilled chicken with rice',
      price: 22.00, unit: 'portion', image: IMG.grilled_chick, cal: 1232,
      tags: ['دجاج', 'شواية', 'نصف', 'أرز', 'chicken', 'grilled', 'half', 'rice'],
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'حبة فحم سادة', name_en: 'Whole Charcoal Chicken (Plain)',
      desc_ar: 'دجاج كامل مشوي على الفحم بدون أرز', desc_en: 'Whole charcoal-grilled chicken, no rice',
      price: 30.00, unit: 'portion', image: IMG.grilled_chick, cal: 1870,
      tags: ['دجاج', 'فحم', 'سادة', 'بدون أرز', 'chicken', 'charcoal', 'plain'],
      stock_qty: 30,
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'حبة شواية سادة', name_en: 'Whole Grilled Chicken (Plain)',
      desc_ar: 'دجاج كامل مشوي بدون أرز', desc_en: 'Whole grilled chicken, no rice',
      price: 28.00, unit: 'portion', image: IMG.grilled_chick, cal: 616,
      tags: ['دجاج', 'شواية', 'سادة', 'chicken', 'grilled', 'plain'],
      stock_qty: 30,
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'نصف فحم سادة', name_en: 'Half Charcoal Chicken (Plain)',
      desc_ar: 'نصف دجاج فحم بدون أرز', desc_en: 'Half charcoal chicken, no rice',
      price: 15.00, unit: 'portion', image: IMG.half_chicken, cal: 935,
      tags: ['دجاج', 'فحم', 'نصف', 'سادة', 'chicken', 'half', 'plain'],
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'نصف شواية سادة', name_en: 'Half Grilled Chicken (Plain)',
      desc_ar: 'نصف دجاج مشوي بدون أرز', desc_en: 'Half grilled chicken, no rice',
      price: 14.00, unit: 'portion', image: IMG.half_chicken, cal: 616,
      tags: ['دجاج', 'شواية', 'نصف', 'سادة', 'chicken', 'half', 'plain'],
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'نفر أرز بخاري', name_en: 'Bukhari Rice (1 person)',
      desc_ar: 'أرز بخاري بالبهارات لشخص واحد', desc_en: 'Spiced bukhari rice for one person',
      price: 8.00, unit: 'portion', image: IMG.rice_plain, cal: 500,
      tags: ['أرز', 'بخاري', 'rice', 'bukhari', 'نفر'],
    },
    {
      cat: 'الدجاج والأرز', name_ar: 'نفر أرز برياني', name_en: 'Biryani Rice (1 person)',
      desc_ar: 'أرز برياني بالتوابل والزعفران لشخص واحد', desc_en: 'Biryani rice with saffron spices for one person',
      price: 8.00, unit: 'portion', image: IMG.biryani, cal: 177,
      tags: ['أرز', 'برياني', 'rice', 'biryani', 'نفر'],
    },

    // ════════════════════════════════════════
    // الإدامات  (Side Dishes) — 2 sizes each
    // ════════════════════════════════════════
    {
      cat: 'الإدامات', name_ar: 'ايدام مصقعة — صغير', name_en: 'Musaqqa\'a Side — Small',
      desc_ar: 'مصقعة باذنجان بالطماطم والبهارات — حجم صغير', desc_en: 'Eggplant musaqqa\'a with tomatoes — small',
      price: 5.00, unit: 'portion', image: IMG.stew_veg, cal: 257,
      tags: ['مصقعة', 'باذنجان', 'ايدام', 'musaqqa', 'eggplant', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام مصقعة — كبير', name_en: 'Musaqqa\'a Side — Large',
      desc_ar: 'مصقعة باذنجان بالطماطم والبهارات — حجم كبير', desc_en: 'Eggplant musaqqa\'a with tomatoes — large',
      price: 8.00, unit: 'portion', image: IMG.stew_veg, cal: 257,
      tags: ['مصقعة', 'باذنجان', 'ايدام', 'musaqqa', 'eggplant', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام مشكل خضار — صغير', name_en: 'Mixed Vegetable Stew — Small',
      desc_ar: 'مرق خضار مشكل بالتوابل — حجم صغير', desc_en: 'Spiced mixed vegetable stew — small',
      price: 5.00, unit: 'portion', image: IMG.stew_veg, cal: 138,
      tags: ['خضار', 'مشكل', 'ايدام', 'vegetable', 'stew', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام مشكل خضار — كبير', name_en: 'Mixed Vegetable Stew — Large',
      desc_ar: 'مرق خضار مشكل بالتوابل — حجم كبير', desc_en: 'Spiced mixed vegetable stew — large',
      price: 8.00, unit: 'portion', image: IMG.stew_veg, cal: 138,
      tags: ['خضار', 'مشكل', 'ايدام', 'vegetable', 'stew', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام بامية — صغير', name_en: 'Okra Stew — Small',
      desc_ar: 'بامية مطبوخة بالطماطم والثوم — حجم صغير', desc_en: 'Okra stew with tomatoes and garlic — small',
      price: 5.00, unit: 'portion', image: IMG.okra, cal: 233,
      tags: ['بامية', 'ايدام', 'okra', 'stew', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام بامية — كبير', name_en: 'Okra Stew — Large',
      desc_ar: 'بامية مطبوخة بالطماطم والثوم — حجم كبير', desc_en: 'Okra stew with tomatoes and garlic — large',
      price: 8.00, unit: 'portion', image: IMG.okra, cal: 233,
      tags: ['بامية', 'ايدام', 'okra', 'stew', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام ملوخية — صغير', name_en: 'Molokhia Stew — Small',
      desc_ar: 'ملوخية خضراء بالثوم والكزبرة — حجم صغير', desc_en: 'Molokhia with garlic and coriander — small',
      price: 5.00, unit: 'portion', image: IMG.molokhia, cal: 101,
      tags: ['ملوخية', 'ايدام', 'molokhia', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام ملوخية — كبير', name_en: 'Molokhia Stew — Large',
      desc_ar: 'ملوخية خضراء بالثوم والكزبرة — حجم كبير', desc_en: 'Molokhia with garlic and coriander — large',
      price: 8.00, unit: 'portion', image: IMG.molokhia, cal: 101,
      tags: ['ملوخية', 'ايدام', 'molokhia', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام دجاج حار', name_en: 'Spicy Chicken Stew',
      desc_ar: 'قطع دجاج بمرق حار ومبهر', desc_en: 'Spicy chicken pieces in rich broth',
      price: 10.00, unit: 'portion', image: IMG.stew_veg, cal: 385,
      tags: ['دجاج', 'حار', 'ايدام', 'chicken', 'spicy', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام مشكل فرن — صغير', name_en: 'Mixed Oven Stew — Small',
      desc_ar: 'مرق مشكل محضر بالفرن — حجم صغير', desc_en: 'Assorted oven-baked stew — small',
      price: 5.00, unit: 'portion', image: IMG.stew_veg, cal: 211,
      tags: ['مشكل', 'فرن', 'ايدام', 'oven', 'baked', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام مشكل فرن — كبير', name_en: 'Mixed Oven Stew — Large',
      desc_ar: 'مرق مشكل محضر بالفرن — حجم كبير', desc_en: 'Assorted oven-baked stew — large',
      price: 8.00, unit: 'portion', image: IMG.stew_veg, cal: 211,
      tags: ['مشكل', 'فرن', 'ايدام', 'oven', 'baked', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام عدس — صغير', name_en: 'Lentil Stew — Small',
      desc_ar: 'عدس مطبوخ بالتوابل — حجم صغير', desc_en: 'Spiced lentil stew — small',
      price: 5.00, unit: 'portion', image: IMG.lentil_soup, cal: 228,
      tags: ['عدس', 'ايدام', 'lentil', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام عدس — كبير', name_en: 'Lentil Stew — Large',
      desc_ar: 'عدس مطبوخ بالتوابل — حجم كبير', desc_en: 'Spiced lentil stew — large',
      price: 8.00, unit: 'portion', image: IMG.lentil_soup, cal: 228,
      tags: ['عدس', 'ايدام', 'lentil', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام فاصوليا — صغير', name_en: 'Bean Stew — Small',
      desc_ar: 'فاصوليا بيضاء بالمرق والبهارات — حجم صغير', desc_en: 'White bean stew with spices — small',
      price: 5.00, unit: 'portion', image: IMG.beans, cal: 382,
      tags: ['فاصوليا', 'ايدام', 'beans', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام فاصوليا — كبير', name_en: 'Bean Stew — Large',
      desc_ar: 'فاصوليا بيضاء بالمرق والبهارات — حجم كبير', desc_en: 'White bean stew with spices — large',
      price: 8.00, unit: 'portion', image: IMG.beans, cal: 382,
      tags: ['فاصوليا', 'ايدام', 'beans', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'شوربة كويكر — صغير', name_en: 'Oat Soup — Small',
      desc_ar: 'شوربة شوفان كريمية دافئة — حجم صغير', desc_en: 'Creamy warm oat soup — small',
      price: 5.00, unit: 'portion', image: IMG.oat_soup, cal: 240,
      tags: ['شوربة', 'كويكر', 'شوفان', 'soup', 'oat', 'oatmeal'],
    },
    {
      cat: 'الإدامات', name_ar: 'شوربة كويكر — كبير', name_en: 'Oat Soup — Large',
      desc_ar: 'شوربة شوفان كريمية دافئة — حجم كبير', desc_en: 'Creamy warm oat soup — large',
      price: 8.00, unit: 'portion', image: IMG.oat_soup, cal: 240,
      tags: ['شوربة', 'كويكر', 'شوفان', 'soup', 'oat', 'oatmeal'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام سبانخ — صغير', name_en: 'Spinach Stew — Small',
      desc_ar: 'سبانخ بالثوم والزيت — حجم صغير', desc_en: 'Spinach with garlic and olive oil — small',
      price: 5.00, unit: 'portion', image: IMG.spinach, cal: 312,
      tags: ['سبانخ', 'ايدام', 'spinach', 'side'],
    },
    {
      cat: 'الإدامات', name_ar: 'ايدام سبانخ — كبير', name_en: 'Spinach Stew — Large',
      desc_ar: 'سبانخ بالثوم والزيت — حجم كبير', desc_en: 'Spinach with garlic and olive oil — large',
      price: 8.00, unit: 'portion', image: IMG.spinach, cal: 312,
      tags: ['سبانخ', 'ايدام', 'spinach', 'side'],
    },

    // ════════════════════════════════════════
    // حلى  (Desserts)
    // ════════════════════════════════════════
    {
      cat: 'حلى', name_ar: 'كنافة بالقشطة', name_en: 'Kunafa with Cream',
      desc_ar: 'كنافة مقرمشة محشوة بالقشطة الطازجة والقطر', desc_en: 'Crispy kunafa filled with fresh cream and syrup',
      price: 8.00, unit: 'portion', image: IMG.kunafa, cal: 1240,
      tags: ['كنافة', 'قشطة', 'حلى', 'kunafa', 'cream', 'dessert'],
      stock_qty: 50,
    },
    {
      cat: 'حلى', name_ar: 'حلا سندس', name_en: 'Sundus Dessert',
      desc_ar: 'حلا سندس بالقشطة والكراميل', desc_en: 'Sundus cream dessert with caramel',
      price: 6.00, unit: 'portion', image: IMG.arabic_dessert, cal: 450,
      tags: ['حلا', 'سندس', 'قشطة', 'dessert', 'cream'],
    },
    {
      cat: 'حلى', name_ar: 'مهلبية', name_en: 'Muhallabia',
      desc_ar: 'مهلبية بالحليب والزهرات والمكسرات', desc_en: 'Milk pudding with rosewater and nuts',
      price: 4.00, unit: 'portion', image: IMG.muhallabia, cal: 390,
      tags: ['مهلبية', 'حليب', 'muhallabia', 'milk pudding', 'dessert'],
    },
    {
      cat: 'حلى', name_ar: 'حلا شذى', name_en: 'Shatha Dessert',
      desc_ar: 'حلا شذى بالقشطة والبسكويت', desc_en: 'Shatha cream dessert with biscuit',
      price: 6.00, unit: 'portion', image: IMG.arabic_dessert, cal: 405,
      tags: ['حلا', 'شذى', 'قشطة', 'بسكويت', 'dessert', 'cream'],
    },
    {
      cat: 'حلى', name_ar: 'حلافرن', name_en: 'Hala Forn (Baked Dessert)',
      desc_ar: 'حلوى مخبوزة بالفرن بالقشطة والكراميل', desc_en: 'Oven-baked dessert with cream and caramel',
      price: 9.00, unit: 'portion', image: IMG.kunafa, cal: 510,
      tags: ['حلافرن', 'حلا', 'فرن', 'baked', 'dessert', 'oven'],
    },

    // ════════════════════════════════════════
    // المشروبات  (Beverages)
    // ════════════════════════════════════════

    // Pepsi — 4 sizes (2 / 3 / 5 / 9 SAR)
    {
      cat: 'المشروبات', name_ar: 'بيبسي — صغير', name_en: 'Pepsi — Small',
      desc_ar: 'بيبسي كولا — علبة صغيرة 250 مل', desc_en: 'Pepsi Cola — small can 250ml',
      price: 2.00, unit: 'can', image: IMG.pepsi, cal: 105,
      tags: ['بيبسي', 'pepsi', 'كولا', 'cola', 'مشروب', 'سودا'],
    },
    {
      cat: 'المشروبات', name_ar: 'بيبسي — وسط', name_en: 'Pepsi — Medium',
      desc_ar: 'بيبسي كولا — علبة وسط 350 مل', desc_en: 'Pepsi Cola — medium can 350ml',
      price: 3.00, unit: 'can', image: IMG.pepsi, cal: 150,
      tags: ['بيبسي', 'pepsi', 'كولا', 'cola', 'مشروب'],
    },
    {
      cat: 'المشروبات', name_ar: 'بيبسي — كبير', name_en: 'Pepsi — Large',
      desc_ar: 'بيبسي كولا — زجاجة 600 مل', desc_en: 'Pepsi Cola — large bottle 600ml',
      price: 5.00, unit: 'bottle', image: IMG.pepsi, cal: 252,
      tags: ['بيبسي', 'pepsi', 'كولا', 'cola', 'مشروب'],
    },
    {
      cat: 'المشروبات', name_ar: 'بيبسي — عائلي', name_en: 'Pepsi — Family',
      desc_ar: 'بيبسي كولا — زجاجة عائلية 2 لتر', desc_en: 'Pepsi Cola — family bottle 2L',
      price: 9.00, unit: 'bottle', image: IMG.pepsi, cal: 840,
      tags: ['بيبسي', 'pepsi', 'كولا', 'cola', 'عائلي', 'family'],
    },

    // عصير نادك
    {
      cat: 'المشروبات', name_ar: 'عصير نادك', name_en: 'Nadec Juice',
      desc_ar: 'عصير نادك بالنكهات المتنوعة', desc_en: 'Nadec fruit juice assorted flavors',
      price: 2.00, unit: 'pack', image: IMG.juice, cal: 120,
      tags: ['عصير', 'نادك', 'juice', 'nadec', 'فاكهة', 'fruit'],
      stock_qty: 100,
    },

    // لبن — 4 sizes (2 / 3 / 6 / 10 SAR)
    {
      cat: 'المشروبات', name_ar: 'لبن — صغير', name_en: 'Laban — Small',
      desc_ar: 'لبن مخفوق طازج — كوب صغير', desc_en: 'Fresh chilled laban — small cup',
      price: 2.00, unit: 'cup', image: IMG.laban, cal: 80,
      tags: ['لبن', 'laban', 'لبن مخفوق', 'مشروب', 'حليب'],
    },
    {
      cat: 'المشروبات', name_ar: 'لبن — وسط', name_en: 'Laban — Medium',
      desc_ar: 'لبن مخفوق طازج — كوب وسط', desc_en: 'Fresh chilled laban — medium cup',
      price: 3.00, unit: 'cup', image: IMG.laban, cal: 120,
      tags: ['لبن', 'laban', 'مشروب', 'حليب'],
    },
    {
      cat: 'المشروبات', name_ar: 'لبن — كبير', name_en: 'Laban — Large',
      desc_ar: 'لبن مخفوق طازج — زجاجة كبيرة', desc_en: 'Fresh chilled laban — large bottle',
      price: 6.00, unit: 'bottle', image: IMG.laban, cal: 240,
      tags: ['لبن', 'laban', 'مشروب', 'حليب'],
    },
    {
      cat: 'المشروبات', name_ar: 'لبن — عائلي', name_en: 'Laban — Family',
      desc_ar: 'لبن مخفوق طازج — زجاجة عائلية', desc_en: 'Fresh chilled laban — family bottle',
      price: 10.00, unit: 'bottle', image: IMG.laban, cal: 480,
      tags: ['لبن', 'laban', 'عائلي', 'family'],
    },

    // لبن القرية
    {
      cat: 'المشروبات', name_ar: 'لبن القرية', name_en: 'Village Laban',
      desc_ar: 'لبن القرية الطازج والكريمي', desc_en: 'Fresh creamy village-style laban',
      price: 3.00, unit: 'bottle', image: IMG.laban, cal: 130,
      tags: ['لبن', 'القرية', 'village', 'laban', 'حليب'],
    },

    // زبادي
    {
      cat: 'المشروبات', name_ar: 'زبادي', name_en: 'Yogurt',
      desc_ar: 'زبادي طبيعي كريمي', desc_en: 'Natural creamy yogurt',
      price: 1.50, unit: 'cup', image: IMG.yogurt, cal: 100,
      tags: ['زبادي', 'yogurt', 'لبن', 'dairy'],
    },

    // شاي
    {
      cat: 'المشروبات', name_ar: 'شاي', name_en: 'Tea',
      desc_ar: 'شاي أحمر دافئ', desc_en: 'Warm red tea',
      price: 1.00, unit: 'cup', image: IMG.tea, cal: 5,
      tags: ['شاي', 'tea', 'ساخن', 'hot'],
    },

    // ماء — 5 sizes (1.15 / 2.30 / 3.45 / 4.60 / 5.75 SAR)
    {
      cat: 'المشروبات', name_ar: 'ماء معدني — 200 مل', name_en: 'Water — 200ml',
      desc_ar: 'مياه معدنية زجاجة صغيرة 200 مل', desc_en: 'Mineral water small bottle 200ml',
      price: 1.15, unit: 'bottle', image: IMG.water, cal: 0,
      tags: ['ماء', 'مياه', 'water', 'mineral', 'معدني'],
      stock_qty: 200,
    },
    {
      cat: 'المشروبات', name_ar: 'ماء معدني — 500 مل', name_en: 'Water — 500ml',
      desc_ar: 'مياه معدنية زجاجة 500 مل', desc_en: 'Mineral water bottle 500ml',
      price: 2.30, unit: 'bottle', image: IMG.water, cal: 0,
      tags: ['ماء', 'مياه', 'water', 'mineral', 'معدني'],
      stock_qty: 200,
    },
    {
      cat: 'المشروبات', name_ar: 'ماء معدني — 750 مل', name_en: 'Water — 750ml',
      desc_ar: 'مياه معدنية زجاجة 750 مل', desc_en: 'Mineral water bottle 750ml',
      price: 3.45, unit: 'bottle', image: IMG.water, cal: 0,
      tags: ['ماء', 'مياه', 'water', 'mineral'],
    },
    {
      cat: 'المشروبات', name_ar: 'ماء معدني — 1 لتر', name_en: 'Water — 1L',
      desc_ar: 'مياه معدنية زجاجة 1 لتر', desc_en: 'Mineral water bottle 1L',
      price: 4.60, unit: 'bottle', image: IMG.water, cal: 0,
      tags: ['ماء', 'مياه', 'water', '1L', 'لتر'],
    },
    {
      cat: 'المشروبات', name_ar: 'ماء معدني — 1.5 لتر', name_en: 'Water — 1.5L',
      desc_ar: 'مياه معدنية زجاجة عائلية 1.5 لتر', desc_en: 'Mineral water family bottle 1.5L',
      price: 5.75, unit: 'bottle', image: IMG.water, cal: 0,
      tags: ['ماء', 'مياه', 'water', 'family', 'عائلي'],
    },
  ];

  // ── 5. Insert all products ───────────────────────────────────────
  console.log(`\n📦 Inserting ${products.length} products...\n`);
  let ok = 0;

  for (const p of products) {
    const catId = catIds[p.cat];
    if (!catId) {
      console.warn(`  ⚠️  Category not found: ${p.cat} for ${p.name_ar}`);
      continue;
    }
    const desc_ar = p.cal ? `${p.desc_ar} (${p.cal} سعر حراري)` : p.desc_ar;
    const desc_en = p.cal ? `${p.desc_en} (${p.cal} cal)` : p.desc_en;

    await pool.query(`
      INSERT INTO products (
        store_id, category_id,
        name_ar, name_en, description_ar, description_en,
        price, unit, image_url,
        in_stock, stock_qty, tags, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text[],true)
    `, [
      storeId, catId,
      p.name_ar, p.name_en, desc_ar, desc_en,
      p.price, p.unit, p.image,
      p.in_stock ?? true,
      p.stock_qty !== undefined ? p.stock_qty : null,
      p.tags,
    ]);
    ok++;
    process.stdout.write(`  ✅ ${p.name_ar} — ${p.price} ر.س\n`);
  }

  // ── 6. Summary ───────────────────────────────────────────────────
  const totals = await pool.query(
    `SELECT c.name_ar, COUNT(p.id) AS cnt
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true
     WHERE c.store_id = $1
     GROUP BY c.name_ar, c.sort_order
     ORDER BY c.sort_order`,
    [storeId]
  );

  console.log('\n═══════════════════════════════════════');
  console.log('  مطعم الكروان 1 — القائمة الكاملة');
  console.log('═══════════════════════════════════════');
  for (const row of totals.rows) {
    console.log(`  ${row.name_ar.padEnd(18)} ${row.cnt} صنف`);
  }
  console.log(`\n  ✅ إجمالي الأصناف: ${ok}`);
  console.log('═══════════════════════════════════════\n');

  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
