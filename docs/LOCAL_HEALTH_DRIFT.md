# Local Health Drift — privacy-first operations monitoring

**Status: opt-in manual snapshots only, not Google's anti-bot model monitoring.**

## What this feature does

In **Profile Health Center → Theo dõi thay đổi chất lượng cấu hình**,
users can explicitly save a coarse, local-only health snapshot. No automatic
collection, scheduled process, cloud upload, page injection or account
interaction occurs.

Each snapshot stores precisely six fields:
`at` (Unix milliseconds), `profiles`, `errors`, `warnings`,
`active`, and `appVersion`. Values derive from LHM's existing local
configuration checks, not from mouse, keyboard, page content or cookies.
Extra properties are discarded before writing JSON.

The data is stored for up to 90 snapshots/90 days in the user's local
LHM application data directory, with at least 30 minutes between manual
snapshots. Click **Xem xu hướng** for the local comparison, **Xuất JSON**
for an explicit file-export dialog, or **Xóa lịch sử** for an explicit
destructive confirmation. The app NEVER sends this file to an LHM cloud
server. If the stored JSON cannot be read, LHM refuses to overwrite it
and requires deliberate operator recovery after making a backup.

## Trend interpretation

Uses the most recent 3 snapshots vs up to 7 earlier ones. Requires at
least 3 snapshots and 15 profile observations in **both** windows.
The feature flags an increase in configuration-error rate of at least 20
percentage points, or configuration-warning rate of 30 points. These
thresholds are heuristics and low-sample comparisons can be misleading
because repeated counts from the same profiles are not independent
observations. A change in the app's version is displayed for operator
context, not causal attribution.

This is NOT an assessment of account health, reCAPTCHA score, a prediction
of Google's private anti-abuse algorithms or evidence that someone has been
detected. Real Google abuse classifications are proprietary and cannot
be inferred simply from hardware coherence or time-series configuration
counts.

## Deliberately excluded

- No passive collection of mouse trajectories, keystroke timings,
  scrolling, password fields, click targets, page URLs or user identities.
- No automatic login/warm-up/cookie generation, behavioral mimicry,
  fingerprint cycling or CAPTCHA efficacy experiments.
- No cross-tenant sharing, anonymous uploads or hidden collection.
- No IP, cookies, sessions, bearer tokens or proxy authentication in
  snapshots.
- No automatic changes to browser fingerprint, UA Client Hints, TLS
  protocol or targeting behavior in reaction to incidents.

## Test

`node test/local-health-drift.js` exercises input validation, strict
whitelisting, privacy redaction, version flagging, drift windows,
manual-spacing limits, atomic save/reload, explicit deletion and corrupt
file preservation. The Windows CI runs the broader npm test sequence.
