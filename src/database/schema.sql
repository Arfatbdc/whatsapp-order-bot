-- SmartOrder WhatsApp Bot — Full Database Schema
-- Multi-tenant: store_id on every table

-- ═══════════════════════════════════════════
-- EXTENSIONS
-- ═══════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════
-- STORES
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    whatsapp_phone_id VARCHAR(50),
    whatsapp_token TEXT,
    city VARCHAR(100),
    working_hours JSONB DEFAULT '{"sat-thu": "08:00-23:00", "fri": "14:00-23:00"}',
    delivery_zones JSONB DEFAULT '[]',
    delivery_fee DECIMAL(10,2) DEFAULT 10.00,
    free_delivery_above DECIMAL(10,2) DEFAULT 150.00,
    min_order DECIMAL(10,2) DEFAULT 30.00,
    payment_methods TEXT[] DEFAULT ARRAY['cod'],
    vat_rate DECIMAL(4,2) DEFAULT 0.15,
    subscription_plan VARCHAR(50) DEFAULT 'basic',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(whatsapp_phone_id)
);

CREATE INDEX IF NOT EXISTS idx_stores_phone_id ON stores(whatsapp_phone_id) WHERE whatsapp_phone_id IS NOT NULL;

-- ═══════════════════════════════════════════
-- CATEGORIES
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_store ON categories(store_id, sort_order);

-- ═══════════════════════════════════════════
-- PRODUCTS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description_ar TEXT,
    description_en TEXT,
    price DECIMAL(10,2) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    sku VARCHAR(100),
    barcode VARCHAR(50),
    image_url TEXT,
    in_stock BOOLEAN DEFAULT true,
    stock_qty INT,
    alternatives UUID[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_search ON products
    USING GIN(to_tsvector('simple', name_ar || ' ' || COALESCE(name_en, '') || ' ' || COALESCE(description_ar, '')));

-- ═══════════════════════════════════════════
-- CUSTOMERS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    language VARCHAR(5) DEFAULT 'ar',
    addresses JSONB DEFAULT '[]',
    preferences JSONB DEFAULT '{}',
    total_orders INT DEFAULT 0,
    total_spent DECIMAL(12,2) DEFAULT 0,
    last_order_at TIMESTAMPTZ,
    marketing_consent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ═══════════════════════════════════════════
-- CARTS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    items JSONB DEFAULT '[]',
    subtotal DECIMAL(10,2) DEFAULT 0,
    promo_code VARCHAR(50),
    discount DECIMAL(10,2) DEFAULT 0,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carts_customer ON carts(customer_id);

-- ═══════════════════════════════════════════
-- ORDERS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id),
    order_number SERIAL,
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
    zatca_invoice_ref VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(store_id, order_number);

-- ═══════════════════════════════════════════
-- PROMOTIONS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    code VARCHAR(50),
    title_ar VARCHAR(255),
    title_en VARCHAR(255),
    type VARCHAR(30) NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    min_order DECIMAL(10,2),
    product_ids UUID[],
    max_uses INT,
    used_count INT DEFAULT 0,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_store ON promotions(store_id, is_active);

-- ═══════════════════════════════════════════
-- CONVERSATIONS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    messages JSONB DEFAULT '[]',
    state VARCHAR(50) DEFAULT 'idle',
    metadata JSONB DEFAULT '{}',
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);

-- ═══════════════════════════════════════════
-- ANALYTICS EVENTS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_store_time ON analytics_events(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(store_id, event_type);

-- ═══════════════════════════════════════════
-- SUBSCRIPTIONS (RECURRING ORDERS)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    items JSONB NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    delivery_day VARCHAR(10),
    next_delivery TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next ON subscriptions(next_delivery) WHERE status = 'active';

-- ═══════════════════════════════════════════
-- STORE OWNERS (Dashboard Login)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS store_owners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'owner',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_store_owners_store ON store_owners(store_id);
CREATE INDEX IF NOT EXISTS idx_store_owners_email ON store_owners(email);

-- ═══════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['stores', 'products', 'customers', 'carts', 'orders', 'store_owners'])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trigger_updated_at ON %I;
            CREATE TRIGGER trigger_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t);
    END LOOP;
END;
$$;
