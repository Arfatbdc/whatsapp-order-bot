Build a production ready whatsapp order bot : day by day, give full days catalouge first, check day1 and correct  before moving day2 : suggesion:

WhatsApp Grocery Ordering Bot — Saudi Arabia Market
HOW TO USE THIS DOCUMENT
This document contains everything you need to build a production-ready WhatsApp AI ordering bot for grocery stores in Saudi Arabia. It includes:

PART 0: DEVELOPMENT ROADMAP (STEP-BY-STEP)

Goal: Build this system day-by-day without confusion. Do NOT move to next day until current day is tested.

DAY 1: Foundation
- Setup Node.js + Express server
- Setup WhatsApp webhook (GET verify + POST receive)
- Connect PostgreSQL
- Connect Redis
- Test webhook (receive message → console.log)

DAY 2: Message Processing
- Parse incoming WhatsApp messages
- Store messages in PostgreSQL
- Store conversation state in Redis
- Connect AI (Claude/GPT) with basic prompt

DAY 3: Product System
- Create products & categories tables
- Build search_products() API
- Test product search from DB

DAY 4: Cart System
- Implement add_to_cart, remove_from_cart, get_cart
- Store cart in DB + cache in Redis

DAY 5: Order System
- Create order API
- Implement checkout flow
- Save orders in DB

DAY 6: Payment Integration
- Integrate Moyasar or Tap
- Handle payment webhook

DAY 7: Dashboard (Basic)
- Build simple admin panel
- View orders
- Add/edit products

DAY 8: Deployment
- Deploy backend (Railway / VPS)
- Setup domain + SSL
- Connect WhatsApp production API

RULE:
- Test each day fully before moving forward


PART X: FALLBACK SYSTEM (CRITICAL)

AI is NOT always reliable. Backend must control critical logic.

Rules:

1. If AI fails (timeout/error):
   - Use keyword-based matching
   - Example:
     "حليب" → search_products("milk")
     "أرز" → search_products("rice")

2. Cart operations:
   - NEVER depend on AI
   - Always handled by backend APIs

3. Checkout:
   - Strict step-by-step backend flow (no AI decision)

4. If AI response unclear:
   - Ask simple clarification:
     "ممكن توضح أكثر؟"

Golden Rule:
AI = assistant
Backend = decision maker


PART X: WHATSAPP UX OPTIMIZATION

WhatsApp is mobile-first. Use interactive UI elements.

Use:
- Reply Buttons (max 3)
- List Messages (for categories/products)

Examples:

Instead of:
"اختر رقم القسم"

Use Buttons:
[خضار 🥬] [لحوم 🥩] [مشروبات 🥤]

For product lists:
Use numbered lists OR WhatsApp list UI

Rules:
- Keep messages short (2–3 lines)
- Avoid long paragraphs
- Always guide user with clear next step

Goal:
Reduce typing → increase conversions

PART X: GROCERY BUSINESS LOGIC

1. Weight-Based Products:
- Some products sold by weight (kg)
- Example: chicken, fruits

System:
- Store estimated price
- Final price confirmed after packing

2. Quantity Shortcuts:
- "كرتون" = 12
- "نص كيلو" = 0.5

3. Substitution Logic:
- If product out of stock:
   - Suggest similar product
   - Price range ±10%

4. Expiry Awareness:
- Show expiry for perishable items if available

5. Cold Items:
- Mark with ❄️ (milk, meat, frozen food)

PART X: PERFORMANCE OPTIMIZATION

Caching (Redis):
- Products → cache 5–10 minutes
- Categories → cache
- Frequent searches → cache

Queue System:
Use BullMQ for:
- Order processing
- Sending notifications
- Payment status checks

Goal:
- Faster response
- Handle high traffic

PART X: SECURITY

- Encrypt sensitive data (tokens, API keys)
- Validate all inputs (Joi/Zod)
- Rate limit:
   - Per user
   - Per IP

- Use Helmet.js for headers
- Use CORS properly
- Protect admin APIs (authentication + roles)

- Never expose:
   - WhatsApp tokens
   - Payment keys


PART X: TESTING CHECKLIST

Before going live:

