#!/usr/bin/env node
/**
 * Every desktop create* path that inserts app HTML must bind listeners after
 * the nodes are in the document. A setupEventListeners or mount call that
 * lives only inside a catch block does not count.
 */
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'web', 'js', 'main-simple.js');
const text = fs.readFileSync(file, 'utf8');
const starts = [];
const pattern = /^    async (create\w+)\(/gm;
let match = pattern.exec(text);
while (match) {
  starts.push({ name: match[1], index: match.index });
  match = pattern.exec(text);
}
const missing = [];
for (let i = 0; i < starts.length; i += 1) {
  const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
  const body = text.slice(starts[i].index, end);
  const success = body.split(/\bcatch\s*\(/)[0];
  if (!success.includes('contentElement.innerHTML')) continue;
  if (success.includes('setupEventListeners') || success.includes('.mount(')) continue;
  missing.push(starts[i].name);
}
if (missing.length) {
  console.error(`listener-after-render missing ${missing.length}`);
  for (const name of missing) console.error(name);
  process.exit(1);
}
console.log(`listener-after-render ok functions=${starts.length}`);
