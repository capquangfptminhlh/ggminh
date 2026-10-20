# Team + encrypted metadata sync groundwork

**Status: foundation only, NOT functional Cloud Sync or Team login.**

This branch adds isolated primitives that can be wired into an authorized
backend once identity, hosting, billing and device policies are chosen.

## Team policy
- `src/team/policy.js` implements server-side style RBAC checks for
  owner/admin/operator/viewer, explicit workspace tenant ID, group scopes,
  and profile existence. Never infer tenant/actor identity from UI input.
- Invitations use random one-time secrets. Only SHA-256 digests are stored.
  A verified email from the identity provider must match invitation email.
  Invitations expire within 1–168 hours, can be revoked and are rechecked
  against the inviter's current rights upon redemption.
- In-memory state is **not durable authentication**: no identity provider,
  session issuer, MFA, remote permission store or security-hardened audit
  deployment is included.
- Future backend must validate trusted identity and authorization for every
  request, and persist invites, tenant identities and audit events
  transactionally with unique constraints and rate limits.

## Encrypted metadata sync format
- `src/sync/encryptedMetadata.js` strictly whitelists `id,name,group,engine,tags`.
  Browser data, URL parameters, sessions, credentials, fingerprints and
  notes are intentionally excluded. Users must opt in to metadata sync.
- Payload is client encrypted with AES-256-GCM and `scrypt`-derived keys,
  random 16-byte salt and 12-byte IV. Tenant, device and revision are
  authenticated associated data.
- `RevisionGuard` is **an in-memory test fixture**, not a remote/cloud server.
  It demonstrates version-based compare-and-swap conflict rejection.
- Clients should use independent authenticated HTTPS sessions to a deployed
  tenant-isolated backend and ensure the backend performs atomic CAS writes.
  Do not use GitHub, repository commits or application logs as profile storage.
- Passphrase recovery and rotation, multi-device key exchange, offline queue,
  object retention, tenant-specific encryption policy and device revocation
  must be delivered before production deployment.
- Neither module transmits data to any remote endpoint.

## Acceptance before changing feature parity status
1. Real multi-user authentication with revoked sessions and strict tenant RLS.
2. Remote invite issuance, one-use redemption, audit and MFA tests.
3. Deploy encrypted sync service with atomic revisions and backups.
4. Two separately authenticated real machines sync profile metadata.
5. Concurrent writes trigger explicit user-visible conflict resolution.
6. Verify encryption, wrong keys, tampering, revocation and restore.
7. Packaged Windows app integration and permission UX.
8. Independent threat modeling and end-to-end penetration tests.

Run `node test/team-cloud-foundations.js` for foundation tests.
