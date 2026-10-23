#!/usr/bin/env node
'use strict';
/** Recompute VDG acceptance from originating evidence. NO_GO is a reportable
 * result; --require-go also makes it a failing scheduler validation (exit 75).
 */
const fs = require('node:fs');
const path = require('node:path');
const { FAMILIES, EVIDENCE_ROOT, writeFamilyEvidence } = require('./vdg-evidence.cjs');
const { writeAtomicJson } = require('./vdg-atomic-json.cjs');

function buildCoverage(families) {
  const missing = Object.keys(FAMILIES).filter(family => !families.some(report => report.family === family));
  const gaps = families.flatMap(report => report.gaps.map(gap => ({ family: report.family, ...gap })));
  gaps.push(...missing.map(family => ({ family, code: 'family_evidence_missing' })));
  const go = missing.length === 0 && families.length === Object.keys(FAMILIES).length
    && families.every(report => report.passed === true && report.decision === 'GO' && report.gap_count === 0 && report.clicked === true);
  return {
    schema: 'swissknife.virtual-desktop-gui-mcp-coverage.v1',
    generated_at: new Date().toISOString(),
    decision: go ? 'GO' : 'no_go',
    passed: go,
    clicked: families.length > 0 && families.every(report => report.clicked === true),
    executed_tool_count: families.reduce((sum, report) => sum + report.executed_tool_count, 0),
    observed_invocation_count: families.reduce((sum, report) => sum + report.observed_invocation_count, 0),
    control_count: families.reduce((sum, report) => sum + report.control_count, 0),
    observed_control_count: families.reduce((sum, report) => sum + report.observed_control_count, 0),
    family_specs: Object.values(FAMILIES).map(family => family.spec),
    families: families.map(({ family, task_id, decision, passed, clicked, gap_count, gap_counts, input_fingerprint, evidence_sources }) => ({ family, task_id, decision, passed, clicked, gap_count, gap_counts, input_fingerprint, evidence_sources })),
    gap_count: gaps.length,
    gap_counts: gaps.reduce((counts, gap) => { counts[gap.code] = (counts[gap.code] || 0) + 1; return counts; }, {}),
    gaps,
    reasons: [...new Set(gaps.map(gap => `${gap.family}: ${gap.code}`))],
    repair_tasks: [...new Set(families.flatMap(report => report.repair_tasks))],
    work_complete: false,
    completion_authority: false,
  };
}

function main() {
  const reports = Object.keys(FAMILIES).map(family => writeFamilyEvidence(family));
  const coverage = buildCoverage(reports);
  const evidenceRoot = path.resolve(process.env.VDG_EVIDENCE_ROOT || EVIDENCE_ROOT);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  writeAtomicJson(path.join(evidenceRoot, 'gui-mcp-coverage.json'), coverage);
  console.log(JSON.stringify({ decision: coverage.decision, passed: coverage.passed, clicked: coverage.clicked, observed_invocation_count: coverage.observed_invocation_count, executed_tool_count: coverage.executed_tool_count, gap_count: coverage.gap_count, gap_counts: coverage.gap_counts, repair_tasks: coverage.repair_tasks }));
  if (process.argv.includes('--require-go') && !coverage.passed) process.exitCode = 75;
}
if (require.main === module) main();
module.exports = { buildCoverage };
