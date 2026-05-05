/**
 * Database seed script — inserts sample Saudi restaurant data.
 * Idempotent: safe to run multiple times (wipes and reloads menu each run).
 * Run: npm run db:seed
 */
import { getPool } from './connection';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const STORE_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const STORE_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN   || '';
const STORE_PHONE    = process.env.STORE_PHONE             || '+966500000000';

async function seed() {
  const pool = getPool();
  console.log('🌱 Starting seed...\n');

  // ── 1. Upsert Store ──────────────────────────────────────────────
  // ON CONFLICT (whatsapp_phone_id) — unique constraint exists on stores table
  const storeRes = await pool.query<{ id: string }>(`
    INSERT INTO stores (
      name, name_ar, phone,
      whatsapp_phone_id, whatsapp_token,
      city, working_hours, delivery_zones,
      delivery_fee, free_delivery_above, min_order,
      payment_methods, vat_rate, subscription_plan, is_active
    ) VALUES (
      'Alarfa Restaurant', 'مطعم العرفاء',
      $1, $2, $3,
      'Abha',
      '{"sat-thu": "11:00-23:00", "fri": "13:00-23:00"}'::jsonb,
      '[
        {"name":"North Abha","name_ar":"شمال أبها","fee":15,"min_order":30},
        {"name":"South Abha","name_ar":"جنوب أبها","fee":15,"min_order":30},
        {"name":"East Abha","name_ar":"شرق أبها","fee":15,"min_order":30},
        {"name":"West Abha","name_ar":"غرب أبها","fee":15,"min_order":30}
      ]'::jsonb,
      10.00, 100.00, 30.00,
      ARRAY['cash','sabaka','transfer','mada','apple_pay','stc_pay'],
      0.15, 'pro', true
    )
    ON CONFLICT (whatsapp_phone_id)
    DO UPDATE SET
      name              = EXCLUDED.name,
      name_ar           = EXCLUDED.name_ar,
      phone             = EXCLUDED.phone,
      payment_methods   = EXCLUDED.payment_methods,
      delivery_zones    = EXCLUDED.delivery_zones,
      working_hours     = EXCLUDED.working_hours,
      delivery_fee      = EXCLUDED.delivery_fee,
      free_delivery_above = EXCLUDED.free_delivery_above,
      min_order         = EXCLUDED.min_order,
      whatsapp_token    = EXCLUDED.whatsapp_token,
      updated_at        = NOW()
    RETURNING id
  `, [STORE_PHONE, STORE_PHONE_ID, STORE_TOKEN]);

  const storeId: string = storeRes.rows[0].id;
  console.log('✅ Store upserted:', storeId);

  // ── 2. Wipe existing menu (clean slate — makes seed idempotent) ──
  await pool.query('DELETE FROM products   WHERE store_id = $1', [storeId]);
  await pool.query('DELETE FROM categories WHERE store_id = $1', [storeId]);
  console.log('🗑️  Cleared old menu\n');

  // ── 3. Categories ─────────────────────────────────────────────────
  const categories = [
    { name_ar: 'مقبلات',             name_en: 'Starters',       sort: 1 },
    { name_ar: 'الأطباق الرئيسية',   name_en: 'Main Dishes',    sort: 2 },
    { name_ar: 'مشاوي ومندي',        name_en: 'Grills & Mandi', sort: 3 },
    { name_ar: 'وجبات سريعة',        name_en: 'Fast Food',      sort: 4 },
    { name_ar: 'حلويات',             name_en: 'Desserts',       sort: 5 },
    { name_ar: 'مشروبات',            name_en: 'Beverages',      sort: 6 },
    { name_ar: 'وجبات عائلية',       name_en: 'Family Meals',   sort: 7 },
  ];

  const catIds: Record<string, string> = {};
  for (const cat of categories) {
    const res = await pool.query<{ id: string; name_ar: string }>(`
      INSERT INTO categories (store_id, name_ar, name_en, sort_order, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, name_ar
    `, [storeId, cat.name_ar, cat.name_en, cat.sort]);

    catIds[cat.name_ar] = res.rows[0].id;
    console.log('  📂', cat.name_ar, '→', catIds[cat.name_ar]);
  }
  console.log();

  // ── 4. Products ───────────────────────────────────────────────────
  // Each product has: cat, name_ar, name_en, price, unit, desc_ar, desc_en, tags
  // image_url is optional — leave null if not provided
  interface ProductRow {
    cat:      string;
    name_ar:  string;
    name_en:  string;
    price:    number;
    unit:     string;
    in_stock?: boolean;
    stock_qty?: number | null;
    desc_ar:  string;
    desc_en:  string;
    image?:   string | null;
    tags:     string[];
  }

  const products: ProductRow[] = [
    // ── Starters (مقبلات) ──────────────────────────────────────────
    {
      cat: 'مقبلات', name_ar: 'حمص', name_en: 'Hummus',
      price: 15.00, unit: 'portion',
      desc_ar: 'حمص بالطحينة والليمون', desc_en: 'Creamy hummus with tahini and lemon',
      tags: ['حمص', 'hummus', 'مقبلات'],
    },
    {
      cat: 'مقبلات', name_ar: 'متبل بادنجان', name_en: 'Mutabbal',
      price: 15.00, unit: 'portion',
      desc_ar: 'متبل بادنجان بالطحينة', desc_en: 'Smoky eggplant dip with tahini',
      tags: ['متبل', 'بادنجان', 'mutabbal', 'مقبلات'],
    },
    {
      cat: 'مقبلات', name_ar: 'سلطة فتوش', name_en: 'Fattoush Salad',
      price: 18.00, unit: 'portion',
      desc_ar: 'سلطة فتوش طازجة مع الخبز المقرمش', desc_en: 'Fresh fattoush salad with crispy bread',
      tags: ['فتوش', 'سلطة', 'fattoush', 'salad'],
    },
    {
      cat: 'مقبلات', name_ar: 'شوربة عدس', name_en: 'Lentil Soup',
      price: 14.00, unit: 'portion',
      desc_ar: 'شوربة عدس ساخنة بالكمون', desc_en: 'Hot lentil soup with cumin',
      tags: ['شوربة', 'عدس', 'lentil', 'soup'],
    },

    // ── Main Dishes (الأطباق الرئيسية) ────────────────────────────
    {
      cat: 'الأطباق الرئيسية', name_ar: 'كبسة دجاج', name_en: 'Chicken Kabsa',
      price: 42.00, unit: 'portion',
      desc_ar: 'كبسة دجاج بالأرز والبهارات السعودية', desc_en: 'Chicken kabsa with rice and Saudi spices',
      tags: ['كبسة', 'دجاج', 'kabsa', 'chicken'],
    },
    {
      cat: 'الأطباق الرئيسية', name_ar: 'كبسة لحم', name_en: 'Lamb Kabsa',
      price: 55.00, unit: 'portion',
      desc_ar: 'كبسة لحم غنم بالأرز والبهارات', desc_en: 'Lamb kabsa with rice and spices',
      tags: ['كبسة', 'لحم', 'kabsa', 'lamb'],
    },
    {
      cat: 'الأطباق الرئيسية', name_ar: 'مجبوس دجاج', name_en: 'Chicken Majboos',
      price: 40.00, unit: 'portion',
      desc_ar: 'مجبوس دجاج على الطريقة الخليجية', desc_en: 'Gulf-style chicken majboos',
      tags: ['مجبوس', 'دجاج', 'majboos', 'chicken'],
    },
    {
      cat: 'الأطباق الرئيسية', name_ar: 'صالونة خضار', name_en: 'Vegetable Stew',
      price: 30.00, unit: 'portion',
      desc_ar: 'صالونة خضار متنوعة بالبهارات', desc_en: 'Mixed vegetable stew with spices',
      tags: ['صالونة', 'خضار', 'vegetable', 'stew'],
    },

    // ── Grills & Mandi (مشاوي ومندي) ──────────────────────────────
    {
      cat: 'مشاوي ومندي', name_ar: 'مندي دجاج كامل', name_en: 'Whole Chicken Mandi',
      price: 75.00, unit: 'portion', stock_qty: 20,
      desc_ar: 'مندي دجاج كامل مطهي على الفحم', desc_en: 'Whole chicken mandi slow-cooked on charcoal',
      tags: ['مندي', 'دجاج', 'mandi', 'chicken'],
    },
    {
      cat: 'مشاوي ومندي', name_ar: 'مندي لحم', name_en: 'Lamb Mandi',
      price: 95.00, unit: 'portion', stock_qty: 15,
      desc_ar: 'مندي لحم غنم مطهي على الفحم', desc_en: 'Lamb mandi slow-cooked on charcoal',
      tags: ['مندي', 'لحم', 'mandi', 'lamb'],
    },
    {
      cat: 'مشاوي ومندي', name_ar: 'مشاوي مشكلة', name_en: 'Mixed Grills',
      price: 85.00, unit: 'portion',
      desc_ar: 'تشكيلة من المشاوي المشكلة', desc_en: 'Assorted mixed grills platter',
      tags: ['مشاوي', 'مشكلة', 'grills', 'mixed'],
    },
    {
      cat: 'مشاوي ومندي', name_ar: 'شيش طاووق', name_en: 'Shish Tawook',
      price: 45.00, unit: 'portion',
      desc_ar: 'شيش طاووق دجاج مشوي بالثوم والليمون', desc_en: 'Grilled chicken shish tawook with garlic',
      tags: ['شيش', 'طاووق', 'shish tawook', 'chicken'],
    },

    // ── Fast Food (وجبات سريعة) ────────────────────────────────────
    {
      cat: 'وجبات سريعة', name_ar: 'شاورما دجاج', name_en: 'Chicken Shawarma',
      price: 22.00, unit: 'portion',
      desc_ar: 'شاورما دجاج بالخبز والصلصة', desc_en: 'Chicken shawarma wrap with sauce',
      tags: ['شاورما', 'شاورمة', 'shawarma', 'دجاج', 'chicken'],
    },
    {
      cat: 'وجبات سريعة', name_ar: 'شاورما لحم', name_en: 'Meat Shawarma',
      price: 28.00, unit: 'portion',
      desc_ar: 'شاورما لحم بالخبز والصلصة', desc_en: 'Meat shawarma wrap with sauce',
      tags: ['شاورما', 'شاورمة', 'shawarma', 'لحم', 'meat'],
    },
    {
      cat: 'وجبات سريعة', name_ar: 'برغر لحم', name_en: 'Beef Burger',
      price: 32.00, unit: 'portion',
      desc_ar: 'برغر لحم بقري مع البطاطس والصلصة', desc_en: 'Beef burger with fries and sauce',
      tags: ['برغر', 'لحم', 'burger', 'beef'],
    },
    {
      cat: 'وجبات سريعة', name_ar: 'بيتزا مارغريتا', name_en: 'Margherita Pizza',
      price: 38.00, unit: 'portion',
      desc_ar: 'بيتزا مارغريتا بالجبن والطماطم', desc_en: 'Margherita pizza with cheese and tomato',
      tags: ['بيتزا', 'مارغريتا', 'pizza', 'margherita'],
    },

    // ── Desserts (حلويات) ──────────────────────────────────────────
    {
      cat: 'حلويات', name_ar: 'أم علي', name_en: 'Umm Ali',
      price: 18.00, unit: 'portion',
      desc_ar: 'أم علي بالمكسرات والكريمة', desc_en: 'Umm Ali with nuts and cream',
      tags: ['حلويات', 'ام علي', 'umm ali', 'dessert'],
    },
    {
      cat: 'حلويات', name_ar: 'محلبية', name_en: 'Muhalabiyya',
      price: 14.00, unit: 'portion',
      desc_ar: 'محلبية بالحليب وماء الزهر', desc_en: 'Milk pudding with rose water',
      tags: ['حلويات', 'محلبية', 'muhalabiyya', 'dessert'],
    },
    {
      cat: 'حلويات', name_ar: 'كنافة', name_en: 'Kunafa',
      price: 20.00, unit: 'portion',
      desc_ar: 'كنافة بالجبن والقطر', desc_en: 'Kunafa with cheese and syrup',
      tags: ['حلويات', 'كنافة', 'kunafa', 'dessert'],
    },

    // ── Beverages (مشروبات) ────────────────────────────────────────
    {
      cat: 'مشروبات', name_ar: 'عصير مانجو طازج', name_en: 'Fresh Mango Juice',
      price: 18.00, unit: 'glass',
      desc_ar: 'عصير مانجو طازج 100%', desc_en: 'Fresh squeezed mango juice',
      tags: ['عصير', 'مانجو', 'juice', 'mango'],
    },
    {
      cat: 'مشروبات', name_ar: 'عصير برتقال طازج', name_en: 'Fresh Orange Juice',
      price: 15.00, unit: 'glass',
      desc_ar: 'عصير برتقال طازج 100%', desc_en: 'Fresh squeezed orange juice',
      tags: ['عصير', 'برتقال', 'juice', 'orange'],
    },
    {
      cat: 'مشروبات', name_ar: 'ماء معدني', name_en: 'Mineral Water',
      price: 4.00, unit: 'bottle', stock_qty: 200,
      desc_ar: 'ماء معدني زجاجة 500 مل', desc_en: 'Mineral water 500ml bottle',
      tags: ['ماء', 'مياه', 'water', 'mineral'],
    },
    {
      cat: 'مشروبات', name_ar: 'شاي كرك', name_en: 'Karak Tea',
      price: 8.00, unit: 'cup',
      desc_ar: 'شاي كرك بالهيل والحليب', desc_en: 'Karak tea with cardamom and milk',
      tags: ['شاي', 'كرك', 'tea', 'karak'],
    },
    {
      cat: 'مشروبات', name_ar: 'قهوة عربية', name_en: 'Arabic Coffee',
      price: 10.00, unit: 'cup',
      desc_ar: 'قهوة عربية بالهيل والزعفران', desc_en: 'Arabic coffee with cardamom and saffron',
      tags: ['قهوة', 'عربية', 'coffee', 'arabic'],
    },
    {
      cat: 'مشروبات', name_ar: 'ببسي', name_en: 'Pepsi',
      price: 7.00, unit: 'can',
      desc_ar: 'ببسي كولا علبة 355 مل', desc_en: 'Pepsi cola can 355ml',
      tags: ['ببسي', 'pepsi', 'soda', 'cola'],
    },
     {
      cat: 'مشروبات', name_ar: 'حمضيات', name_en: 'Mirinda Citrus',
      price: 7.00, unit: 'can',
      desc_ar: 'حمضيات علبة 335 مل', desc_en: 'Mirinda citrus can 335ml',
      tags: ['ببسي', 'pepsi', 'soda', 'cola'],
    },


    // ── Family Meals (وجبات عائلية) ────────────────────────────────
    {
      cat: 'وجبات عائلية', name_ar: 'وجبة عائلية كبسة دجاج 4 أشخاص', name_en: 'Family Chicken Kabsa (4 persons)',
      price: 149.00, unit: 'portion', stock_qty: 10,
      desc_ar: 'كبسة دجاج عائلية تكفي 4 أشخاص مع الخبز والمشروبات', desc_en: 'Family chicken kabsa for 4 persons with bread',
      tags: ['عائلية', 'family', 'كبسة', 'دجاج', 'kabsa'],
    },
    {
      cat: 'وجبات عائلية', name_ar: 'وجبة عائلية مندي', name_en: 'Family Mandi Meal',
      price: 189.00, unit: 'portion', stock_qty: 8,
      desc_ar: 'وجبة مندي عائلية تكفي 4-6 أشخاص', desc_en: 'Family mandi meal for 4-6 persons',
      tags: ['عائلية', 'family', 'مندي', 'mandi'],
    },
  ];

  let created = 0;
  for (const p of products) {
    const catId = catIds[p.cat];
    if (!catId) {
      console.warn('  ⚠️  Category not found for:', p.name_ar, '(cat:', p.cat, ')');
      continue;
    }

    await pool.query(`
      INSERT INTO products (
        store_id, category_id,
        name_ar, name_en, description_ar, description_en,
        price, unit, image_url,
        in_stock, stock_qty, tags, is_active
      ) VALUES (
        $1, $2,
        $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12::text[], true
      )
    `, [
      storeId,       catId,
      p.name_ar,     p.name_en,     p.desc_ar,             p.desc_en,
      p.price,       p.unit,        p.image ?? null,
      p.in_stock ?? true,           p.stock_qty ?? null,   p.tags,
    ]);
    created++;
    process.stdout.write(`  ✅ ${p.name_ar} — ${p.price} ر.س\n`);
  }

  // ── 5. Summary ────────────────────────────────────────────────────
  const counts = await pool.query<{ name_ar: string; cnt: string }>(`
    SELECT c.name_ar, COUNT(p.id)::text AS cnt
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true
    WHERE c.store_id = $1
    GROUP BY c.name_ar, c.sort_order
    ORDER BY c.sort_order
  `, [storeId]);

  console.log('\n═══════════════════════════════════════');
  console.log('  مطعم كروان — القائمة الكاملة');
  console.log('═══════════════════════════════════════');
  for (const row of counts.rows) {
    console.log(`  ${row.name_ar.padEnd(20)} ${row.cnt} صنف`);
  }
  console.log(`\n  ✅ إجمالي الأصناف المضافة: ${created}`);
  console.log('═══════════════════════════════════════\n');

  await pool.end();
}

seed().catch((err: Error) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
