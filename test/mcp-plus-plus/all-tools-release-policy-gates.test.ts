/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import type { AllToolsAppBindingMatrix } from '../../src/services/apps/all-tools-app-binding-matrix';
import type {
  AllToolsLedger,
  AllToolsPolicyMatrix,
} from '../../src/services/apps/all-tools-policy-classifier';
import {
  buildAllToolsReleasePolicyGateReport,
  validateAllToolsReleasePolicyGateReport,
  type AllToolsExecutionReportSummary,
  type AllToolsReleasePolicyGateReport,
} from '../../src/services/apps/all-tools-release-policy-gates';
import type { AllToolsGlassesProjectionCatalog } from '../../src/services/glasses/all-tools-glasses-projection';
import type { AllToolsIDLDescriptorCatalog } from '../../src/services/mcp/all-tools-idl-generator';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const ledgerPath = join(evidenceRoot, 'all-tools-ledger.json');
const policyPath = join(evidenceRoot, 'all-tools-policy-matrix.json');
const bindingsPath = join(evidenceRoot, 'all-tools-app-bindings.json');
const executionPath = join(evidenceRoot, 'all-tools-execution-report.json');
const idlPath = join(evidenceRoot, 'all-tools-idl-coverage.json');
const glassesPath = join(evidenceRoot, 'all-tools-glasses-coverage.json');
const gatePath = join(evidenceRoot, 'all-tools-policy-release-gate.json');

let report: AllToolsReleasePolicyGateReport;

describe('all MCP/MCP++ tools release policy gates', () => {
  beforeAll(() => {
    report = buildAllToolsReleasePolicyGateReport(
      {
        ledger: readJson<AllToolsLedger>(ledgerPath),
        policyMatrix: readJson<AllToolsPolicyMatrix>(policyPath),
        bindingMatrix: readJson<AllToolsAppBindingMatrix>(bindingsPath),
        executionReport: readJson<AllToolsExecutionReportSummary>(executionPath),
        idlCatalog: readJson<AllToolsIDLDescriptorCatalog>(idlPath),
        glassesCatalog: readJson<AllToolsGlassesProjectionCatalog>(glassesPath),
      },
      { generatedAt: '2026-07-08T00:00:00.000Z' },
    );
    actualFs.mkdirSync(dirname(gatePath), { recursive: true });
    actualFs.writeFileSync(gatePath, `${JSON.stringify(report, null, 2)}\n`);
  });

  it('writes a release gate report with all required evidence sections', () => {
    expect(report.schema).toBe('swissknife.all-mcp-tools-release-policy-gate.v1');
    expect(report.gate_count).toBe(8);
    expect(report.tool_count).toBe(658);
    expect(report.app_visible_tool_count).toBe(627);
    expect(actualFs.existsSync(gatePath)).toBe(true);
  });

  it('passes coverage gates for ledger, policy, bindings, fixtures, IDL, and glasses', () => {
    expect(gate('ledger_complete').status).toBe('pass');
    expect(gate('policy_classification_complete').status).toBe('pass');
    expect(gate('app_binding_complete').status).toBe('pass');
    expect(gate('execution_fixtures_complete').status).toBe('pass');
    expect(gate('orb_idl_complete').status).toBe('pass');
    expect(gate('glasses_projection_complete').status).toBe('pass');
    expect(gate('high_risk_confirmation_and_receipts').status).toBe('pass');
  });

  it('returns go after the configured accelerate adapter exposes every required method', () => {
    const boundary = gate('accelerate_adapter_boundary');

    expect(report.decision).toBe('go');
    expect(report.fail_count).toBe(0);
    expect(report.blocker_count).toBe(0);
    expect(boundary.status).toBe('pass');
    expect(boundary.evidence.adapter_required_tool_count).toBe(0);
    expect(boundary.evidence.adapter_required_method_count).toBe(0);
  });

  it('validates release gate counters and failing-gate blocker contracts', () => {
    const validation = validateAllToolsReleasePolicyGateReport(report);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(report.pass_count).toBe(8);
    expect(report.warn_count).toBe(0);
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(actualFs.readFileSync(filePath, 'utf8')) as T;
}

function gate(gateId: string) {
  const found = report.gates.find(candidate => candidate.gate_id === gateId);
  if (!found) throw new Error(`Missing gate ${gateId}`);
  return found;
}
