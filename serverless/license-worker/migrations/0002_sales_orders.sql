-- Administrative customer/order/payment ledger for LHM Ads Browser licensing.
-- D1 is authoritative for the WEB order flow; never store raw signed tokens,
-- signing private keys, Google cookies or card/bank credentials.
CREATE TABLE IF NOT EXISTS sales_customers(
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sales_orders(
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL REFERENCES sales_customers(id),
  kind TEXT NOT NULL CHECK(kind IN ('new','renew')),
  prior_license_id TEXT,
  installation_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('starter','pro','business')),
  months INTEGER NOT NULL CHECK(months BETWEEN 1 AND 12),
  max_profiles INTEGER NOT NULL CHECK(max_profiles BETWEEN 1 AND 10000),
  features_json TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK(amount_vnd > 0),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paid','fulfilled')),
  payment_reference TEXT UNIQUE,
  paid_at INTEGER,
  license_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sales_orders_by_date ON sales_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS sales_orders_customer ON sales_orders(customer_id, created_at DESC);
CREATE TABLE IF NOT EXISTS sales_issued_keys(
  license_id TEXT PRIMARY KEY NOT NULL REFERENCES licenses(license_id),
  order_id TEXT UNIQUE NOT NULL REFERENCES sales_orders(id),
  customer_id TEXT NOT NULL REFERENCES sales_customers(id),
  claims_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
