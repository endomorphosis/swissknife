#!/usr/bin/env node

const { buildAgentSupervisorConsoleEvidence } = require('./agent-supervisor-console-evidence-lib.cjs');

const result = buildAgentSupervisorConsoleEvidence();
console.log(JSON.stringify({
  decision: result.e2e.decision,
  blocker_count: result.blockers.length,
  receipt_count: result.receipts.receipt_count,
  outputs: result.e2e.expected_outputs,
}, null, 2));

if (result.blockers.length > 0) {
  process.exit(1);
}