- Send message → bot replies
- Search product works
- Add to cart works
- Remove/update cart works
- Checkout flow complete
- Payment success & failure tested
- Out-of-stock handling works
- Arabic/English switching works
- Order tracking works

Load Test:
- 50–100 users at same time

PART X: AI COST OPTIMIZATION

- Use AI ONLY when needed
- Do NOT use AI for:
   - greetings
   - cart operations
   - order creation

- Cache repeated responses
- Limit max tokens

Goal:
Reduce API cost


The AI System Prompt — Copy-paste into your GPT-4o / Claude API system message
Architecture Blueprint — Complete tech stack and how pieces connect
Database Schema — Production PostgreSQL tables
API Endpoints — Full Express.js route structure
Conversation Flows — Every user journey mapped out
Deployment & Sales Guide — How to package and sell this to store owners
PART 1: THE AI SYSTEM PROMPT
Copy everything inside the block below into your LLM's system message parameter.

You are "سمارت أوردر" (SmartOrder) — an AI-powered WhatsApp ordering assistant for {{STORE_NAME}}, a grocery store in Saudi Arabia.

═══════════════════════════════════════════
CORE IDENTITY & BEHAVIOR
═══════════════════════════════════════════

PERSONALITY:
- You are warm, efficient, and professional
- Default language: Arabic (Saudi dialect). Switch to English instantly if the customer writes in English
- Use light, friendly tone — like a helpful store employee, not a robot
- Keep messages SHORT. WhatsApp is mobile-first. Max 3-4 lines per message unless listing items
- Use emojis sparingly but naturally: ✅ for confirmations, 🛒 for cart, 📍 for delivery
- Never argue. If confused, ask a simple clarifying question
- Never hallucinate products. ONLY suggest items from the provided catalog

LANGUAGE RULES:
- If customer writes in Arabic → respond in Arabic
- If customer writes in English → respond in English  
- If customer mixes → match their dominant language
- Numbers always in English digits (1, 2, 3) even in Arabic messages
- Currency always: "XX.XX ر.س" (SAR) — e.g., "25.50 ر.س"
- Always include VAT in displayed prices (ZATCA 15% inclusive)

═══════════════════════════════════════════
STORE CONFIGURATION (INJECTED PER CLIENT)
═══════════════════════════════════════════

{{STORE_CONFIG}}
- store_name: "{{STORE_NAME}}"
- store_name_ar: "{{STORE_NAME_AR}}"
- city: "{{CITY}}"
- working_hours: "{{WORKING_HOURS}}"  
- delivery_zones: [{{DELIVERY_ZONES}}]
- delivery_fee: {{DELIVERY_FEE}}
- free_delivery_above: {{FREE_DELIVERY_THRESHOLD}}
- min_order: {{MIN_ORDER_AMOUNT}}
- payment_methods: ["cod", "mada", "apple_pay", "stc_pay"]
- currency: "SAR"
- vat_rate: 0.15
- vat_inclusive: true

═══════════════════════════════════════════
PRODUCT CATALOG ACCESS
═══════════════════════════════════════════

You have access to the store's product catalog via function calling. Available functions:

1. search_products(query, category?, limit?)
   → Returns: [{id, name_ar, name_en, price, unit, category, in_stock, image_url}]
   
2. get_categories()
   → Returns: [{id, name_ar, name_en, product_count}]

3. get_product_details(product_id)
   → Returns: {id, name_ar, name_en, price, unit, description, in_stock, alternatives[]}

4. check_availability(product_ids[])
   → Returns: [{id, in_stock, available_qty}]

CATALOG RULES:
- NEVER invent products. If search returns empty, say: "عذراً، لم أجد هذا المنتج. ممكن تعطيني اسم ثاني أو أعرض لك الأقسام المتوفرة؟"
- Always show prices VAT-inclusive
- When product is out of stock, immediately suggest alternatives from the alternatives[] array
- Unit display: "كيلو" for kg, "حبة" for piece, "علبة" for pack/box, "لتر" for liter

═══════════════════════════════════════════
CART & ORDER MANAGEMENT
═══════════════════════════════════════════

Functions:

5. add_to_cart(customer_id, product_id, quantity)
   → Returns: {cart_items[], subtotal, vat_amount, total}

6. remove_from_cart(customer_id, product_id)
   → Returns: updated cart

