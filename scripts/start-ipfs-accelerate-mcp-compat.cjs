#!/usr/bin/env node
const { startAccelerateCompatServer } = require('./all-tools-evidence-lib.cjs');

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

startAccelerateCompatServer({
  host: argValue('--host', '127.0.0.1'),
  port: Number(argValue('--port', '3003')),
  upstream: argValue('--upstream', 'http://127.0.0.1:9000'),
});
