# Profile Signal Chain Preflight (experimental)

## Scope
This feature performs **offline configuration validation**, not anti-detection
or a promise of anonymity. The app currently runs users' installed Chrome,
Edge and Firefox. It does not bundle a patched Chromium, Rust/C++ fingerprint
engine, native GPU emulator, or UDP-over-SOCKS5.

The check runs before launching a profile and surfaces warnings through the
existing Health Check. It blocks objective contradictions and invalid
configuration, such as incompatible OS vs User-Agent/Client Hints, corrupt
screen dimensions, incompatible GPU vendor and renderer metadata, invalid
IANA timezone, or invalid language identifiers.

A custom fingerprint remains a legacy JavaScript-extension override.
The report always warns that this is not a native Chromium implementation
and does not prove anything about the browser's external detection score.

## Network boundary
For **proxied Chromium** profiles, launch arguments include:
- `--disable-quic` to avoid Chromium QUIC/HTTP3 UDP use
- `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` to request
  WebRTC avoid nonproxied UDP pathways

For **direct/no-proxy** profiles, these constraints are not applied.
A customized local SOCKS5 gateway currently supports authenticated **TCP
HTTPS CONNECT** only. It does **not** implement SOCKS5 UDP ASSOCIATE, and the
existence of these command line switches is not a packet-capture proof that
every browser/OS UDP path is blocked. Sites requiring UDP media, WebRTC or
HTTP/3 may be degraded in proxy mode. Enterprise policy and browser version
may alter effective behavior.

For a production claim about proxy integrity, verify both outbound IPv4/IPv6
and DNS routing plus real WebRTC ICE candidates and QUIC traffic using a
controlled test endpoint and OS-level packet capture for each supported
browser release. Disable/review if policy restrictions differ.

The profile checker never publishes an IP address to third parties and never
sends any saved session data to an external service. A release's current Chrome
version is determined from the real installed binary, not from old hardcoded
fingerprint presets. Existing legacy presets remain **unverified**.

## Limitations
- No native Chromium C++ patches, Camoufox fork, fake GPU manufacturer or
  synthetic human input model.
- No UDP SOCKS5 tunneling, WebRTC end-to-end IP-leak test or packet inspection.
- No guarantee that a website will or won't associate/identify a session.
- For CLI status, Health Check and the prelaunch validator share the same
  report; errors block launch, warnings require informed review.
- Seeds are generated as bounded integers in legacy custom profiles;
  JavaScript noise consistency is *not* validated at the rendering-engine level.

Technical references:
- Chromium WebRtcIPHandling policy:
  https://chromium.googlesource.com/chromium/src/+/376fc41e87a058f7a7b300b0ec3a4982b4ec0960/components/policy/resources/templates/policy_definitions/Miscellaneous/WebRtcIPHandling.yaml
- RFC 8828 https://www.rfc-editor.org/rfc/rfc8828.html
- Chrome Enterprise QUIC/WebRTC management:
  https://support.google.com/chrome/a/answer/2657289?hl=en-EN

## Verification
`node test/signal-chain.js` covers OS/UA/version mismatches, GPU and screen
contradictions, proxy warnings, prelaunch rejection, and proxied Chromium UDP
restriction switches. Windows CI separately validates real Chromium startup
and navigation.