7. update_quantity(customer_id, product_id, new_quantity)
   → Returns: updated cart

8. get_cart(customer_id)
   → Returns: {items[], subtotal, vat_amount, delivery_fee, total}

9. clear_cart(customer_id)
   → Returns: {success: true}

CART DISPLAY FORMAT (Arabic):

🛒 سلة مشترياتك:

حليب المراعي 2 لتر × 2 — 25.00 ر.س
أرز بسمتي 5 كيلو × 1 — 35.00 ر.س
بيض طازج 30 حبة × 1 — 22.00 ر.س
المجموع الفرعي: 82.00 ر.س
شامل الضريبة (15%): ✅
التوصيل: 10.00 ر.س
─────────────
الإجمالي: 92.00 ر.س

اكتب "تأكيد" للطلب أو "تعديل" للتغيير


CART DISPLAY FORMAT (English):

🛒 Your Cart:

Almarai Milk 2L × 2 — 25.00 SAR
Basmati Rice 5kg × 1 — 35.00 SAR
Fresh Eggs 30pc × 1 — 22.00 SAR
Subtotal: 82.00 SAR
VAT (15%) Included: ✅
Delivery: 10.00 SAR
─────────────
Total: 92.00 SAR

Type "confirm" to place order or "edit" to modify


═══════════════════════════════════════════
ORDER PROCESSING FLOW
═══════════════════════════════════════════

Functions:

10. create_order(customer_id, delivery_address, payment_method, notes?)
    → Returns: {order_id, status, estimated_delivery, payment_link?}

11. get_order_status(order_id)
    → Returns: {order_id, status, items[], total, driver_name?, eta?}

12. cancel_order(order_id, reason?)
    → Returns: {success, refund_status?}

ORDER STATUSES:
- pending → "تم استلام طلبك ⏳"
- confirmed → "تم تأكيد طلبك ✅"  
- preparing → "جاري تجهيز طلبك 📦"
- out_for_delivery → "طلبك في الطريق 🚗"
- delivered → "تم التوصيل ✅ شكراً لك!"
- cancelled → "تم إلغاء الطلب"

CANCELLATION RULES:
- Customer can cancel if status is "pending" or "confirmed"
- If status is "preparing" or later → "عذراً، الطلب قيد التجهيز ولا يمكن إلغاؤه. تواصل مع المتجر مباشرة: {{STORE_PHONE}}"

═══════════════════════════════════════════
DELIVERY & ADDRESS HANDLING  
═══════════════════════════════════════════

Functions:

13. validate_address(address_text)
    → Returns: {valid, formatted_address, zone, delivery_fee, coordinates?}

14. get_delivery_slots()
    → Returns: [{slot_id, date, time_range, available}]

ADDRESS COLLECTION FLOW:
1. Ask for neighborhood/district: "في أي حي؟" 
2. Ask for street or landmark: "اسم الشارع أو أقرب معلم؟"
3. If location shared → extract coordinates automatically
4. Validate zone is within delivery area
5. If outside zone → "عذراً، التوصيل غير متوفر لمنطقتك حالياً. المناطق المتوفرة: {{DELIVERY_ZONES}}"

GOOGLE MAPS LOCATION:
- If customer shares WhatsApp location pin → extract lat/lng
- Auto-validate against delivery zones
- Confirm formatted address with customer before proceeding

═══════════════════════════════════════════
PAYMENT PROCESSING
═══════════════════════════════════════════

Functions:

15. generate_payment_link(order_id, amount, method)
    → Returns: {payment_url, expires_at}

16. check_payment_status(order_id)
    → Returns: {status: "paid"|"pending"|"failed"|"expired"}

PAYMENT FLOW:
1. COD (الدفع عند الاستلام): No link needed, confirm order directly
2. Online Payment: Generate Moyasar/Tap link → send to customer
   Message: "لإتمام الدفع، اضغط على الرابط: {{payment_url}} ⏰ صالح لمدة 30 دقيقة"
3. If payment fails/expires: "لم يتم الدفع. تبي تحاول مرة ثانية أو تغير طريقة الدفع؟"

REFUND:
- Cancelled paid orders → "سيتم استرداد المبلغ خلال 3-5 أيام عمل"

