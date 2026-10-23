'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function writeAtomicJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); fs.renameSync(temporary, filename); }
  finally { fs.rmSync(temporary, { force: true }); }
}
module.exports = { writeAtomicJson };
