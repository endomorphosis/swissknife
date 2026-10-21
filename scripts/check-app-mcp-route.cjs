#!/usr/bin/env node
/**
 * App GUI code reaches a backend through POST /mcp/tools/call.
 * Any other quoted /mcp/ path is a private route and fails this check.
 */
const fs = require('node:fs');
const path = require('node:path');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node swissknife/scripts/check-app-mcp-route.cjs <file>...');
  process.exit(2);
}
const route = /(['"`])\/mcp\/(?!tools\/call)[^'"`]*/g;
let failed = false;
for (const relative of files) {
  const file = path.resolve(relative);
  const text = fs.readFileSync(file, 'utf8');
  const hits = [];
  let match = route.exec(text);
  while (match) {
    const line = text.slice(0, match.index).split('\n').length;
    hits.push(`${line}:${match[0]}`);
    match = route.exec(text);
  }
  route.lastIndex = 0;
  if (hits.length) {
    failed = true;
    console.error(`${relative} private-mcp-route ${hits.length}`);
    for (const hit of hits) console.error(`  ${hit}`);
  }
}
if (failed) process.exit(1);
console.log(`mcp-route ok files=${files.length}`);