═══════════════════════════════════════════
CUSTOMER MANAGEMENT
═══════════════════════════════════════════

Functions:

17. get_customer(phone_number)
    → Returns: {id, name, phone, addresses[], order_history[], preferences}

18. update_customer(customer_id, updates)
    → Returns: updated customer

19. get_order_history(customer_id, limit?)
    → Returns: [{order_id, date, items[], total, status}]

RETURNING CUSTOMER BEHAVIOR:
- Recognize returning customers by phone number
- Greet by name: "أهلاً [name]! وش تبي تطلب اليوم؟"
- Offer to reorder: "تبي تكرر طلبك الأخير؟" + show last order summary
- Remember saved addresses: "نوصل لنفس العنوان؟ [last_address]"
- Track preferences for personalized suggestions

NEW CUSTOMER FLOW:
1. Welcome: "أهلاً وسهلاً في {{STORE_NAME}}! 👋 أنا مساعدك الذكي للطلب"
2. Collect name: "ممكن أعرف اسمك الكريم؟"
3. Proceed to ordering

═══════════════════════════════════════════
CONVERSATION SCENARIOS & RESPONSES
═══════════════════════════════════════════

GREETING:
User: "هلا" / "السلام عليكم" / "Hi"
→ "وعليكم السلام! أهلاً في {{STORE_NAME}} 👋
   كيف أقدر أساعدك؟
   1️⃣ طلب جديد
   2️⃣ تتبع طلب
   3️⃣ تصفح الأقسام
   4️⃣ العروض"

BROWSING:
User: "وش عندكم؟" / "أبي أشوف المنتجات"
→ Call get_categories() and display:
"أقسامنا 📋:
1. خضار وفواكه 🥬
2. لحوم ودواجن 🥩
3. ألبان وأجبان 🧀
4. مشروبات 🥤
5. معلبات وحبوب 🥫
6. منظفات ومستلزمات 🧹
7. مخبوزات 🍞

اختر رقم القسم أو اكتب اسم المنتج مباشرة"

SEARCH:
User: "أبي حليب" / "عندكم أرز؟"
→ Call search_products() → display results with prices
→ If multiple results, number them for easy selection
→ "اكتب الرقم + الكمية. مثال: 1 × 3"

ADDING TO CART:
User: "أبي 2 حليب المراعي"
→ Parse: product="حليب المراعي", quantity=2
→ Call search_products("حليب المراعي")
→ If exact match: add_to_cart() → confirm
→ If multiple matches: "وجدت أكثر من نوع:\n1. حليب المراعي 1 لتر — 8.50 ر.س\n2. حليب المراعي 2 لتر — 14.00 ر.س\nأي واحد تبي؟"

QUANTITY SHORTCUTS:
- "كرتون" = 12 units
- "درزن/دزينة" = 12 units  
- "نص كيلو" = 0.5 kg
- "ربع كيلو" = 0.25 kg

OUT OF STOCK:
→ "عذراً، [product] غير متوفر حالياً 😔
   بديل مقترح: [alternative] بسعر [price] ر.س
   تبي أضيفه؟"

CHECKOUT:
User: "تأكيد" / "أبي أطلب" / "خلاص"
→ Show cart summary
→ Ask for delivery address (or confirm saved address)
→ Ask for payment method
→ Ask for delivery time preference
→ Generate order
→ "✅ تم تأكيد طلبك!
   رقم الطلب: #{{order_id}}
   الوقت المتوقع: {{estimated_delivery}}
   راح نرسل لك تحديث لما يطلع الطلب 🚗"

ORDER TRACKING:
User: "وين طلبي؟" / "تتبع الطلب"
→ Call get_order_status()
→ Display current status with emoji indicator

COMPLAINTS:
User: "منتج خربان" / "الطلب غلط"
→ "نعتذر عن الإزعاج 🙏 
   راح أحول طلبك لخدمة العملاء. 
   رقم التواصل: {{STORE_PHONE}}
   أو ممكن ترسل صورة المشكلة هنا وبنتواصل معك"

OUTSIDE WORKING HOURS:
→ "شكراً لتواصلك! 🕐
   المتجر مغلق حالياً.
   ساعات العمل: {{WORKING_HOURS}}
   تقدر تضيف منتجات لسلتك وتطلب لما نفتح ✅"

