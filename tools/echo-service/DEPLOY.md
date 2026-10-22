# Deploying the LHM echo endpoint

The runtime exit-IP observation in LHM Ads Browser is config-gated:
nothing is measured from the browser runtime until the owner sets
`settings.runtimeEchoUrl`. This guide deploys the reference service in
`tools/echo-service/echo-service.js` (a single dependency-free Node.js
file — the only file you need to copy) so that setting has an
LHM-operated endpoint to point at.

What the app will then do: each time a controller-driven Camoufox
profile starts, a page inside the profile fetches the URL, the service
answers with the address it saw, and the app records it labelled
`browser-runtime`. If the service is down or answers anything
unexpected, the app records **nothing** — a service outage degrades to
"not measured", never to wrong data and never to a blocked launch.

## You need

- One small VPS (1 vCPU / 1 GB is plenty; the service is stateless,
  in-memory rate counters only, no database).
- A domain/subdomain you control, e.g. `echo.example.com`, with an A
  record pointing at the VPS.
- Node.js LTS (≥ 18) on the VPS.

## Topology A (recommended): Caddy terminates TLS

Caddy gets a publicly trusted certificate automatically; the service
itself binds loopback only and never faces the internet directly.

1. Install Caddy (https://caddyserver.com/docs/install) and Node.js.
2. Copy `echo-service.js` to `/opt/lhm-echo/echo-service.js`.
3. systemd unit `/etc/systemd/system/lhm-echo.service`:

   ```ini
   [Unit]
   Description=LHM runtime egress echo
   After=network.target

   [Service]
   ExecStart=/usr/bin/node /opt/lhm-echo/echo-service.js
   Environment=ECHO_HOST=127.0.0.1
   Environment=ECHO_PORT=8443
   Environment=ECHO_ALLOW_HTTP=1
   Environment=ECHO_TRUST_PROXY=1
   Restart=on-failure
   User=nobody
   DynamicUser=yes

   [Install]
   WantedBy=multi-user.target
   ```

   `ECHO_ALLOW_HTTP=1` is safe **only** in exactly this shape: the
   plain-HTTP hop is loopback inside one host, between Caddy and the
   service. Never combine it with a public bind.
   `ECHO_TRUST_PROXY=1` is required here because the socket peer the
   service sees is Caddy itself. The proxy MUST replace inbound
   `X-Forwarded-For` with exactly one client IPv4 (not append). The
   Caddyfile above does so. Missing/invalid/multi-hop headers mean
   CHƯA ĐO, never a loopback address claimed as client egress. The echo
   service refuses trusted-proxy mode bound to a public interface.

4. Caddyfile:

   ```
   echo.example.com {
       reverse_proxy 127.0.0.1:8443 {
           header_up X-Forwarded-For {remote_host}
       }
   }
   ```

5. `systemctl enable --now lhm-echo caddy`
6. Verify from anywhere:

   ```
   curl -s https://echo.example.com/ip
   -> {"ip":"<your address>"}
   curl -sI https://echo.example.com/ip | grep -i -E 'cache-control|access-control'
   -> Cache-Control: no-store
   -> Access-Control-Allow-Origin: *
   ```

## Topology B: the service serves HTTPS directly

Use this without any reverse proxy. Issue a certificate with certbot
standalone (port 80 must be free during issuance/renewal):

```
certbot certonly --standalone -d echo.example.com
```

Environment for the service (drop the `ECHO_ALLOW_HTTP` and
`ECHO_TRUST_PROXY` lines from the unit above, bind publicly):

```
Environment=ECHO_HOST=0.0.0.0
Environment=ECHO_PORT=443
Environment=ECHO_TLS_CERT=/etc/letsencrypt/live/echo.example.com/fullchain.pem
Environment=ECHO_TLS_KEY=/etc/letsencrypt/live/echo.example.com/privkey.pem
```

Port 443 as a non-root user needs `AmbientCapabilities=CAP_NET_BIND_SERVICE`
in the unit (or run on 8443 and redirect 443→8443 in the firewall).
Renewal: add a certbot deploy hook that restarts the service
(`--deploy-hook "systemctl restart lhm-echo"`) — the service reads
the cert files only at startup.

An nginx variant of Topology A is equivalent: `listen 443 ssl` with
certbot-managed certs, `proxy_pass http://127.0.0.1:8443;` and
`proxy_set_header X-Forwarded-For $remote_addr;` (overwrite, NOT
`$proxy_add_x_forwarded_for`) — keep the service
environment identical to Topology A.

## Firewall

- Topology A: only 80 + 443 public (Caddy). The service port (8443)
  must NOT be reachable from the internet — loopback bind is enforced
  by the service when using trust-proxy or plain HTTP; do not expose it.
- Topology B: only 443 (plus 80 during certbot runs).

## Point the app at it

Set the app's setting `runtimeEchoUrl` (Settings store) to:

```
https://echo.example.com/ip
```

That is the only app-side step. An external endpoint MUST use HTTPS;
only loopback synthetic tests may use HTTP. URL credentials, query and
fragment are refused. Removing the value disables runtime observation
again (manager-process observations are unaffected).

## Logging and retention

- One line per request on stdout → journald:
  `time, observed address, method, path (no query string), status, ms`.
  No headers, no user agents, no cookies (the service never sets or
  reads any), no profile or account identifiers — the request carries
  none.
- Recommended retention: **at most 7 days**. With journald, cap it in
  `/etc/systemd/journald.conf` (`MaxRetentionSec=7day`) or forward to
  a logrotate-managed file with `rotate 7`. The logs' only jobs are
  spotting abuse and confirming the service is alive; they are not an
  audit trail and should not become one.
- `ECHO_LOG=off` disables request logging entirely if you prefer
  zero retention; the rate limiter still works (it is in-memory and
  never persisted).

## Tuning and health

- Rate limit defaults (60 requests / 60 s / source address) are far
  above legitimate use (one fetch per profile start). Raise
  `ECHO_RATE_MAX` only if many profiles behind one NAT start
  together; lower it if the endpoint is abused. Excess requests get
  `429` — the app treats that as "not measured", profiles still start.
- Health check: `curl -s https://echo.example.com/ip` from your
  monitoring; a `{"ip": ...}` body means healthy.
- The service holds no state worth backing up. Losing the VPS loses
  nothing but availability; redeploy is this document + one file.
