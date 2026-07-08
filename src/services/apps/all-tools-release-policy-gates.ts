import type {
  AllToolsAppBindingMatrix,
} from './all-tools-app-binding-matrix.js';
import type {
  AllToolsLedger,
  AllToolsPolicyMatrix,
} from './all-tools-policy-classifier.js';
import type {
  AllToolsGlassesProjectionCatalog,
} from '../glasses/all-tools-glasses-projection.js';
import type {
  AllToolsIDLDescriptorCatalog,
} from '../mcp/all-tools-idl-generator.js';

export const ALL_TOOLS_RELEASE_POLICY_GATE_ID =
  'org.hallucinate.swissknife.all-mcp-tools-release-policy-gate';

export interface AllToolsExecutionReportSummary {
  fixture_count: number;
  app_routable_fixture_count: number;
  denied_fixture_count: number;
  side_effect_receipt_fixture_count: number;
}

export type AllToolsReleaseDecision = 'go' | 'no_go';
export type AllToolsReleaseGateStatus = 'pass' | 'fail' | 'warn';

export interface AllToolsReleaseGate {
  gate_id: string;
  status: AllToolsReleaseGateStatus;
  required: boolean;
  summary: string;
  evidence: Record<string, unknown>;
  blockers: readonly string[];
}

export interface AllToolsReleasePolicyGateReport {
  report_id: typeof ALL_TOOLS_RELEASE_POLICY_GATE_ID;
  schema: 'swissknife.all-mcp-tools-release-policy-gate.v1';
  version: string;
  generated_at?: string;
  generated_from: readonly string[];
  decision: AllToolsReleaseDecision;
  gate_count: number;
  pass_count: number;
  fail_count: number;
  warn_count: number;
  blocker_count: number;
  tool_count: number;
  app_visible_tool_count: number;
  adapter_required_method_count: number;
  gates: readonly AllToolsReleaseGate[];
  blockers: readonly string[];
}

export interface AllToolsReleasePolicyGateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function buildAllToolsReleasePolicyGateReport(
  inputs: {
    ledger: AllToolsLedger;
    policyMatrix: AllToolsPolicyMatrix;
    bindingMatrix: AllToolsAppBindingMatrix;
    executionReport: AllToolsExecutionReportSummary;
    idlCatalog: AllToolsIDLDescriptorCatalog;
    glassesCatalog: AllToolsGlassesProjectionCatalog;
  },
  options: { generatedAt?: string; version?: string } = {},
): AllToolsReleasePolicyGateReport {
  const appVisibleToolCount = inputs.bindingMatrix.rows.filter(row => row.app_visible).length;
  const gates = [
    ledgerGate(inputs.ledger),
    policyGate(inputs.ledger, inputs.policyMatrix),
    appBindingGate(inputs.ledger, inputs.bindingMatrix),
    executionGate(inputs.ledger, inputs.bindingMatrix, inputs.executionReport),
    idlGate(inputs.bindingMatrix, inputs.idlCatalog),
    glassesGate(inputs.idlCatalog, inputs.glassesCatalog),
    highRiskGate(inputs.policyMatrix, inputs.bindingMatrix),
    accelerateBoundaryGate(inputs.idlCatalog),
  ];
  const blockers = gates.flatMap(gate => gate.blockers);
  const failCount = gates.filter(gate => gate.status === 'fail').length;
  const warnCount = gates.filter(gate => gate.status === 'warn').length;

  return {
    report_id: ALL_TOOLS_RELEASE_POLICY_GATE_ID,
    schema: 'swissknife.all-mcp-tools-release-policy-gate.v1',
    version: options.version ?? '2026-07-08',
    generated_at: options.generatedAt,
    generated_from: [
      inputs.ledger.schema ?? 'unknown-ledger-schema',
      inputs.policyMatrix.matrix_id,
      inputs.bindingMatrix.matrix_id,
      inputs.idlCatalog.catalog_id,
      inputs.glassesCatalog.catalog_id,
    ],
    decision: failCount > 0 ? 'no_go' : 'go',
    gate_count: gates.length,
    pass_count: gates.filter(gate => gate.status === 'pass').length,
    fail_count: failCount,
    warn_count: warnCount,
    blocker_count: blockers.length,
    tool_count: inputs.ledger.tools.length,
    app_visible_tool_count: appVisibleToolCount,
    adapter_required_method_count: inputs.idlCatalog.adapter_required_method_count,
    gates,
    blockers,
  };
}

