#!/usr/bin/env node
'use strict';
const { FAMILIES, loadFamilyEvidence, writeFamilyEvidence } = require('./vdg-evidence.cjs');
function main(argv = process.argv.slice(2)) {
  const [family, ...extra] = argv;
  if (!Object.hasOwn(FAMILIES, family || '') || extra.length > 1 || extra.some(arg => arg !== '--check')) {
    throw new Error('usage: check-vdg-family-evidence.cjs <family> [--check]');
  }
  const report = extra.includes('--check') ? loadFamilyEvidence(family) : writeFamilyEvidence(family);
  console.log(JSON.stringify({ family: report.family, decision: report.decision, passed: report.passed, gap_count: report.gap_count, gap_counts: report.gap_counts, repair_tasks: report.repair_tasks }));
  return report.passed ? 0 : 75;
}
if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
module.exports = { main };
