"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Database seed script — inserts sample Saudi grocery store data.
 * Run once: npx tsx src/database/seed.ts
 */
const connection_1 = require("./connection");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
const STORE_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const STORE_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
async function seed() {
    const pool = (0, connection_1.getPool)();
    console.log('🌱 Starting seed...\n');
    // ── 1. Upsert Store ────────────────────────────────────────────
    // Upsert by whatsapp_phone_id — safe to run multiple times
    const storeRes = await pool.query(`
    INSERT INTO stores (
      name, name_ar, phone,
      whatsapp_phone_id, whatsapp_token,
      city, working_hours, delivery_zones,
      delivery_fee, free_delivery_above, min_order,
      payment_methods, vat_rate, subscription_plan, is_active
    ) VALUES (
      'SmartOrder Dev Store', 'متجر سمارت أوردر', '+966500000000',
      $1, $2,
      'Riyadh',
      '{"sat-thu": "08:00-23:00", "fri": "14:00-23:00"}'::jsonb,
      '[{"name":"North Riyadh","name_ar":"شمال الرياض","fee":10,"min_order":30},
        {"name":"South Riyadh","name_ar":"جنوب الرياض","fee":12,"min_order":30},
        {"name":"East Riyadh","name_ar":"شرق الرياض","fee":10,"min_order":30},
        {"name":"West Riyadh","name_ar":"غرب الرياض","fee":15,"min_order":50}]'::jsonb,
      10.00, 150.00, 30.00,
      ARRAY['cod','mada','apple_pay','stc_pay'],
      0.15, 'pro', true
    )
    ON CONFLICT (whatsapp_phone_id)
    DO UPDATE SET
      whatsapp_token = EXCLUDED.whatsapp_token,
      updated_at = NOW()
    RETURNING id
  `, [STORE_PHONE_ID, STORE_TOKEN]);
    const storeId = storeRes.rows[0].id;
    console.log('✅ Store upserted:', storeId);
    // ── 2. Categories ──────────────────────────────────────────────
    const categories = [
        { name_ar: 'خضار وفواكه', name_en: 'Fruits & Vegetables', sort: 1 },
        { name_ar: 'لحوم ودواجن', name_en: 'Meat & Poultry', sort: 2 },
        { name_ar: 'ألبان وأجبان', name_en: 'Dairy & Cheese', sort: 3 },
        { name_ar: 'مشروبات', name_en: 'Beverages', sort: 4 },
        { name_ar: 'معلبات وحبوب', name_en: 'Canned & Grains', sort: 5 },
        { name_ar: 'مخبوزات', name_en: 'Bakery', sort: 6 },
        { name_ar: 'منظفات ومستلزمات', name_en: 'Cleaning & Household', sort: 7 },
    ];
    const catIds = {};
    for (const cat of categories) {
        const res = await pool.query(`
      INSERT INTO categories (store_id, name_ar, name_en, sort_order, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT DO NOTHING
      RETURNING id, name_ar
    `, [storeId, cat.name_ar, cat.name_en, cat.sort]);
        if (res.rows.length > 0) {
            catIds[cat.name_ar] = res.rows[0].id;
            console.log('  ✅ Category:', cat.name_ar, '->', catIds[cat.name_ar]);
        }
        else {
            // Fetch existing
            const ex = await pool.query('SELECT id FROM categories WHERE store_id = $1 AND name_ar = $2', [storeId, cat.name_ar]);
            catIds[cat.name_ar] = ex.rows[0]?.id;
        }
    }
    // ── 3. Products ────────────────────────────────────────────────
    const products = [
        // ── Fruits & Vegetables ──────────────────────────────────────
        {
            cat: 'خضار وفواكه', name_ar: 'تفاح أحمر', name_en: 'Red Apple',
            price: 12.00, unit: 'kg', in_stock: true, stock_qty: 100,
            tags: ['فواكه', 'تفاح', 'apple', 'fruit'],
            desc_ar: 'تفاح أحمر طازج مستورد، غني بالألياف والفيتامينات',
            desc_en: 'Fresh imported red apples, rich in fiber and vitamins',
        },
        {
            cat: 'خضار وفواكه', name_ar: 'موز', name_en: 'Banana',
            price: 7.50, unit: 'kg', in_stock: true, stock_qty: 80,
            tags: ['فواكه', 'موز', 'banana', 'fruit'],
            desc_ar: 'موز طازج', desc_en: 'Fresh bananas',
        },
        {
            cat: 'خضار وفواكه', name_ar: 'طماطم', name_en: 'Tomatoes',
            price: 5.00, unit: 'kg', in_stock: true, stock_qty: 150,
            tags: ['خضار', 'طماطم', 'tomato', 'vegetable'],
            desc_ar: 'طماطم طازجة محلية', desc_en: 'Fresh local tomatoes',
        },
        {
            cat: 'خضار وفواكه', name_ar: 'بطاطس', name_en: 'Potatoes',
            price: 4.50, unit: 'kg', in_stock: true, stock_qty: 200,
            tags: ['خضار', 'بطاطس', 'potato', 'vegetable'],
            desc_ar: 'بطاطس طازجة', desc_en: 'Fresh potatoes',
        },
        {
            cat: 'خضار وفواكه', name_ar: 'بصل', name_en: 'Onion',
            price: 3.00, unit: 'kg', in_stock: true, stock_qty: 200,
            tags: ['خضار', 'بصل', 'onion'],
            desc_ar: 'بصل طازج', desc_en: 'Fresh onions',
        },
        // ── Dairy & Cheese ────────────────────────────────────────────
        {
            cat: 'ألبان وأجبان', name_ar: 'حليب المراعي 2 لتر', name_en: 'Almarai Milk 2L',
            price: 14.00, unit: 'piece', in_stock: true, stock_qty: 50,
            tags: ['حليب', 'المراعي', 'milk', 'dairy', 'almarai'],
            desc_ar: 'حليب المراعي كامل الدسم 2 لتر', desc_en: 'Almarai full-fat milk 2L',
        },
        {
            cat: 'ألبان وأجبان', name_ar: 'حليب المراعي 1 لتر', name_en: 'Almarai Milk 1L',
            price: 8.50, unit: 'piece', in_stock: true, stock_qty: 80,
            tags: ['حليب', 'المراعي', 'milk', 'dairy', 'almarai'],
            desc_ar: 'حليب المراعي كامل الدسم 1 لتر', desc_en: 'Almarai full-fat milk 1L',
        },
        {
            cat: 'ألبان وأجبان', name_ar: 'لبن يوغرت المراعي', name_en: 'Almarai Yogurt',
            price: 6.50, unit: 'piece', in_stock: true, stock_qty: 40,
            tags: ['لبن', 'يوغرت', 'المراعي', 'yogurt', 'dairy'],
            desc_ar: 'لبن زبادي المراعي 400 جرام', desc_en: 'Almarai yogurt 400g',
        },
        {
            cat: 'ألبان وأجبان', name_ar: 'بيض طازج 30 حبة', name_en: 'Fresh Eggs 30pc',
            price: 22.00, unit: 'piece', in_stock: true, stock_qty: 30,
            tags: ['بيض', 'eggs', 'dairy'],
            desc_ar: 'بيض طازج محلي 30 حبة', desc_en: 'Fresh local eggs 30 pieces',
        },
        {
            cat: 'ألبان وأجبان', name_ar: 'جبن كرافت', name_en: 'Kraft Cheese',
            price: 18.50, unit: 'piece', in_stock: true, stock_qty: 25,
            tags: ['جبن', 'كرافت', 'cheese', 'kraft'],
            desc_ar: 'جبن كرافت شرائح 200 جرام', desc_en: 'Kraft cheese slices 200g',
        },
        // ── Meat & Poultry ────────────────────────────────────────────
        {
            cat: 'لحوم ودواجن', name_ar: 'دجاج طازج كامل', name_en: 'Fresh Whole Chicken',
            price: 24.00, unit: 'kg', in_stock: true, stock_qty: 20,
            tags: ['دجاج', 'لحوم', 'chicken', 'meat', 'poultry'],
            desc_ar: 'دجاج طازج كامل مبرد', desc_en: 'Fresh chilled whole chicken',
        },
        {
            cat: 'لحوم ودواجن', name_ar: 'لحم بقري مفروم', name_en: 'Ground Beef',
            price: 42.00, unit: 'kg', in_stock: true, stock_qty: 15,
            tags: ['لحم', 'بقري', 'مفروم', 'beef', 'ground', 'meat'],
            desc_ar: 'لحم بقري مفروم طازج', desc_en: 'Fresh ground beef',
        },
        // ── Beverages ─────────────────────────────────────────────────
        {
            cat: 'مشروبات', name_ar: 'ماء نجوى 1.5 لتر', name_en: 'Najwa Water 1.5L',
            price: 2.00, unit: 'piece', in_stock: true, stock_qty: 200,
            tags: ['ماء', 'مياه', 'نجوى', 'water'],
            desc_ar: 'مياه نجوى المعدنية 1.5 لتر', desc_en: 'Najwa mineral water 1.5L',
        },
        {
            cat: 'مشروبات', name_ar: 'عصير البستان برتقال', name_en: 'Albustan Orange Juice',
            price: 9.50, unit: 'piece', in_stock: true, stock_qty: 40,
            tags: ['عصير', 'برتقال', 'juice', 'orange'],
            desc_ar: 'عصير البستان برتقال 1 لتر', desc_en: 'Albustan orange juice 1L',
        },
        {
            cat: 'مشروبات', name_ar: 'بيبسي 330 مل', name_en: 'Pepsi 330ml',
            price: 3.50, unit: 'piece', in_stock: true, stock_qty: 100,
            tags: ['بيبسي', 'مشروبات', 'pepsi', 'soda', 'cola'],
            desc_ar: 'بيبسي كولا 330 مل', desc_en: 'Pepsi cola 330ml can',
        },
        // ── Canned & Grains ───────────────────────────────────────────
        {
            cat: 'معلبات وحبوب', name_ar: 'أرز بسمتي 5 كيلو', name_en: 'Basmati Rice 5kg',
            price: 35.00, unit: 'piece', in_stock: true, stock_qty: 60,
            tags: ['أرز', 'بسمتي', 'rice', 'basmati', 'grains'],
            desc_ar: 'أرز بسمتي فاخر 5 كيلو', desc_en: 'Premium basmati rice 5kg',
        },
        {
            cat: 'معلبات وحبوب', name_ar: 'سكر 2 كيلو', name_en: 'Sugar 2kg',
            price: 8.00, unit: 'piece', in_stock: true, stock_qty: 100,
            tags: ['سكر', 'sugar'],
            desc_ar: 'سكر أبيض ناعم 2 كيلو', desc_en: 'White fine sugar 2kg',
        },
        {
            cat: 'معلبات وحبوب', name_ar: 'زيت عافية 1.5 لتر', name_en: 'Afia Oil 1.5L',
            price: 18.00, unit: 'piece', in_stock: true, stock_qty: 50,
            tags: ['زيت', 'عافية', 'oil', 'cooking', 'sunflower'],
            desc_ar: 'زيت دوار الشمس عافية 1.5 لتر', desc_en: 'Afia sunflower oil 1.5L',
        },
        {
            cat: 'معلبات وحبوب', name_ar: 'طحين 5 كيلو', name_en: 'Flour 5kg',
            price: 16.50, unit: 'piece', in_stock: true, stock_qty: 40,
            tags: ['طحين', 'دقيق', 'flour'],
            desc_ar: 'طحين متعدد الأغراض 5 كيلو', desc_en: 'All-purpose flour 5kg',
        },
        // ── Bakery ────────────────────────────────────────────────────
        {
            cat: 'مخبوزات', name_ar: 'خبز تميس', name_en: 'Tamees Bread',
            price: 2.50, unit: 'piece', in_stock: true, stock_qty: 30,
            tags: ['خبز', 'تميس', 'bread', 'bakery'],
            desc_ar: 'خبز تميس طازج', desc_en: 'Fresh tamees bread',
        },
        {
            cat: 'مخبوزات', name_ar: 'خبز توست بندر', name_en: 'Bander Toast Bread',
            price: 5.50, unit: 'piece', in_stock: true, stock_qty: 25,
            tags: ['خبز', 'توست', 'بندر', 'bread', 'toast'],
            desc_ar: 'خبز توست بندر 600 جرام', desc_en: 'Bander toast bread 600g',
        },
        // ── Cleaning ──────────────────────────────────────────────────
        {
            cat: 'منظفات ومستلزمات', name_ar: 'صابون لوكس', name_en: 'Lux Soap',
            price: 7.00, unit: 'piece', in_stock: true, stock_qty: 60,
            tags: ['صابون', 'لوكس', 'soap', 'cleaning', 'lux'],
            desc_ar: 'صابون لوكس 3 قطع', desc_en: 'Lux soap 3-pack',
        },
        {
            cat: 'منظفات ومستلزمات', name_ar: 'سائل تنظيف أطباق', name_en: 'Dishwashing Liquid',
            price: 9.00, unit: 'piece', in_stock: false, stock_qty: 0,
            tags: ['سائل', 'تنظيف', 'أطباق', 'dishwash', 'cleaning'],
            desc_ar: 'سائل تنظيف الأطباق 1 لتر', desc_en: 'Dishwashing liquid 1L',
        },
    ];
    let created = 0;
    for (const p of products) {
        const catId = catIds[p.cat];
        if (!catId) {
            console.warn('  ⚠️  Category not found for:', p.name_ar);
            continue;
        }
        await pool.query(`
      INSERT INTO products (
        store_id, category_id,
        name_ar, name_en, description_ar, description_en,
        price, unit, in_stock, stock_qty, tags, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],true)
      ON CONFLICT DO NOTHING
    `, [
            storeId, catId,
            p.name_ar, p.name_en, p.desc_ar, p.desc_en,
            p.price, p.unit, p.in_stock, p.stock_qty, p.tags,
        ]);
        created++;
    }
    console.log(`\n✅ ${created} products seeded`);
    // ── Summary ────────────────────────────────────────────────────
    const counts = await pool.query('SELECT COUNT(*) FROM products WHERE store_id = $1', [storeId]);
    console.log(`\n📊 Total products in DB: ${counts.rows[0].count}`);
    console.log('🌱 Seed complete!\n');
    await pool.end();
}
seed().catch((err) => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map