export function validateAllToolsReleasePolicyGateReport(
  report: AllToolsReleasePolicyGateReport,
): AllToolsReleasePolicyGateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (report.gate_count !== report.gates.length) {
    errors.push(`gate_count ${report.gate_count} does not match gate length ${report.gates.length}`);
  }
  if (report.pass_count !== report.gates.filter(gate => gate.status === 'pass').length) {
    errors.push('pass_count does not match gate statuses');
  }
  if (report.fail_count !== report.gates.filter(gate => gate.status === 'fail').length) {
    errors.push('fail_count does not match gate statuses');
  }
  if (report.warn_count !== report.gates.filter(gate => gate.status === 'warn').length) {
    errors.push('warn_count does not match gate statuses');
  }
  if (report.blocker_count !== report.blockers.length) {
    errors.push('blocker_count does not match blockers length');
  }
  if (report.decision === 'go' && report.fail_count > 0) {
    errors.push('go decision cannot include failing gates');
  }
  if (report.decision === 'no_go' && report.blocker_count === 0) {
    warnings.push('no_go decision has no explicit blockers');
  }
  for (const gate of report.gates) {
    if (gate.status === 'fail' && gate.blockers.length === 0) {
      errors.push(`${gate.gate_id}: failing gate must include blockers`);
    }
    if (!gate.summary) errors.push(`${gate.gate_id}: missing summary`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function ledgerGate(ledger: AllToolsLedger): AllToolsReleaseGate {
  const expected = ledger.summary?.exact_tool_record_count ?? ledger.tools.length;
  return gate({
    gate_id: 'ledger_complete',
    status: ledger.tools.length === expected ? 'pass' : 'fail',
    summary: `Ledger covers ${ledger.tools.length}/${expected} exact tool records.`,
    evidence: {
      tool_count: ledger.tools.length,
      expected_tool_count: expected,
      live_exact_tool_count: ledger.summary?.live_exact_tool_count,
      static_exact_tool_count: ledger.summary?.static_exact_tool_count,
    },
    blockers: ledger.tools.length === expected ? [] : ['All-tools ledger is incomplete.'],
  });
}

function policyGate(
  ledger: AllToolsLedger,
  policyMatrix: AllToolsPolicyMatrix,
): AllToolsReleaseGate {
  return gate({
    gate_id: 'policy_classification_complete',
    status: policyMatrix.rules.length === ledger.tools.length ? 'pass' : 'fail',
    summary: `Policy matrix covers ${policyMatrix.rules.length}/${ledger.tools.length} tools.`,
    evidence: {
      policy_rule_count: policyMatrix.rules.length,
      tool_count: ledger.tools.length,
    },
    blockers: policyMatrix.rules.length === ledger.tools.length ? [] : ['One or more tools lack policy classification.'],
  });
}

function appBindingGate(
  ledger: AllToolsLedger,
  bindingMatrix: AllToolsAppBindingMatrix,
): AllToolsReleaseGate {
  const missingDisposition = bindingMatrix.rows.filter(row => !row.disposition || !row.normalized_disposition);
  const missingFallback = bindingMatrix.rows.filter(row => row.app_visible && !row.glasses_fallback);
  const pass = bindingMatrix.rows.length === ledger.tools.length
    && missingDisposition.length === 0
    && missingFallback.length === 0;
  return gate({
    gate_id: 'app_binding_complete',
    status: pass ? 'pass' : 'fail',
    summary: `App binding matrix covers ${bindingMatrix.rows.length}/${ledger.tools.length} tools.`,
    evidence: {
      binding_row_count: bindingMatrix.rows.length,
      missing_disposition_count: missingDisposition.length,
      missing_fallback_count: missingFallback.length,
      disposition_counts: bindingMatrix.disposition_counts,
    },
    blockers: pass ? [] : ['One or more tools lack app disposition or fallback metadata.'],
  });
}

function executionGate(
  ledger: AllToolsLedger,
  bindingMatrix: AllToolsAppBindingMatrix,
  executionReport: AllToolsExecutionReportSummary,
): AllToolsReleaseGate {
  const appVisibleCount = bindingMatrix.rows.filter(row => row.app_visible).length;
  const pass = executionReport.fixture_count === ledger.tools.length
    && executionReport.app_routable_fixture_count === appVisibleCount
    && executionReport.denied_fixture_count === ledger.tools.length - appVisibleCount;
  return gate({
    gate_id: 'execution_fixtures_complete',
    status: pass ? 'pass' : 'fail',
    summary: `Execution fixtures cover ${executionReport.fixture_count}/${ledger.tools.length} tools.`,
    evidence: {
      fixture_count: executionReport.fixture_count,
      app_routable_fixture_count: executionReport.app_routable_fixture_count,
      denied_fixture_count: executionReport.denied_fixture_count,
      side_effect_receipt_fixture_count: executionReport.side_effect_receipt_fixture_count,
    },
    blockers: pass ? [] : ['Execution fixtures do not match app binding coverage.'],
  });
}

function idlGate(
  bindingMatrix: AllToolsAppBindingMatrix,
  idlCatalog: AllToolsIDLDescriptorCatalog,
): AllToolsReleaseGate {
  const appVisibleCount = bindingMatrix.rows.filter(row => row.app_visible).length;
  const pass = idlCatalog.app_routable_tool_coverage_count === appVisibleCount
    && idlCatalog.workflow_coverage_count === idlCatalog.workflow_count
    && idlCatalog.interface_cid_count === idlCatalog.descriptor_count;
  return gate({
    gate_id: 'orb_idl_complete',
    status: pass ? 'pass' : 'fail',
    summary: `ORB/IDL coverage maps ${idlCatalog.app_routable_tool_coverage_count}/${appVisibleCount} app-routable tools.`,
    evidence: {
      descriptor_count: idlCatalog.descriptor_count,
      method_count: idlCatalog.method_count,
      interface_cid_count: idlCatalog.interface_cid_count,
      workflow_coverage_count: idlCatalog.workflow_coverage_count,
    },
    blockers: pass ? [] : ['ORB/IDL descriptors do not cover all app-routable tools or workflows.'],
  });
}

function glassesGate(
  idlCatalog: AllToolsIDLDescriptorCatalog,
  glassesCatalog: AllToolsGlassesProjectionCatalog,
): AllToolsReleaseGate {
  const pass = glassesCatalog.projection_count === idlCatalog.descriptor_count
    && glassesCatalog.hardware_free_replay_state_count === glassesCatalog.projection_count * 8;
  return gate({
    gate_id: 'glasses_projection_complete',
    status: pass ? 'pass' : 'fail',
    summary: `Glasses projections cover ${glassesCatalog.projection_count}/${idlCatalog.descriptor_count} IDL descriptors.`,
    evidence: {
      projection_count: glassesCatalog.projection_count,
      displayable_projection_count: glassesCatalog.displayable_projection_count,
      hardware_free_replay_state_count: glassesCatalog.hardware_free_replay_state_count,
      behavior_counts: glassesCatalog.behavior_counts,
    },
    blockers: pass ? [] : ['Meta glasses projections do not cover every IDL descriptor or replay state.'],
  });
}

function highRiskGate(
  policyMatrix: AllToolsPolicyMatrix,
  bindingMatrix: AllToolsAppBindingMatrix,
): AllToolsReleaseGate {
  const bindingByToolId = new Map(bindingMatrix.rows.map(row => [row.tool_id, row]));
  const violations = policyMatrix.rules.filter(rule => {
    const binding = bindingByToolId.get(rule.tool_id);
    if (!binding?.app_visible) return false;
    if (!rule.high_risk && !rule.side_effectful && !rule.sensitive) return false;
    return binding.confirmation_policy === 'none'
      || binding.receipt_policy === 'none'
      || binding.glasses_exposure === 'native_display_allowed';
  });
  return gate({
    gate_id: 'high_risk_confirmation_and_receipts',
    status: violations.length === 0 ? 'pass' : 'fail',
    summary: `${violations.length} high-risk app-visible tools violate confirmation, receipt, or glasses policy.`,
    evidence: {
      violation_count: violations.length,
      sample_violations: violations.slice(0, 10).map(rule => rule.tool_id),
    },
    blockers: violations.length === 0 ? [] : ['High-risk app-visible tools are missing confirmation, receipt, or glasses gating.'],
  });
}

function accelerateBoundaryGate(idlCatalog: AllToolsIDLDescriptorCatalog): AllToolsReleaseGate {
  const adapterRows = idlCatalog.tool_coverage.filter(row => row.adapter_required);
  return gate({
    gate_id: 'accelerate_adapter_boundary',
    status: adapterRows.length === 0 ? 'pass' : 'fail',
    summary: `${adapterRows.length} app-routable accelerate tools still require an adapter beyond the bounded compatibility endpoint.`,
    evidence: {
      adapter_required_tool_count: adapterRows.length,
      adapter_required_method_count: idlCatalog.adapter_required_method_count,
      sample_adapter_required_tools: adapterRows.slice(0, 12).map(row => row.tool_id),
    },
    blockers: adapterRows.length === 0
      ? []
      : ['SVD-031 accepted only a bounded ipfs_accelerate_py compatibility endpoint; full release remains no-go until adapter-required methods are bridged.'],
  });
}

function gate(input: {
  gate_id: string;
  status: AllToolsReleaseGateStatus;
  summary: string;
  evidence: Record<string, unknown>;
  blockers: readonly string[];
  required?: boolean;
}): AllToolsReleaseGate {
  return {
    gate_id: input.gate_id,
    status: input.status,
    required: input.required ?? true,
    summary: input.summary,
    evidence: input.evidence,
    blockers: input.blockers,
  };
}
