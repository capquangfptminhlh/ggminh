'use strict';

const fs = require('fs');
const { readLedger, recordRevocation } = require('./customerLedger');
const { changeRevocation } = require('./authority');

function intervalMinutes(value) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 10080
    ? minutes
    : 1440;
}

function sweepExpiredRentals(ledgerFile, registryFile, { clock = () => Date.now() } = {}) {
  const now = clock();
  if (!Number.isFinite(now) || now < 0) throw Error('Owner sweep clock invalid');
  const ledger = readLedger(ledgerFile);
  const expired = ledger.licenses.filter(license =>
    !license.revoked &&
    license.enforcementMode === 'owner_sweep' &&
    Date.parse(license.expiresAt) <= now,
  );
  const licenseIds = [];
  for (const license of expired) {
    // Registry first is fail-closed: if the later audit write fails, the
    // signed authority still refuses new customer activity.
    changeRevocation(registryFile, license.licenseId, true);
    recordRevocation(ledgerFile, license.licenseId, true, { now: clock });
    licenseIds.push(license.licenseId);
  }
  return { swept: licenseIds.length, licenseIds };
}

function startOwnerSweep({
  ledgerFile,
  registryFile,
  clock = () => Date.now(),
  intervalMinutes: requestedInterval = 1440,
  logger = console,
  health = { healthy: false, lastError: null, lastRunAt: null },
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (!ledgerFile || !registryFile) throw Error('Owner sweep ledger and registry paths are required');
  let ledgerStat;
  try {
    ledgerStat = fs.lstatSync(ledgerFile);
  } catch (error) {
    if (error?.code === 'ENOENT') throw Error('Owner sweep ledger does not exist');
    throw error;
  }
  if (!ledgerStat.isFile() || ledgerStat.isSymbolicLink()) {
    throw Error('Owner sweep ledger must be a regular file');
  }
  const execute = () => {
    const result = sweepExpiredRentals(ledgerFile, registryFile, { clock });
    health.healthy = true;
    health.lastError = null;
    health.lastRunAt = clock();
    if (result.swept > 0) logger.info?.(`Owner sweep revoked ${result.swept} expired rental license(s)`);
    return result;
  };
  // Startup is fail-closed. The authority must not begin serving expired
  // owner-sweep licenses if its ledger cannot be read and reconciled.
  execute();
  const run = () => {
    try {
      return execute();
    } catch (error) {
      health.healthy = false;
      health.lastError = error.message;
      health.lastRunAt = clock();
      logger.error?.(`Owner sweep failed: ${error.message}`);
      return { swept: 0, licenseIds: [], error: error.message };
    }
  };
  const timer = setIntervalFn(() => { void run(); }, intervalMinutes(requestedInterval) * 60000);
  timer.unref?.();
  const stop = () => clearIntervalFn(timer);
  stop.health = health;
  return stop;
}

module.exports = { sweepExpiredRentals, startOwnerSweep, intervalMinutes };