UNRELATED QUESTIONS:
→ "أنا مساعد {{STORE_NAME}} للطلبات 🛒 أقدر أساعدك في:
   • طلب منتجات
   • تتبع طلب
   • معرفة الأسعار والعروض
   وش تبي تطلب؟"

═══════════════════════════════════════════
PROMOTIONS & OFFERS
═══════════════════════════════════════════

Functions:

20. get_active_promotions()
    → Returns: [{id, title_ar, title_en, type, discount, products[], valid_until}]

21. apply_promo_code(cart_id, code)
    → Returns: {valid, discount_amount, new_total, message}

PROMO TYPES:
- percentage: "خصم {{discount}}%"
- fixed: "خصم {{discount}} ر.س"
- buy_x_get_y: "اشتر {{x}} واحصل على {{y}} مجاناً"
- free_delivery: "توصيل مجاني"

When customer asks about offers:
→ Call get_active_promotions()
→ Display active offers with expiry dates
→ Auto-apply best available promotion at checkout

═══════════════════════════════════════════
ERROR HANDLING & EDGE CASES
═══════════════════════════════════════════

- System error → "عذراً، حصل خطأ تقني. حاول مرة ثانية أو تواصل مع المتجر: {{STORE_PHONE}}"
- Unclear message → "ما فهمت طلبك 😅 ممكن توضح أكثر؟"
- Voice message → "عذراً، ما أقدر أسمع الرسائل الصوتية 🎤 اكتب طلبك وبساعدك"
- Image (not product) → "شكراً على الصورة! بس أحتاج تكتب لي اسم المنتج اللي تبيه"
- Product image → Run through product recognition if available, or ask for product name
- Multiple orders same time → Handle each conversation independently by phone number
- Empty cart checkout → "سلتك فاضية 🛒 تبي تتصفح المنتجات؟"

═══════════════════════════════════════════
COMPLIANCE & REGULATIONS (SAUDI ARABIA)
═══════════════════════════════════════════

ZATCA VAT:
- All prices MUST include 15% VAT
- Display "شامل الضريبة" on every order summary
- VAT breakdown available on request
- Tax invoice reference number on confirmed orders

PDPL (Personal Data Protection Law):
- Never share customer data with third parties
- Customer can request data deletion
- Collect only necessary information (name, phone, address)
- No marketing messages without consent

FOOD SAFETY:
- Note expiry dates for perishables if available
- Cold chain items flagged with ❄️
- Allergen information displayed when available

═══════════════════════════════════════════
ANALYTICS EVENTS (LOG THESE)
═══════════════════════════════════════════

Log every interaction for store owner dashboard:
- conversation_started
- product_searched (query, results_count)
- product_added_to_cart (product_id, quantity)
- cart_abandoned (cart_value, last_active)
- order_placed (order_id, total, payment_method)
- order_cancelled (order_id, reason)
- customer_complaint (category, description)
- out_of_stock_hit (product_id, alternatives_shown)
- promo_applied (code, discount)
- delivery_completed (order_id, delivery_time_minutes)

═══════════════════════════════════════════
UPSELL & CROSS-SELL INTELLIGENCE
═══════════════════════════════════════════

After cart has 3+ items, suggest complementary products:
- Bread in cart → suggest butter, cheese, jam
- Meat in cart → suggest spices, rice, cooking oil
- Breakfast items → suggest eggs, juice, labneh
- Cleaning products → suggest trash bags, sponges

Format: "💡 عملاء كثير يطلبون [product] مع طلبك — تبي أضيفه؟ ([price] ر.س)"

Only suggest ONCE per session. Don't be pushy.

═══════════════════════════════════════════
REORDER & SUBSCRIPTION
═══════════════════════════════════════════

Functions:

22. create_recurring_order(customer_id, items[], frequency, delivery_day)
    → Returns: {subscription_id, next_delivery}

23. manage_subscription(subscription_id, action)
    → action: "pause" | "resume" | "cancel" | "modify"

Proactive reorder prompts (for returning customers):
- If 7+ days since last order for weekly buyers → 
  "مرحباً [name]! تبي تكرر طلبك المعتاد؟ 🛒"
- Allow setting weekly/biweekly/monthly auto-orders

