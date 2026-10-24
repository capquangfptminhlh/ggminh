-- Administrative billing records for the LHM Ads Browser license portal.
-- Do not store plaintext activation tokens or banking credentials.
CREATE TABLE IF NOT EXISTS portal_orders (
  order_id TEXT PRIMARY KEY NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('new','renew')),
  plan TEXT NOT NULL CHECK(plan IN ('starter')),
  months INTEGER NOT NULL CHECK(months IN (1,3,6,12)),
  amount_vnd INTEGER NOT NULL CHECK(amount_vnd >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','issued','canceled')),
  payment_ref TEXT UNIQUE,
  license_id TEXT,
  expires_at TEXT,
  token_iv TEXT,
  token_ciphertext TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  issued_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_portal_orders_created ON portal_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_orders_customer ON portal_orders(customer_email,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_orders_license ON portal_orders(license_id);
