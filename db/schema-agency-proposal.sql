-- Agency compliance schema proposal ONLY. Not activated in v5.8 Preview.
-- Compatible with SQLite 3.37+. Never store PAN, CVV, raw card BIN or secrets.
PRAGMA foreign_keys = ON;
BEGIN;
CREATE TABLE IF NOT EXISTS agency_profile_approvals (
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL CHECK(length(profile_id) BETWEEN 1 AND 64),
 approval_type TEXT NOT NULL CHECK(approval_type IN (
  'POLICY_REVIEWED','BILLING_AUTHORIZED','OWNER_APPROVED',
  'CAMPAIGN_REVIEWED','NETWORK_CHECKED')),
 actor_id TEXT NOT NULL,
 approved_at_ms INTEGER NOT NULL,
 revoked_at_ms INTEGER,
 revoked_by TEXT,
 CHECK (revoked_at_ms IS NULL OR revoked_at_ms >= approved_at_ms)
);
CREATE INDEX IF NOT EXISTS ix_agency_approval_profile
 ON agency_profile_approvals(profile_id,approval_type,approved_at_ms);
-- /24 network concentration is a *local* resource-scheduling concern.
-- Records may only be created with operator authorization and expire in 30 days.
CREATE TABLE IF NOT EXISTS agency_network_sessions (
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL,
 ip_subnet_24 TEXT NOT NULL,
 started_at_ms INTEGER NOT NULL,
 ended_at_ms INTEGER,
 recorded_at_ms INTEGER NOT NULL,
 CHECK (ended_at_ms IS NULL OR ended_at_ms > started_at_ms)
);
CREATE INDEX IF NOT EXISTS ix_agency_network_interval
 ON agency_network_sessions(ip_subnet_24,started_at_ms,ended_at_ms);
CREATE TABLE IF NOT EXISTS agency_billing_provider_refs (
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL,
 provider_name TEXT NOT NULL,
 reference_hmac_sha256 TEXT NOT NULL CHECK (length(reference_hmac_sha256) = 64),
 recorded_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_agency_billing_reference
 ON agency_billing_provider_refs(reference_hmac_sha256);
COMMIT;
-- Retention operations, key rotation, transactions and migration rollback
-- MUST be implemented and tested before enabling this schema in a release.