PART 2: ARCHITECTURE BLUEPRINT
Tech Stack
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                       │
│                                                          │
│  WhatsApp Cloud API (Meta) ←→ Webhook (Express.js)       │
│  Store Owner Dashboard (React / Next.js)                 │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   APPLICATION LAYER                      │
│                                                          │
│  Node.js + Express.js API Server                         │
│  ├── Webhook Handler (POST /webhook)                     │
│  ├── Message Router (text/image/location/interactive)    │
│  ├── AI Engine (GPT-4o / Claude API)                     │
│  ├── Conversation State Manager (Redis)                  │
│  ├── Cart Service                                        │
│  ├── Order Service                                       │
│  ├── Payment Service (Moyasar / Tap)                     │
│  ├── Notification Service (order updates)                │
│  └── Analytics Service (event logging)                   │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                     DATA LAYER                           │
│                                                          │
│  PostgreSQL (primary database)                           │
│  Redis (sessions, cart cache, rate limiting)              │
│  S3/Cloudflare R2 (product images)                       │
└─────────────────────────────────────────────────────────┘

Message Processing Pipeline
WhatsApp Message In
    │
    ├─ 1. Webhook receives POST from Meta
    ├─ 2. Validate signature (x-hub-signature-256)
    ├─ 3. Extract: phone, message_type, content, timestamp
    ├─ 4. Rate limit check (Redis: 30 msg/min per user)
    ├─ 5. Load/create customer profile (PostgreSQL)
    ├─ 6. Load conversation context (Redis, last 20 messages)
    ├─ 7. Build AI prompt: system + store_config + catalog_context + history + user_message
    ├─ 8. Call AI with function definitions (GPT-4o)
    ├─ 9. Parse AI response → extract function calls
    ├─ 10. Execute functions (search, cart, order, etc.)
    ├─ 11. Return function results to AI for final response
    ├─ 12. Send WhatsApp message(s) back via Cloud API
    ├─ 13. Log analytics event
    └─ 14. Update conversation context in Redis

PART 3: DATABASE SCHEMA
-- Multi-tenant: one database, store_id on every table

CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    whatsapp_phone_id VARCHAR(50),  -- Meta phone number ID
    whatsapp_token TEXT,            -- Encrypted access token
    city VARCHAR(100),
    working_hours JSONB,            -- {"sat-thu": "8:00-23:00", "fri": "14:00-23:00"}
    delivery_zones JSONB,           -- [{name, name_ar, fee, min_order, coordinates}]
    delivery_fee DECIMAL(10,2) DEFAULT 10.00,
    free_delivery_above DECIMAL(10,2) DEFAULT 150.00,
    min_order DECIMAL(10,2) DEFAULT 30.00,
    payment_methods TEXT[] DEFAULT ARRAY['cod'],
    vat_rate DECIMAL(4,2) DEFAULT 0.15,
    subscription_plan VARCHAR(50) DEFAULT 'basic', -- basic/pro/enterprise
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id),
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description_ar TEXT,
    description_en TEXT,
    price DECIMAL(10,2) NOT NULL,       -- VAT inclusive
    unit VARCHAR(50) NOT NULL,          -- kg, piece, pack, liter
    sku VARCHAR(100),
    barcode VARCHAR(50),
    image_url TEXT,
    in_stock BOOLEAN DEFAULT true,
    stock_qty INT,
    alternatives UUID[],                -- product IDs for substitutes
    tags TEXT[],                         -- for search: ["organic", "imported"]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_search ON products 
    USING GIN(to_tsvector('arabic', name_ar || ' ' || COALESCE(description_ar, '')));
CREATE INDEX idx_products_store ON products(store_id, is_active);

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    language VARCHAR(5) DEFAULT 'ar',
    addresses JSONB DEFAULT '[]',       -- [{label, address, zone, lat, lng, is_default}]
    preferences JSONB DEFAULT '{}',
    total_orders INT DEFAULT 0,
    total_spent DECIMAL(12,2) DEFAULT 0,
    last_order_at TIMESTAMPTZ,
    marketing_consent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, phone)
);

CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id),
    items JSONB DEFAULT '[]',           -- [{product_id, name, price, quantity, subtotal}]
    subtotal DECIMAL(10,2) DEFAULT 0,
    promo_code VARCHAR(50),
    discount DECIMAL(10,2) DEFAULT 0,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id),
    order_number SERIAL,                -- human-readable: #1001, #1002
    items JSONB NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    vat_amount DECIMAL(10,2) NOT NULL,
    delivery_fee DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    payment_method VARCHAR(30),
    payment_status VARCHAR(30) DEFAULT 'pending',
    payment_reference VARCHAR(255),
    delivery_address JSONB,
    delivery_slot JSONB,
    estimated_delivery TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    notes TEXT,
    cancelled_reason TEXT,
    zatca_invoice_ref VARCHAR(100),     -- ZATCA e-invoice reference
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(store_id, status);

CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    code VARCHAR(50),
    title_ar VARCHAR(255),
    title_en VARCHAR(255),
    type VARCHAR(30),                   -- percentage, fixed, buy_x_get_y, free_delivery
    discount_value DECIMAL(10,2),
    min_order DECIMAL(10,2),
    product_ids UUID[],                 -- null = all products
    max_uses INT,
    used_count INT DEFAULT 0,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id),
    messages JSONB DEFAULT '[]',        -- [{role, content, timestamp, function_calls}]
    state VARCHAR(50) DEFAULT 'idle',   -- idle, browsing, cart, checkout, tracking
    metadata JSONB DEFAULT '{}',
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_store_time ON analytics_events(store_id, created_at DESC);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id),
    items JSONB NOT NULL,
    frequency VARCHAR(20),              -- weekly, biweekly, monthly
    delivery_day VARCHAR(10),           -- saturday, sunday, etc
    next_delivery TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

PART 4: KEY API ENDPOINTS
POST   /webhook                    ← Meta WhatsApp webhook (incoming messages)
GET    /webhook                    ← Meta webhook verification

# Store Owner Dashboard APIs
POST   /api/auth/login             ← Store owner login
GET    /api/stores/:id/dashboard   ← Dashboard stats
GET    /api/stores/:id/orders      ← Order management
PATCH  /api/stores/:id/orders/:oid ← Update order status
GET    /api/stores/:id/products    ← Product catalog CRUD
POST   /api/stores/:id/products    
PUT    /api/stores/:id/products/:pid
DELETE /api/stores/:id/products/:pid
POST   /api/stores/:id/products/bulk-import  ← CSV/Excel import
GET    /api/stores/:id/analytics   ← Analytics dashboard
GET    /api/stores/:id/customers   ← Customer list
POST   /api/stores/:id/promotions  ← Create promotion
POST   /api/stores/:id/broadcast   ← Send marketing message

# Payment webhooks
POST   /api/payments/moyasar/webhook  ← Moyasar payment callbacks
POST   /api/payments/tap/webhook      ← Tap payment callbacks

# Super Admin (your agency)
POST   /api/admin/stores           ← Onboard new store
GET    /api/admin/stores           ← List all client stores
GET    /api/admin/billing          ← Subscription billing

PART 5: CONVERSATION STATE MACHINE
                    ┌──────────┐
                    │   IDLE   │
                    └────┬─────┘
                         │ customer sends message
                    ┌────▼─────┐
          ┌────────►│ GREETING │◄─────────┐
          │         └────┬─────┘          │
          │              │                │
     ┌────┴────┐    ┌────▼─────┐    ┌─────┴────┐
     │TRACKING │    │ BROWSING │    │  SUPPORT  │
     └────┬────┘    └────┬─────┘    └──────────┘
          │              │ add to cart
          │         ┌────▼─────┐
          │         │   CART   │
          │         └────┬─────┘
          │              │ confirm
          │         ┌────▼─────┐
          │         │ CHECKOUT │
          │         │ (address)│
          │         └────┬─────┘
          │              │
          │         ┌────▼─────┐
          │         │ PAYMENT  │
          │         └────┬─────┘
          │              │ success
          │         ┌────▼─────┐
          └────────►│ CONFIRMED│
                    └──────────┘

PART 6: STORE OWNER DASHBOARD FEATURES
The dashboard you build and give to store owners should include:

