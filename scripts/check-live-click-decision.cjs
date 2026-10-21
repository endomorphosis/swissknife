#!/usr/bin/env node
/**
 * The live-click report may say GO only from row evidence.
 * A hardcoded decision: 'no_go' is not a gate.
 */
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'test', 'e2e', 'helpers', 'live-click-session.ts');
const text = fs.readFileSync(file, 'utf8');
const problems = [];
if (!text.includes("decision: 'GO' | 'no_go'")) {
  problems.push("report type must allow 'GO' | 'no_go'");
}
if (/decision:\s*'no_go',/.test(text)) {
  problems.push('report builder still assigns decision: no_go unconditionally');
}
if (!text.includes('/mcp/tools/call')) {
  problems.push('GO decision must require a POST /mcp/tools/call observation');
}
if (problems.length) {
  console.error(`live-click-decision withheld ${problems.length}`);
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log('live-click-decision ok');
