-- LHM Ads Browser authority state. Never store license tokens or keys in D1.
-- Installation IDs are pseudonymous licensing identifiers, not Google cookies.
CREATE TABLE IF NOT EXISTS licenses (
  license_id TEXT PRIMARY KEY NOT NULL,
  installation_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  enforcement_mode TEXT NOT NULL CHECK(enforcement_mode IN ('strict','owner_sweep')),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lhm_license_expiring
  ON licenses(enforcement_mode, revoked, expires_at);
