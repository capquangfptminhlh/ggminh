-- Server-side revocation for Google web sessions. Existing HMAC cookies
-- cannot be trusted after logout without an active session database row.
-- Staging-only additive migration; never apply to production legacy D1.
CREATE TABLE IF NOT EXISTS google_web_sessions_v2 (
 session_id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers_v2(customer_id),
 created_at_ms INTEGER NOT NULL,
 expires_at_ms INTEGER NOT NULL,
 revoked_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_google_web_sessions_v2_customer
 ON google_web_sessions_v2(customer_id,expires_at_ms);
