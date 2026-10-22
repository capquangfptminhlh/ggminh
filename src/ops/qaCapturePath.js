'use strict';

const path = require('node:path');

function resolveQaCaptureDir({ packaged, appRoot, userData, override } = {}) {
  if (typeof packaged !== 'boolean' || !path.isAbsolute(appRoot || '') ||
      !path.isAbsolute(userData || '')) {
    throw Error('QA capture path inputs are invalid');
  }
  if (override !== undefined && !path.isAbsolute(override)) {
    throw Error('QA capture override must be an absolute path');
  }
  const target = path.normalize(override || (packaged
    ? path.join(userData, 'qa-captures')
    : path.join(appRoot, 'dist')));
  if (target.split(path.sep).some(part => part.toLowerCase().endsWith('.asar'))) {
    throw Error('QA capture output cannot be inside app.asar');
  }
  return target;
}

module.exports = { resolveQaCaptureDir };
