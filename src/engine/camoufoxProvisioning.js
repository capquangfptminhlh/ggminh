'use strict';
/**
 * Camoufox identity provisioning (Constitution Section 8, contract C2).
 *
 * Generation is a PROVISIONING step that runs when a profile is created,
 * never at launch. It draws one internally consistent identity ONLY
 * through the official `camoufox` package (fpgen via launchOptions) —
 * the same mechanism as tools/generate-camoufox-identity.mjs — and
 * stores the resulting blob plus expectations on
 * `profile.fingerprint.identity`. The runtime afterwards only
 * validates/replays the blob (src/engine/camoufoxIdentity.js).
 *
 * Two honest failure modes, both surfaced (never silent):
 *  - 'unavailable': the official generator package is not installed, or
 *    no publisher-verified Camoufox executable is available yet (the
 *    official generator needs the real executable). Profile creation
 *    proceeds WITHOUT an identity — the previous behaviour — and the
 *    profile records fingerprint.identityProvisioning = 'unavailable'.
 *  - generated output that fails the repo's own validator is NEVER
 *    attached (status 'invalid'); a profile must not be bricked by a
 *    blob its launch path would reject.
 *  - generated output that CONTRADICTS the profile's own declared
 *    fields (the launch-time consistency gate,
 *    assertIdentityMatchesProfile) is likewise never attached
 *    (status 'invalid', reason
 *    'generated-identity-contradicts-profile'): provisioning must not
 *    hand the launch path an identity it is guaranteed to reject.
 *
 * Declared-field vocabulary follows the repo's canonical fingerprint
 * shape (src/engine/fingerprint.js): the primary locale is
 * `fingerprint.language` when present, otherwise the first entry of
 * the `fingerprint.languages` array; the timezone is
 * `fingerprint.timezone`. (Verified against a real run of the
 * official generator — test/camoufox-provisioning-real.js.)
 */
const { validateStoredIdentity, assertIdentityMatchesProfile } = require('./camoufoxIdentity');

function isCamoufoxNativeProfile(profile) {
  return !!profile && profile.engine === 'gecko' &&
    (profile.engine_type === 'camoufox' || profile.engineType === 'camoufox') &&
    (!profile.fingerprint || profile.fingerprint.mode === undefined ||
      profile.fingerprint.mode === 'native');
}

/**
 * Default generator: dynamic-imports the official `camoufox` package.
 * Kept behind a function so tests can inject a stub and so a missing
 * optional dependency is a reported status, not a crash.
 */
async function defaultGenerate({ executablePath, os, locale, timezone }) {
  let mod;
  try { mod = await import('camoufox'); }
  catch (_) {
    const err = new Error('official camoufox generator package is not installed');
    err.code = 'GENERATOR_UNAVAILABLE';
    throw err;
  }
  const options = {
    os, executable_path: executablePath,
    exclude_addons: ['UBO'], i_know_what_im_doing: true,
  };
  if (locale) options.locale = locale;
  if (timezone) options.config = { timezone };
  const launch = await mod.launchOptions(options);
  const env = {};
  for (const key of Object.keys(launch.env || {}).sort()) {
    if (/^CAMOU_CONFIG_\d+$/.test(key)) env[key] = launch.env[key];
  }
  if (!Object.keys(env).length) throw Error('Official launcher returned no CAMOU_CONFIG chunks');
  const { parseCamouConfigEnv, summarizeIdentity } = require('./camoufoxIdentity');
  const config = parseCamouConfigEnv(env);
  const expectations = summarizeIdentity(config);
  let version = 'unknown';
  try { version = require('camoufox/package.json').version; } catch (_) { /* recorded as unknown */ }
  return {
    format: 'camoufox-camou-config', version: 1,
    generator: 'camoufox@' + version,
    generatedAt: new Date().toISOString(),
    constraints: { os, locale: locale || null, timezone: timezone || null },
    env, expectations,
  };
}

/**
 * Attempt to provision an identity onto a profile object (mutates and
 * returns a status report; the caller decides whether to persist).
 * deps: { resolveExecutable: () => absolute path (throws when no
 * verified engine), generate: async (args) => stored identity }
 */
async function provisionCamoufoxIdentity(profile, deps = {}) {
  if (!isCamoufoxNativeProfile(profile)) return { status: 'not-applicable' };
  profile.fingerprint = profile.fingerprint && typeof profile.fingerprint === 'object'
    ? profile.fingerprint : { mode: 'native' };
  if (profile.fingerprint.identity) return { status: 'already-present' };
  const resolveExecutable = deps.resolveExecutable;
  if (typeof resolveExecutable !== 'function') {
    profile.fingerprint.identityProvisioning = 'unavailable';
    return { status: 'unavailable', reason: 'no-verified-engine-resolver' };
  }
  let executablePath;
  try { executablePath = resolveExecutable(); }
  catch (_) {
    profile.fingerprint.identityProvisioning = 'unavailable';
    return { status: 'unavailable', reason: 'engine-not-installed-or-unverified' };
  }
  const generate = typeof deps.generate === 'function' ? deps.generate : defaultGenerate;
  const fp = profile.fingerprint;
  const declaredLocale = typeof fp.language === 'string' && fp.language
    ? fp.language
    : (Array.isArray(fp.languages) && typeof fp.languages[0] === 'string' && fp.languages[0]
      ? fp.languages[0] : null);
  let identity;
  try {
    identity = await generate({
      executablePath,
      os: 'windows',
      locale: declaredLocale,
      timezone: typeof fp.timezone === 'string' && fp.timezone ? fp.timezone : null,
    });
  } catch (error) {
    profile.fingerprint.identityProvisioning = 'unavailable';
    return {
      status: 'unavailable',
      reason: error && error.code === 'GENERATOR_UNAVAILABLE'
        ? 'generator-package-missing' : 'generator-failed',
    };
  }
  try { validateStoredIdentity(identity); }
  catch (_) {
    profile.fingerprint.identityProvisioning = 'invalid';
    return { status: 'invalid', reason: 'generated-identity-failed-validation' };
  }
  try { assertIdentityMatchesProfile(profile, identity.expectations); }
  catch (_) {
    profile.fingerprint.identityProvisioning = 'invalid';
    return { status: 'invalid', reason: 'generated-identity-contradicts-profile' };
  }
  fp.identity = identity;
  fp.identityProvisioning = 'provisioned';
  return { status: 'provisioned', identity };
}

module.exports = { provisionCamoufoxIdentity, isCamoufoxNativeProfile, defaultGenerate };
