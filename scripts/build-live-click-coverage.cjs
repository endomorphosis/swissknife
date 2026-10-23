#!/usr/bin/env node
/**
 * VDL-040: aggregate family live-click reports.
 * GO is withheld unless every family clicked its controls and the MCP++ rules hold.
 * A target report's decision field is not this gate.
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const clickRoot = path.join(evidenceRoot, 'live-clicks');
const outPath = path.join(evidenceRoot, 'live-click-coverage.json');
const families = ['storage', 'datasets', 'accelerate', 'network', 'control', 'local'];
const invokeDispositions = new Set(['invoke', 'deny', 'confirm-then-invoke']);
const zeroCallDispositions = new Set(['local-only', 'external-provider', 'unsupported']);
const reasons = [];

function readReport(name) {
  const filePath = path.join(clickRoot, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    reasons.push(`${name} report missing`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    reasons.push(`${name} report unreadable`);
    return null;
  }
}

function observationReady(row) {
  const observation = row.observation;
  if (!observation) return false;
  return observation.route === '/mcp/tools/call'
    && observation.tool_id
    && observation.transport
    && observation.correlation_id
    && observation.policy_outcome
    && observation.receipt_id
    && observation.event_dag_cid;
}

function pngReady(storedPath, allowMissing) {
  if (!storedPath) return allowMissing;
  const absolute = path.resolve(repoRoot, storedPath);
  if (!fs.existsSync(absolute)) return false;
  return fs.statSync(absolute).size >= 8192;
}

const reports = families.map((name) => ({ name, body: readReport(name) }));
let rowCount = 0;
let invokeCount = 0;
for (const report of reports) {
  if (!report.body) continue;
  if (report.body.clicked !== true || report.body.passed !== true) reasons.push(`${report.name} clicked is not true`);
  if (report.body.forbidden_tool_catalog !== 'loaded') reasons.push(`${report.name} supervisor visibility catalog was not loaded`);
  const rows = Array.isArray(report.body.rows) ? report.body.rows : [];
  if (rows.length === 0) reasons.push(`${report.name} has no rows`);
  for (const row of rows) {
    rowCount += 1;
    if (row.clicked !== true || row.visibility === 'not-visible' || (row.failure_reasons || []).length > 0) {
      reasons.push(`${report.name} row failed ${row.selector || row.launch_id || 'unknown'}`);
    }
    if (!pngReady(row.screenshot_before, false)) reasons.push(`${report.name} before png failed`);
    const dismissed = row.screenshot_after_check === 'window-dismissed';
    if (!pngReady(row.screenshot_after, dismissed)) reasons.push(`${report.name} after png failed`);
    if (invokeDispositions.has(row.disposition)) {
      invokeCount += 1;
      if (!observationReady(row)) reasons.push(`${report.name} invocation fields missing`);
      if (row.app_id !== 'mcp-control' && row.observation && row.observation.dry_run !== true) {
        reasons.push(`${report.name} mutating call was not dry-run`);
      }
    }
    if (zeroCallDispositions.has(row.disposition) && row.mcp_call_count !== 0) {
      reasons.push(`${report.name} zero-call control invoked MCP++`);
    }
    if ((row.failure_reasons || []).includes('forbidden-visibility-tool')) {
      reasons.push(`${report.name} called a supervisor-only or desktop-mobile tool`);
    }
  }
}

const uniqueReasons = [...new Set(reasons)].slice(0, 40);
const go = uniqueReasons.length === 0 && reports.every((report) => report.body);
const coverage = {
  schema: 'swissknife.virtual-desktop-live-click-coverage.v1',
  generated_at: new Date().toISOString(),
  decision: go ? 'GO' : 'no_go',
  passed: go,
  clicked: go,
  work_complete: false,
  completion_authority: false,
  visual_review_authority: 'proposal_only',
  family_count: families.length,
  row_count: rowCount,
  invoke_row_count: invokeCount,
  reasons: uniqueReasons,
};
fs.mkdirSync(evidenceRoot, { recursive: true });
if (reports.some((report) => !report.body)) {
  console.log(JSON.stringify({ decision: 'no_go', passed: false, clicked: false, reasons: uniqueReasons }));
  process.exit(1);
}
fs.writeFileSync(outPath, `${JSON.stringify(coverage, null, 2)}\n`);
console.log(JSON.stringify({ decision: coverage.decision, passed: coverage.passed, clicked: coverage.clicked, row_count: rowCount }));
process.exit(0);