Real-Time
Live orders feed (new, preparing, delivering)
Online/offline toggle for the bot
Quick product stock toggle (in/out of stock)
Order Management
View, accept, reject, and update orders
Assign delivery driver
Print order receipt
Cancel and refund
Product Management
Add/edit/delete products (Arabic + English)
Bulk import via CSV/Excel
Category management
Set prices, stock status, alternatives
Product images upload
Analytics Dashboard
Daily/weekly/monthly revenue
Top-selling products
Order volume trends
Cart abandonment rate
Average order value
Customer retention rate
Peak ordering hours
Out-of-stock impact (lost revenue)
Customer Management
Customer list with order history
Customer lifetime value
Segmentation (new, regular, VIP)
Marketing consent status
Settings
Working hours
Delivery zones & fees
Payment methods
Bot personality/greeting customization
Notification preferences (SMS, WhatsApp, email)
PART 7: SALES & PRICING GUIDE
How to Sell This to Grocery Owners
Pitch: "Your customers already use WhatsApp. Let them order groceries through it — 24/7, no app download needed, no commission like Nana/HungerStation."

Pricing Tiers (SAR/month)
Feature	Basic (999)	Pro (1,999)	Enterprise (3,499)
WhatsApp Bot	✅	✅	✅
Products	Up to 200	Up to 1,000	Unlimited
Orders/month	Up to 500	Up to 2,000	Unlimited
Owner Dashboard	Basic	Full	Full + API
Payment Gateway	COD only	COD + Online	All methods
Analytics	Basic stats	Full analytics	Custom reports
Delivery Zones	3	10	Unlimited
Promotions	❌	✅	✅
Auto-reorder	❌	❌	✅
Multi-branch	❌	❌	✅
Support	WhatsApp	Priority	Dedicated
Setup Fee	499	999	1,999
ROI Story for Store Owners
Without Bot:
- 2 employees handling phone orders = 8,000 SAR/month salary
- Missed calls during busy hours = ~30% lost orders
- No data on customer behavior
- Limited to working hours

With Bot:
- 24/7 automated ordering
- Zero missed orders
- Full customer analytics
- Upsell/cross-sell automation
- Average 25% increase in order volume
- ROI in first month

Onboarding Checklist (for each new client)
□ Collect store information (name, logo, hours, zones)
□ Get product catalog (Excel/CSV or manual entry)
□ Set up Meta Business Account + WhatsApp Business API
□ Configure payment gateway (Moyasar/Tap)
□ Upload products with Arabic names and prices
□ Test full order flow
□ Train store owner on dashboard
□ Go live + monitor first 48 hours
□ Weekly check-in for first month

PART 8: DEPLOYMENT CHECKLIST
□ Server: Railway / DigitalOcean / AWS (Riyadh region)
□ Domain: SSL certificate configured
□ Database: PostgreSQL with daily backups
□ Redis: Configured with persistence
□ Meta: WhatsApp Business API approved
□ Payment: Moyasar/Tap production credentials
□ Monitoring: Sentry for error tracking
□ Uptime: UptimeRobot or Better Uptime
□ Rate Limiting: 30 msgs/min per user, 1000/min global
□ Logging: Structured logs with Winston/Pino
□ Security: Helmet.js, CORS, input sanitization
□ PDPL: Data retention policy, deletion endpoints
□ ZATCA: VAT calculation verified, invoice format ready
□ Load Testing: Tested with 100 concurrent conversations
□ Failover: Graceful degradation if AI API is down
□ Backup Bot: Rule-based fallback if LLM fails

PART 9: ENVIRONMENT VARIABLES
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@host:5432/smartorder
REDIS_URL=redis://host:6379

# Meta WhatsApp
META_VERIFY_TOKEN=your_verify_token
META_APP_SECRET=your_app_secret
# Per-store tokens stored in database, encrypted

# AI
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-4o
AI_MAX_TOKENS=1000
AI_TEMPERATURE=0.3

# Payment  
MOYASAR_API_KEY=sk_...
MOYASAR_PUBLISHABLE_KEY=pk_...

# Storage
S3_BUCKET=smartorder-media
S3_REGION=me-south-1

# Security
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key_for_tokens

# Monitoring
SENTRY_DSN=https://...

Built for the Saudi market. ZATCA compliant. PDPL compliant. Production-ready.
SmartOrder — by [Your Agency Name]