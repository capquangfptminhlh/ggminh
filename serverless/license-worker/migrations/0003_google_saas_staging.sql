-- Browser Google SaaS commercial control plane. ADDITIVE; legacy licenses unaffected.
-- Apply ONLY to an isolated staging D1 (BROWSER_SAAS_DB) until approved.
CREATE TABLE IF NOT EXISTS customers_v2 (
 customer_id TEXT PRIMARY KEY NOT NULL,
 google_sub TEXT NOT NULL UNIQUE,
 email TEXT NOT NULL,
 display_name TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
 created_at_ms INTEGER NOT NULL,
 updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plans_v2 (
 plan_code TEXT PRIMARY KEY NOT NULL,
 product_code TEXT NOT NULL CHECK (product_code = 'ads-browser'),
 label TEXT NOT NULL,
 price_vnd INTEGER NOT NULL CHECK (price_vnd > 0),
 duration_days INTEGER NOT NULL CHECK (duration_days > 0),
 seat_limit INTEGER NOT NULL CHECK (seat_limit BETWEEN 1 AND 50),
 max_profiles INTEGER CHECK (max_profiles BETWEEN 1 AND 10000),
 features_json TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
 CHECK (enabled = 0 OR max_profiles IS NOT NULL)
);
-- The owner has NOT approved max_profiles, so no plan may be purchased yet.
INSERT OR IGNORE INTO plans_v2
 (plan_code,product_code,label,price_vnd,duration_days,seat_limit,max_profiles,features_json,enabled)
 VALUES ('personal_30','ads-browser','Personal 30 ngày',499000,30,2,NULL,'["api","automation","profiles"]',0);
CREATE TABLE IF NOT EXISTS orders_v2 (
 order_id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers_v2(customer_id),
 product_code TEXT NOT NULL CHECK (product_code='ads-browser'),
 plan_code TEXT NOT NULL,
 amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
 duration_days INTEGER NOT NULL CHECK (duration_days > 0),
 seat_limit INTEGER NOT NULL CHECK (seat_limit BETWEEN 1 AND 50),
 max_profiles INTEGER NOT NULL CHECK (max_profiles BETWEEN 1 AND 10000),
 features_json TEXT NOT NULL,
 payment_code TEXT NOT NULL UNIQUE,
 payment_ref TEXT UNIQUE,
 approval_nonce TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','canceled')),
 created_at_ms INTEGER NOT NULL,
 expires_at_ms INTEGER NOT NULL,
 approved_at_ms INTEGER,
 approved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_v2_customer ON orders_v2(customer_id,created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_orders_v2_pending ON orders_v2(status,created_at_ms DESC);
CREATE TABLE IF NOT EXISTS entitlements_v2 (
 customer_id TEXT NOT NULL REFERENCES customers_v2(customer_id),
 product_code TEXT NOT NULL CHECK (product_code='ads-browser'),
 plan_code TEXT NOT NULL,
 max_profiles INTEGER NOT NULL,
 seat_limit INTEGER NOT NULL,
 features_json TEXT NOT NULL,
 activated_at_ms INTEGER NOT NULL,
 expires_at_ms INTEGER NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1)),
 PRIMARY KEY(customer_id,product_code)
);
CREATE TABLE IF NOT EXISTS license_seats_v2 (
 seat_id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL,
 product_code TEXT NOT NULL CHECK (product_code='ads-browser'),
 client_hash TEXT NOT NULL,
 label TEXT NOT NULL,
 heartbeat_at_ms INTEGER NOT NULL,
 expires_at_ms INTEGER NOT NULL,
 takeover_nonce TEXT,
 UNIQUE(customer_id,product_code,client_hash)
);
CREATE INDEX IF NOT EXISTS idx_seats_v2_customer ON license_seats_v2(customer_id,product_code);
CREATE TABLE IF NOT EXISTS desktop_pairings_v2 (
 pairing_id TEXT PRIMARY KEY NOT NULL,
 verifier_hash TEXT NOT NULL,
 comparison_code_hash TEXT NOT NULL,
 client_hash TEXT NOT NULL,
 label TEXT NOT NULL,
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 claim_nonce TEXT,
 customer_id TEXT,
 status TEXT NOT NULL CHECK (status IN ('pending','approved','claimed','expired')),
 created_at_ms INTEGER NOT NULL,
 expires_at_ms INTEGER NOT NULL
);
-- Store only a keyed digest of the trusted Cloudflare edge IP. Limit anonymous
-- pairing floods without persisting raw IPs, client passwords, or cookies.
CREATE TABLE IF NOT EXISTS desktop_pair_limits_v2 (
 scope_hash TEXT NOT NULL,
 interval_10m INTEGER NOT NULL,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 20),
 PRIMARY KEY(scope_hash,interval_10m)
);
CREATE TABLE IF NOT EXISTS desktop_grants_v2 (
 grant_id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL,
 client_hash TEXT NOT NULL,
 grant_secret_hash TEXT NOT NULL UNIQUE,
 revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1)),
 created_at_ms INTEGER NOT NULL,
 UNIQUE(customer_id,client_hash)
);
CREATE TABLE IF NOT EXISTS payment_reviews_v2 (
 review_id TEXT PRIMARY KEY NOT NULL,
 order_id TEXT NOT NULL UNIQUE REFERENCES orders_v2(order_id),
 payment_ref TEXT NOT NULL UNIQUE,
 reviewed_by TEXT NOT NULL,
 reviewed_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events_v2 (
 event_id TEXT PRIMARY KEY NOT NULL,
 actor TEXT NOT NULL,
 action TEXT NOT NULL,
 object_id TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL
);
