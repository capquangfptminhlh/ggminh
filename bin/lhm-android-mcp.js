#!/usr/bin/env node
'use strict';

// Launchable by any local MCP client, including LHM Agent AI on Windows.
// Requires only Node.js and this source checkout; no socket or API key.
const {startStdio}=require('../src/android/mcpReadOnly');

if (require.main===module) {
  // This executable must never print non-JSON-RPC data to stdout.
  startStdio();
}
