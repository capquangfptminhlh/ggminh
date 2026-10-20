# Cloud Sync / Team self-hosted MVP (experimental)

**Status:** Functional code and tests, but not production SaaS, and not
feature parity with AdsPower. The service is intentionally separate from
the customer's Electron application.

## Supported in this branch

- Standalone HTTPS service (Node 22, Express) using pre-provisioned,
  high-entropy personal bearer tokens with only SHA-256 token hashes stored
  in the server-only actor configuration.
- Persistent tenant and group-scoped Team roles and revocable memberships;
  owner/admin invitations, single-use invite secret with verified-email
  matching (the verified email must come from server-side trusted provisioning).
- Tenant-isolated encrypted metadata GET/PUT, server-side atomic revision
  compare-and-swap in a **single running server process**, and
  actor-attributed metadata-only audit history.
- Electron UI: manual encrypted upload, preview/decrypt on the local device,
  and explicitly confirmed local metadata import with a revision recheck.
- AES-256-GCM client-side encryption with scrypt key derivation. Whitelisted
  fields only: profile ID, name, group, browser engine and tags. Cookie,
  username, password, proxy credentials, session state, URL, private notes
  and fingerprint settings **never enter the sync payload**.
- Existing profiles preserve local credentials, sessions and private notes
  when metadata is imported; importing into a running profile is refused.
- No background automatic sync and no account-platform actions.

## Secure server provisioning

Requirements: Node.js 22+, HTTPS certificate and private key, host with
persistent private local disk. Deploy on a TLS-capable host under an HTTPS
domain and restrict access at the network perimeter.

Create a random **personal access token** out of band for each person.
For example, using a securely maintained host shell:

\`node -e "const c=require('crypto');const t=c.randomBytes(48).toString('base64url');console.log('TOKEN:',t);console.log('SHA256:',c.createHash('sha256').update(t).digest('hex'))"\`

The TOKEN is delivered privately to its owner. Only the **SHA256 hash**
is entered into a server-side actor file (never commit this file):

\`\`\`json
{
  "actors": [
    {
      "subjectId": "owner1",
      "verifiedEmail": "owner@example.com",
      "tokenHash": "<64 lowercase hexadecimal SHA-256 digest>"
    }
  ],
  "initialMemberships": [
    {
      "tenantId": "workspace1",
      "subjectId": "owner1",
      "role": "owner",
      "groups": ["*"],
      "status": "active"
    }
  ]
}
\`\`\`

The \`verifiedEmail\` is an administrator-verified identity binding, **not**
email verification done by this app. Do not provision a third party until
identity is verified. To accept an invitation, that identity must already
have its own trusted, server-provisioned token. At initial boot,
\`initialMemberships\` seeds the DB. Later starts use persisted state;
changing bootstrap memberships does not silently overwrite stored roles.

Set required environment variables securely (not in GitHub/public files):

- \`LHM_CLOUD_ACTORS_FILE\`: absolute path to the private JSON file above
- \`LHM_CLOUD_DATA_DIR\`: private, persistent directory
- \`LHM_CLOUD_TLS_CERT\`, \`LHM_CLOUD_TLS_KEY\`: readable TLS PEM files
- \`LHM_CLOUD_HOST\`: optional listen address, defaults to 127.0.0.1
- \`LHM_CLOUD_PORT\`: optional, defaults to 8443

Launch: \`npm run cloud:server\`

Do not expose the server publicly without appropriate network controls,
backup management, key lifecycle and platform security review.
TLS is mandatory in this standalone server. The browser app accepts only
bare HTTPS server origins (no HTTP, redirects, embedded credentials or query).

## UI flow

1. Open **Cloud Sync** from the desktop workspace toolbar.
2. Enter HTTPS origin, workspace ID, a unique device ID, your personal token
   and the shared encryption passphrase (at least 16 characters).
3. Choose **Đẩy metadata đã mã hóa** to upload from the local machine.
4. On a second machine, use **Xem bản Cloud** to preview the decrypted names.
5. Type \`APPLY CLOUD\`, confirm, and import metadata for stopped profiles.
   Browser login sessions do not migrate.
6. If the cloud revision changes between preview and import, restart preview.

The token and passphrase fields are cleared when closing the modal and
never written into the local profile DB by the app. Treat memory dump,
malware, screenshots and clipboard hygiene as separate operational risks.

## Known limitations / blockers to commercial release

- This is a **single-instance file persistence MVP**. CAS is safe only
  inside one Node process; multiple replicas, shared NFS volumes or cluster
  mode are unsupported. Use a transactional database before scaling.
- No external identity provider, user self-registration, passkeys or MFA.
  Personal tokens are manually provisioned by a trusted administrator.
- No automatic mail delivery, passphrase recovery, key rotation, device
  lifecycle registry or multi-device encrypted key exchange.
- No hosted public service has been deployed. Connected Supabase was
  INACTIVE when previously checked; this code does not reactivate it.
- Invitations and audit do not yet offer a complete UI. Team endpoints
  are for service operators and integration clients.
- No cookies/session sync, no live browser replication, no ads-platform
  unattended action, no full AdsPower parity.
- There is no cross-replica CAS or independent security review yet.
- Users must protect the private server actor configuration and shared
  encryption passphrase independently of the service.

## API

\`GET /health\` (unprivileged)
All other requests use \`Authorization: Bearer <PERSONAL_TOKEN>\`.

- \`GET /v1/workspaces/:tenantId/sync\`: fetch revision and encrypted envelope
- \`PUT /v1/workspaces/:tenantId/sync\`: submit
  \`{"expectedRevision":N,"envelope":{...}}\`; returns 409 on conflict
- \`GET /v1/workspaces/:tenantId/members\`: full-workspace admin listing
- \`POST /v1/workspaces/:tenantId/invites\`: create single-use invitation
- \`POST /v1/workspaces/:tenantId/invites/redeem\`: redeem as verified actor
- \`POST /v1/workspaces/:tenantId/invites/:inviteId/revoke\`: revoke invitation
- \`DELETE /v1/workspaces/:tenantId/members/:subjectId\`: revoke membership
- \`GET /v1/workspaces/:tenantId/audit\`: admin audit events

## Verification

\`npm test\` runs the cloud service HTTP end-to-end tests, cloud metadata
transaction tests, Team scope tests, as well as existing browser regression.
The HTTP end-to-end test uses 127.0.0.1 with *disposable fixture tokens*
and an injected HTTPS test client transport. Live deployment and
cross-device acceptance remain mandatory before a production release.
