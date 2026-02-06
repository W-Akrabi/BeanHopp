-- BeanHop Database Schema for Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Shops table
CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    address TEXT NOT NULL,
    city TEXT DEFAULT 'Toronto',
    latitude DECIMAL,
    longitude DECIMAL,
    phone TEXT,
    email TEXT,
    hours JSONB,
    is_active BOOLEAN DEFAULT true,
    rating DECIMAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    loyalty_multiplier DECIMAL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    base_price DECIMAL NOT NULL,
    image_url TEXT,
    customization_options JSONB,
    is_available BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number TEXT UNIQUE,
    user_id TEXT NOT NULL,
    shop_id TEXT REFERENCES shops(id),
    shop_name TEXT,
    items JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    subtotal DECIMAL NOT NULL,
    tax DECIMAL DEFAULT 0,
    discount DECIMAL DEFAULT 0,
    total DECIMAL NOT NULL,
    pickup_time TEXT,
    special_instructions TEXT,
    stripe_payment_id TEXT,
    points_earned INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loyalty transactions table
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    shop_id TEXT REFERENCES shops(id),
    order_id TEXT REFERENCES orders(id),
    points_change INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User favorites table
CREATE TABLE IF NOT EXISTS user_favorites (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    user_id TEXT NOT NULL,
    shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, shop_id)
);

-- User streaks table
CREATE TABLE IF NOT EXISTS user_streaks (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    user_id TEXT UNIQUE NOT NULL,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_purchase_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    user_id TEXT NOT NULL,
    shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES orders(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    balance DECIMAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount DECIMAL NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    payment_intent_id TEXT,
    order_id TEXT REFERENCES orders(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_menu_items_shop_id ON menu_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_loyalty_user_id ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_payment_intent_id
ON wallet_transactions(payment_intent_id)
WHERE payment_intent_id IS NOT NULL;

-- Enable Row Level Security (RLS)
-- ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Wallet policies (safe to re-run)
DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
CREATE POLICY "wallets_select_own"
ON wallets
FOR SELECT
TO authenticated
USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
CREATE POLICY "wallets_insert_own"
ON wallets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
CREATE POLICY "wallets_update_own"
ON wallets
FOR UPDATE
TO authenticated
USING (auth.uid()::TEXT = user_id)
WITH CHECK (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "wallet_tx_select_own" ON wallet_transactions;
CREATE POLICY "wallet_tx_select_own"
ON wallet_transactions
FOR SELECT
TO authenticated
USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "wallet_tx_insert_own" ON wallet_transactions;
CREATE POLICY "wallet_tx_insert_own"
ON wallet_transactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::TEXT = user_id);
