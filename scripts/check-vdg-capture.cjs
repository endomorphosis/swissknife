#!/usr/bin/env node
'use strict';

/** Acquisition completion is separate from GUI/tool acceptance. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { FAMILIES, EVIDENCE_ROOT } = require('./vdg-evidence.cjs');
const { captureInputFingerprint } = require('./vdg-capture-fingerprint.cjs');
const { controlKey } = require('./vdg-capture-observations.cjs');
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));

function checkCapture(family, transport, options = {}) {
  const definition = FAMILIES[family];
  if (!definition || !['http', 'libp2p'].includes(transport)) throw new Error('family and declared transport are required');
  const root = path.resolve(options.evidenceRoot || process.env.VDG_EVIDENCE_ROOT || EVIDENCE_ROOT);
  const manifest = read(path.join(root, 'vdg/connectors', `${definition.target}.json`));
  if (manifest.schema !== 'swissknife.virtual-desktop-gui-mcp-connectors.v1' || manifest.target !== definition.target || !Array.isArray(manifest.runs)) throw new Error('connector capture manifest invalid');
  const run = manifest.runs.filter(item => item.transport === transport).at(-1);
  if (!run || !/^[a-z][a-z0-9-]*$/.test(run.run_id || '') || !run.run_id.startsWith(`${definition.target}-${transport}-`)
    || run.report_path !== `vdg/runs/${run.run_id}.json` || run.capture_complete !== true || !Number.isFinite(Date.parse(run.completed_at))) throw new Error('complete transport capture missing');
  const current = captureInputFingerprint(family, transport, { evidenceRoot: root, sourceRoot: options.sourceRoot, definition });
  if (run.input_fingerprint !== current) throw new Error('capture source binding is stale or missing');
  const bytes = fs.readFileSync(path.join(root, run.report_path));
  if (run.report_sha256 !== crypto.createHash('sha256').update(bytes).digest('hex')) throw new Error('capture report hash mismatch or missing');
  const report = JSON.parse(bytes);
  if (options.startedAfter !== undefined && (!Number.isFinite(options.startedAfter)
    || Date.parse(run.completed_at) < options.startedAfter || Date.parse(report.generated_at) < options.startedAfter)) throw new Error('capture predates this acquisition attempt');
  if (report.schema !== 'swissknife.virtual-desktop-live-click.v1' || report.target !== definition.target
    || !Number.isFinite(Date.parse(report.generated_at)) || Date.parse(report.generated_at) > Date.parse(run.completed_at)
    || !Array.isArray(report.rows) || report.rows.length === 0 || report.row_count !== report.rows.length
    || report.rows.some(row => !Array.isArray(row.failure_reasons) || row.failure_reasons.includes('runner-failed'))) throw new Error('capture report is incomplete or fatal');
  const matrix = read(path.join(root, 'control-tool-matrix.json'));
  const expected = (matrix.rows || []).filter(row => row.family === family);
  const visited = new Set(report.rows.map(controlKey));
  if (!expected.length || expected.some(row => !visited.has(controlKey(row)))) throw new Error('capture did not visit every declared control');
  return { schema: 'swissknife.vdg-capture-acquisition.v1', family, transport,
    capture_complete: true, run_id: run.run_id, input_fingerprint: current,
    report_path: run.report_path, report_sha256: run.report_sha256,
    row_count: report.rows.length, acceptance_decision: report.decision || 'no_go',
    work_complete: false, completion_authority: false };
}
function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2) throw new Error('usage: check-vdg-capture.cjs <family> <http|libp2p>');
  console.log(JSON.stringify(checkCapture(...argv)));
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 75; }
}
module.exports = { checkCapture, main };
