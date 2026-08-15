/**
 * Agent Supervisor target semantic baseline (VGO-062).
 *
 * Wire models:
 *   - AgentSupervisorTarget@1 / agent-supervisor-target/v1
 *   - UiSemanticBaseline@1 / ui-semantic-baseline/v1
 *
 * Analyzes committed live source, the canonical application manifest, the
 * runtime registration projection, contracts, routes, and tests. Legacy and
 * manually duplicated surfaces are inventoried and distinguished; they are
 * not rewritten and are never treated as live implementation authority.
 *
 * Integrates the committed scanner, graph, capsule, state-machine, policy,
 * invalidation, and evaluator layers. The Python invariant engine is recorded
 * as an uninvoked capability gap: this target never spawns a solver or claims
 * prover usability.
 *
 * Static extraction never executes repository source. Scanner, graph, capsule,
 * state-machine, invalidation, and evaluator outputs remain unverified. Live
 * accessibility, visual, interaction, authorization, and WCAG claims are not
 * earned by this task.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileUiBaseline,
  emptyMetricValues,
  makeUiMetricSnapshot,
  uiBaselineToDict,
  uiMetricSnapshotToDict,
  type ObjectiveMetricId,
  type UiBaseline,
  type UiMetricSnapshot,
} from '../baseline.js';
import {
  ACCEPTED_VGO_002_TASK_CID,
  buildUiComponentGraph,
  UI_COMPONENT_GRAPH_EXTRACTOR_VERSION,
  UI_COMPONENT_GRAPH_INTERFACE,
  UI_COMPONENT_GRAPH_SCHEMA,
  validateUiComponentGraph,
  type UiComponentGraph,
} from '../component-graph.js';
import {
  evaluateObjective,
  GUI_OBJECTIVE_EVALUATOR_INTERFACE,
  GUI_OBJECTIVE_EVALUATOR_SCHEMA,
  GUI_OBJECTIVE_EVALUATOR_VERSION,
  type AcceptanceDecision,
  type AcceptanceReasonCode,
} from '../evaluator.js';
import {
  makeUiChangeSet,
  planUiInvalidation,
  UI_INVALIDATION_PLAN_INTERFACE,
  UI_INVALIDATION_PLAN_SCHEMA,
  UI_INVALIDATION_PLANNER_INTERFACE,
  UI_INVALIDATION_PLANNER_VERSION,
  type UiInvalidationPlan,
} from '../invalidation.js';
import {
  canonicalIdentity,
  sha256Digest,
  type GuiCanonicalIdentity,
} from '../identity.js';
import {
  CANONICAL_JSON_PROFILE,
  decodeGuiApplicationIdentity,
  decodeGuiScreenIdentity,
  decodeUiComponentIdentity,
  GUI_APPLICATION_IDENTITY_INTERFACE,
  GUI_APPLICATION_IDENTITY_SCHEMA,
  GUI_COMPONENT_KINDS,
  GUI_SCREEN_IDENTITY_INTERFACE,
  GUI_SCREEN_IDENTITY_SCHEMA,
  GUI_STATIC_SCANNER_INTERFACE,
  GUI_STATIC_SCAN_RESULT_SCHEMA,
  makeSourceSpan,
  UI_COMPONENT_IDENTITY_INTERFACE,
  UI_COMPONENT_IDENTITY_SCHEMA,
  type GuiAnalysisClassification,
  type GuiApplicationIdentity,
  type GuiCompletenessBoundary,
  type GuiComponentKind,
  type GuiDependencyRelation,
  type GuiFindingKind,
  type GuiScreenIdentity,
  type GuiStaticScanResult,
  type GuiVerificationStatus,
  type UiComponentIdentity,
  worstGuiExtractionConfidence,
} from '../models.js';
import {
  makeUiActionBinding,
  UI_POLICY_BINDING_REPORT_INTERFACE,
  UI_POLICY_BINDING_VALIDATOR_INTERFACE,
  UI_POLICY_BINDING_VALIDATOR_VERSION,
  validatePolicyBindings,
  type UiActionBinding,
  type UiActionBindingEvidence,
  type UiPolicyAcceptanceOutcome,
  type UiPolicyBindingReasonCode,
  type UiPolicyBindingReport,
} from '../policy-validator.js';
import { scanGuiSources } from '../scanner.js';
import {
  AGENT_SUPERVISOR_APPLICATION_ID,
  AGENT_SUPERVISOR_SCREEN_ID,
  STABLE_SCENARIO_IDS,
} from '../scenario-catalog.js';
import {
  extractUiStateMachineFromScan,
  UI_STATE_MACHINE_EXTRACTOR_VERSION,
  UI_STATE_MACHINE_INTERFACE,
  UI_STATE_MACHINE_SCHEMA,
  type UiStateKind,
  type UiStateMachine,
} from '../state-machine.js';
import {
  compileUiSemanticCapsuleFromFacts,
  MAX_COLLECTION_ITEMS,
  UI_SEMANTIC_CAPSULE_INTERFACE,
  type UiSemanticCapsule,
} from '../ui-capsule.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const AGENT_SUPERVISOR_TARGET_INTERFACE =
  'AgentSupervisorTarget@1' as const;
export const AGENT_SUPERVISOR_TARGET_SCHEMA =
  'agent-supervisor-target/v1' as const;
export const AGENT_SUPERVISOR_TARGET_VERSION =
  'gui-agent-supervisor-target-1.0.0' as const;

export const UI_SEMANTIC_BASELINE_INTERFACE = 'UiSemanticBaseline@1' as const;
export const UI_SEMANTIC_BASELINE_SCHEMA = 'ui-semantic-baseline/v1' as const;

export const DOMAIN_UI_SEMANTIC_BASELINE = 'gui.ui-semantic-baseline' as const;

export const AGENT_SUPERVISOR_PACKAGE_NAMESPACE =
  'org.hallucinate.swissknife.gui-optimizer' as const;
export const AGENT_SUPERVISOR_DISPLAY_NAME = 'Agent Supervisor' as const;
export const AGENT_SUPERVISOR_ROUTE_ID = 'route:agent-supervisor' as const;
export const AGENT_SUPERVISOR_COMPONENT_NAME =
  'AgentSupervisorConsole' as const;

/** Repository-relative live implementation. This is the selected VGO target. */
export const AGENT_SUPERVISOR_LIVE_TARGET_PATH =
  'swissknife/web/js/apps/agent-supervisor.js' as const;

export const AGENT_SUPERVISOR_SEMANTIC_BASELINE_EVIDENCE_PATH =
  'implementation_plan/evidence/verified_gui_optimizer/agent-supervisor-semantic-baseline.json' as const;

export const AGENT_SUPERVISOR_CONTRACT_SCHEMA =
  'swissknife.agent_supervisor_console.v1' as const;
export const AGENT_SUPERVISOR_CONTRACT_SCHEMA_REF =
  'swissknife/contracts/agent-supervisor-console.schema.json' as const;

export const SURFACE_AUTHORITIES = Object.freeze([
  'canonical',
  'live_target',
  'runtime_projection',
  'supporting',
  'test',
  'contract',
  'legacy',
  'not_authorization_authority',
] as const);
export type SurfaceAuthority = (typeof SURFACE_AUTHORITIES)[number];

export const SURFACE_ROLES = Object.freeze([
  'live_implementation',
  'application_manifest',
  'runtime_registration',
  'browser_entry',
  'descriptor',
  'gateway',
  'policy_mediator',
  'action_contract',
  'live_tool_binding',
  'service_contract',
  'schema',
  'ui_ux_ir',
  'device_projection',
  'playwright_config',
  'direct_browser_test',
  'governed_lifecycle_test',
  'boundary_test',
  'policy_source',
  'unit_config',
  'screenshot_workflow',
  'legacy_archive',
  'superseded_entry',
  'not_authorization_authority',
] as const);
export type SurfaceRole = (typeof SURFACE_ROLES)[number];

export const BASELINE_VIOLATION_EVIDENCE_LEVELS = Object.freeze([
  'structural',
  'integrity',
  'heuristic',
  'unverified',
] as const);
export type BaselineViolationEvidenceLevel =
  (typeof BASELINE_VIOLATION_EVIDENCE_LEVELS)[number];

const COMPONENT_KIND_SET = new Set<string>(GUI_COMPONENT_KINDS);

// ---------------------------------------------------------------------------
// Closed inventories (committed paths only)
// ---------------------------------------------------------------------------

export interface SurfaceDescriptor {
  readonly path: string;
  readonly role: SurfaceRole;
  readonly authority: SurfaceAuthority;
  readonly notes: string;
}

/** Canonical / supporting live surfaces analyzed for this baseline. */
export const CANONICAL_SURFACES = Object.freeze([
  Object.freeze({
    path: AGENT_SUPERVISOR_LIVE_TARGET_PATH,
    role: 'live_implementation',
    authority: 'live_target',
    notes: 'Selected live Agent Supervisor console implementation.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/apps/virtual-desktop-app-manifest.ts',
    role: 'application_manifest',
    authority: 'canonical',
    notes: 'Canonical application inventory. Counts must be derived from source.',
  }),
  Object.freeze({
    path: 'swissknife/web/js/main-simple.js',
    role: 'runtime_registration',
    authority: 'runtime_projection',
    notes: 'Browser mounting and manually duplicated runtime registration map.',
  }),
  Object.freeze({
    path: 'swissknife/web/index.html',
    role: 'browser_entry',
    authority: 'canonical',
    notes: 'Live web entry that loads the main-simple runtime path.',
  }),
  Object.freeze({
    path: 'swissknife/web/js/descriptors/apps/agent-supervisor.descriptor.js',
    role: 'descriptor',
    authority: 'supporting',
    notes: 'Browser descriptor for MCP++ endpoints; not a second live renderer.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/mcp/agent-supervisor-console-gateway.ts',
    role: 'gateway',
    authority: 'canonical',
    notes: 'Browser-to-host console gateway for governed supervisor actions.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/mcp/all-app-tool-gateway.ts',
    role: 'gateway',
    authority: 'canonical',
    notes: 'Fixed same-origin browser-to-host choke point.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/mcp/mcp-control-surface-mediator.ts',
    role: 'policy_mediator',
    authority: 'canonical',
    notes: 'Fail-closed policy mediator. Presentation is not authorization.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/apps/all-app-executable-backend-contract.ts',
    role: 'action_contract',
    authority: 'canonical',
    notes: 'Application action authority contract.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/apps/all-app-live-tool-bindings.ts',
    role: 'live_tool_binding',
    authority: 'canonical',
    notes: 'Live tool binding table consumed by the gateway.',
  }),
  Object.freeze({
    path: 'swissknife/src/shared/service-contracts/agent-supervisor-console.ts',
    role: 'service_contract',
    authority: 'canonical',
    notes: 'Typed Agent Supervisor console contract.',
  }),
  Object.freeze({
    path: AGENT_SUPERVISOR_CONTRACT_SCHEMA_REF,
    role: 'schema',
    authority: 'contract',
    notes: 'Closed JSON schema for the console contract.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/mcp/ui-ux-ir-codec.ts',
    role: 'ui_ux_ir',
    authority: 'supporting',
    notes: 'Stable UI/UX IR wire codec. Not a GUI semantic scanner.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/mcp/ui-ux-ir-web-renderer.ts',
    role: 'ui_ux_ir',
    authority: 'supporting',
    notes: 'Bounded web renderer for UI/UX IR envelopes.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/glasses/ui-ux-ir-glasses-adapter.ts',
    role: 'device_projection',
    authority: 'supporting',
    notes: 'Glasses projection adapter. Not live-console authority.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/mcp/mcp-deontic-interface-broker.ts',
    role: 'device_projection',
    authority: 'supporting',
    notes: 'Device and responsive projection broker.',
  }),
  Object.freeze({
    path: 'swissknife/build-tools/configs/playwright.agent-supervisor.config.ts',
    role: 'playwright_config',
    authority: 'supporting',
    notes: 'Reviewed Agent Supervisor Playwright config. Does not discover the console spec.',
  }),
  Object.freeze({
    path: 'swissknife/test/e2e/agent-supervisor-console.spec.ts',
    role: 'direct_browser_test',
    authority: 'test',
    notes: 'Direct console Playwright coverage. Not selected by the reviewed supervisor config.',
  }),
  Object.freeze({
    path: 'swissknife/test/e2e/agent-supervisor-goal-task-lifecycle.spec.ts',
    role: 'governed_lifecycle_test',
    authority: 'test',
    notes: 'Governed goal/task lifecycle Playwright coverage.',
  }),
  Object.freeze({
    path: 'swissknife/test/browser/agent-supervisor-console-gateway.test.ts',
    role: 'boundary_test',
    authority: 'test',
    notes: 'Console gateway boundary unit coverage.',
  }),
  Object.freeze({
    path: 'swissknife/test/browser/all-app-tool-gateway.test.ts',
    role: 'boundary_test',
    authority: 'test',
    notes: 'Shared tool-gateway boundary coverage including this app.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/apps/app-capability-policy.ts',
    role: 'policy_source',
    authority: 'canonical',
    notes: 'Supporting capability policy source. Presentation is not authorization.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/apps/mcp-deontic-ui-manifest.ts',
    role: 'policy_source',
    authority: 'supporting',
    notes: 'Supporting deontic UI manifest. Not live-console authority.',
  }),
  Object.freeze({
    path: 'swissknife/test/browser-compat/browser-deployment-policy.test.js',
    role: 'boundary_test',
    authority: 'test',
    notes: 'Browser deployment policy boundary coverage. Not a live-DOM audit.',
  }),
  Object.freeze({
    path: 'swissknife/test/mcp-plus-plus/ui-ux-ir-orb-mediation.test.ts',
    role: 'boundary_test',
    authority: 'test',
    notes: 'UI/UX IR orb mediation coverage. Not a GUI semantic scanner.',
  }),
  Object.freeze({
    path: 'swissknife/build-tools/configs/vitest.config.ts',
    role: 'unit_config',
    authority: 'supporting',
    notes: 'Canonical SwissKnife unit configuration. Not a live renderer.',
  }),
  Object.freeze({
    path: 'swissknife/build-tools/configs/playwright.app-improvement.config.ts',
    role: 'screenshot_workflow',
    authority: 'supporting',
    notes: 'Existing app-improvement Playwright configuration. Not the VGO-068 target config.',
  }),
  Object.freeze({
    path: 'swissknife/scripts/run-virtual-desktop-app-improvement.mjs',
    role: 'screenshot_workflow',
    authority: 'supporting',
    notes: 'Existing screenshot and audit runner. Not a complete pixel-diff baseline.',
  }),
  Object.freeze({
    path: 'swissknife/test/e2e/virtual-desktop-all-app-improvement.spec.ts',
    role: 'screenshot_workflow',
    authority: 'test',
    notes: 'Existing all-app screenshot workflow. Not the selected-screen VGO baseline.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/apps/virtual-desktop-app-audit-playwright-driver.ts',
    role: 'screenshot_workflow',
    authority: 'supporting',
    notes: 'Existing Playwright audit driver. Not live-console authority.',
  }),
] as const satisfies readonly SurfaceDescriptor[]);

/** Legacy / duplicated / insufficient surfaces. Documented, not rewritten. */
export const LEGACY_SURFACES = Object.freeze([
  Object.freeze({
    path: 'swissknife/web/legacy-archive',
    role: 'legacy_archive',
    authority: 'legacy',
    notes: 'Not runtime authority.',
  }),
  Object.freeze({
    path: 'swissknife/emergency-archive',
    role: 'legacy_archive',
    authority: 'legacy',
    notes: 'Not runtime authority.',
  }),
  Object.freeze({
    path: 'swissknife/cleanup-archive',
    role: 'legacy_archive',
    authority: 'legacy',
    notes: 'Not runtime authority.',
  }),
  Object.freeze({
    path: 'swissknife/web/emergency-archive',
    role: 'legacy_archive',
    authority: 'legacy',
    notes: 'Plan-named web emergency archive. Not runtime authority. Path may be absent.',
  }),
  Object.freeze({
    path: 'swissknife/web/cleanup-archive',
    role: 'legacy_archive',
    authority: 'legacy',
    notes: 'Plan-named web cleanup archive. Not runtime authority. Path may be absent.',
  }),
  Object.freeze({
    path: 'swissknife/config/archive',
    role: 'legacy_archive',
    authority: 'legacy',
    notes: 'Archived Jest/config variants. Not runtime authority.',
  }),
  Object.freeze({
    path: 'swissknife/test/archived',
    role: 'legacy_archive',
    authority: 'legacy',
    notes: 'Archived tests. Not runtime authority.',
  }),
  Object.freeze({
    path: 'swissknife/web/src',
    role: 'superseded_entry',
    authority: 'legacy',
    notes: 'Older web/src implementations do not replace the live index/main-simple path.',
  }),
  Object.freeze({
    path: 'swissknife/web/js/main.js',
    role: 'runtime_registration',
    authority: 'legacy',
    notes: 'Older registration map. Recorded as duplication, not selected over main-simple.',
  }),
  Object.freeze({
    path: 'swissknife/web/js/main-working.js',
    role: 'superseded_entry',
    authority: 'legacy',
    notes: 'Working/main variant. Not the live entry.',
  }),
  Object.freeze({
    path: 'swissknife/src/services/mcp/virtual-desktop-live-gateway.ts',
    role: 'not_authorization_authority',
    authority: 'not_authorization_authority',
    notes: 'May synthesize a browser-side allow from consent. Not authorization authority.',
  }),
] as const satisfies readonly SurfaceDescriptor[]);

const DISPLAYED_ACTIONS = Object.freeze([
  Object.freeze({
    data_action: 'refresh',
    action_id: 'action:refresh',
    method: 'ui.refresh',
    requires_confirmation: false,
    is_destructive: false,
    governed: false,
  }),
  Object.freeze({
    data_action: 'empty',
    action_id: 'action:empty',
    method: 'ui.empty',
    requires_confirmation: false,
    is_destructive: false,
    governed: false,
  }),
  Object.freeze({
    data_action: 'error',
    action_id: 'action:error',
    method: 'ui.error',
    requires_confirmation: false,
    is_destructive: false,
    governed: false,
  }),
  Object.freeze({
    data_action: 'submit-steering',
    action_id: 'action:submit-steering',
    method: 'supervisor.prompt-steering.request',
    requires_confirmation: true,
    is_destructive: false,
    governed: true,
  }),
  Object.freeze({
    data_action: 'recover-steering',
    action_id: 'action:recover-steering',
    method: 'ui.recover-steering',
    requires_confirmation: false,
    is_destructive: false,
    governed: false,
  }),
  Object.freeze({
    data_action: 'submit-dispatch',
    action_id: 'action:submit-dispatch',
    method: 'supervisor.task-control.request',
    requires_confirmation: true,
    is_destructive: false,
    governed: true,
  }),
  Object.freeze({
    data_action: 'persist-receipt',
    action_id: 'action:persist-receipt',
    method: 'supervisor.receipts.persist',
    requires_confirmation: true,
    is_destructive: false,
    governed: true,
  }),
  Object.freeze({
    data_action: 'retrieve-receipt-content',
    action_id: 'action:retrieve-receipt-content',
    method: 'supervisor.content.retrieve',
    requires_confirmation: false,
    is_destructive: false,
    governed: true,
  }),
  Object.freeze({
    data_action: 'checkpoint-receipt',
    action_id: 'action:checkpoint-receipt',
    method: 'supervisor.event-dag.checkpoint',
    requires_confirmation: true,
    is_destructive: false,
    governed: true,
  }),
] as const);

const UNMEASURED_LIVE_METRICS = Object.freeze([
  'accessibility_violation_count',
  'accessibility_critical_count',
  'accessibility_serious_count',
  'unlabeled_control_count',
  'keyboard_unreachable_count',
  'focus_order_failure_count',
  'focus_trap_failure_count',
  'duplicate_id_count',
  'contrast_failure_count',
  'horizontal_overflow_count',
  'clipping_count',
  'viewport_overflow_count',
  'interaction_step_count',
  'keyboard_step_count',
  'required_action_unreachable_count',
  'confirmation_failure_count',
  'policy_violation_count',
  'security_violation_count',
  'test_failure_count',
  'pixel_diff_percent',
  'structural_diff_percent',
  'unexpected_layout_shift_count',
  'screenshot_width',
  'screenshot_height',
  'missing_control_count',
  'extra_control_count',
  'automated_pass_count',
] as const satisfies readonly ObjectiveMetricId[]);

// ---------------------------------------------------------------------------
// Wire records
// ---------------------------------------------------------------------------

export interface SourceInventoryEntry {
  readonly path: string;
  readonly role: SurfaceRole;
  readonly authority: SurfaceAuthority;
  readonly exists: boolean;
  readonly kind: 'file' | 'directory' | 'missing';
  readonly digest: string | null;
  readonly byte_length: number | null;
  readonly scanned: boolean;
  readonly notes: string;
}

export interface RegistrationDivergence {
  readonly canonical_manifest_path: string;
  readonly runtime_projection_path: string;
  readonly additional_runtime_maps: readonly string[];
  readonly canonical_component: string | null;
  readonly runtime_component: string | null;
  readonly components_match: boolean;
  readonly silently_selected_one: false;
  readonly counts_derived_from_source: true;
  readonly canonical_application_definition_count: number;
  readonly runtime_registration_count: number;
  readonly notes: string;
}

export interface InvalidationReceipt {
  readonly interface: typeof UI_INVALIDATION_PLAN_INTERFACE;
  readonly schema_version: typeof UI_INVALIDATION_PLAN_SCHEMA;
  readonly planner_interface: typeof UI_INVALIDATION_PLANNER_INTERFACE;
  readonly planner_version: typeof UI_INVALIDATION_PLANNER_VERSION;
  readonly change_set_id: string;
  readonly plan_id: string;
  readonly reasons: readonly string[];
  readonly affected_check_ids: readonly string[];
  readonly affected_component_ids: readonly string[];
  readonly fallback_triggered: boolean;
  readonly confidence: string;
  readonly verification_status: 'unverified';
  readonly executed_code: false;
}

export interface EvaluatorReceipt {
  readonly interface: typeof GUI_OBJECTIVE_EVALUATOR_INTERFACE;
  readonly schema_version: typeof GUI_OBJECTIVE_EVALUATOR_SCHEMA;
  readonly evaluator_version: typeof GUI_OBJECTIVE_EVALUATOR_VERSION;
  readonly objective_id: ObjectiveMetricId;
  readonly decision: AcceptanceDecision;
  readonly unknown_critical_evidence: true;
  readonly automatic_acceptance_blocked: true;
  readonly reason_codes: readonly AcceptanceReasonCode[];
  readonly verification_status: 'unverified';
  readonly executed_code: false;
}

export interface InvariantReceipt {
  readonly interface: 'UiInvariantEngine@1';
  readonly schema_version: 'ui-invariant-engine/v1';
  readonly invoked: false;
  readonly solver_claimed_available: false;
  readonly capability_gap: 'python-ui-invariant-engine-not-invoked-from-static-target';
  readonly verification_status: 'unverified';
  readonly executed_code: false;
}

export interface ScanReceipt {
  readonly interface: typeof GUI_STATIC_SCANNER_INTERFACE;
  readonly schema_version: typeof GUI_STATIC_SCAN_RESULT_SCHEMA;
  readonly extractor_version: string;
  readonly sources: readonly string[];
  readonly finding_count: number;
  readonly edge_count: number;
  readonly finding_kind_counts: Readonly<Record<string, number>>;
  readonly relation_counts: Readonly<Record<string, number>>;
  readonly analysis_classification: GuiAnalysisClassification;
  readonly verification_status: GuiVerificationStatus;
  readonly completeness_boundary: GuiCompletenessBoundary;
  readonly unresolved: readonly string[];
  readonly executed_code: false;
}

export interface GraphReceipt {
  readonly interface: typeof UI_COMPONENT_GRAPH_INTERFACE;
  readonly schema_version: typeof UI_COMPONENT_GRAPH_SCHEMA;
  readonly extractor_version: typeof UI_COMPONENT_GRAPH_EXTRACTOR_VERSION;
  readonly accepted_vgo_002_task_cid: string;
  readonly node_count: number;
  readonly edge_count: number;
  readonly relation_counts: Readonly<Record<string, number>>;
  readonly unresolved_count: number;
  readonly unresolved: readonly string[];
  readonly analysis_classification: GuiAnalysisClassification;
  readonly verification_status: GuiVerificationStatus;
  readonly completeness_boundary: GuiCompletenessBoundary;
  readonly validation_ok: boolean;
  readonly validation_issue_codes: readonly string[];
  readonly completion_receipt_issued: boolean;
  readonly executed_code: false;
}

export interface StateReceipt {
  readonly interface: typeof UI_STATE_MACHINE_INTERFACE;
  readonly schema_version: typeof UI_STATE_MACHINE_SCHEMA;
  readonly extractor_version: typeof UI_STATE_MACHINE_EXTRACTOR_VERSION;
  readonly machine_id: string;
  readonly initial_state_id: string;
  readonly state_count: number;
  readonly event_count: number;
  readonly transition_count: number;
  readonly reachable_state_count: number;
  readonly unreachable_state_count: number;
  readonly state_kind_counts: Readonly<Record<string, number>>;
  readonly async_effect_count: number;
  readonly incomplete_async_effect_count: number;
  readonly violation_count: number;
  readonly violations: readonly {
    readonly code: string;
    readonly subject_id: string;
    readonly message: string;
  }[];
  readonly unresolved: readonly string[];
  readonly analysis_classification: GuiAnalysisClassification;
  readonly completeness_boundary: GuiCompletenessBoundary;
  readonly executed_code: false;
}

export interface CapsuleReceipt {
  readonly interface: typeof UI_SEMANTIC_CAPSULE_INTERFACE;
  readonly capsule_id: string;
  readonly qualified_name: string;
  readonly analysis_classification: GuiAnalysisClassification;
  readonly verification_status: GuiVerificationStatus;
  readonly completeness_boundary: GuiCompletenessBoundary;
  readonly source_revision: string;
  readonly unresolved_dynamic_behavior: readonly string[];
  readonly known_violation_ids: readonly string[];
  readonly confirmation_required: boolean;
}

export interface PolicyReceipt {
  readonly interface: typeof UI_POLICY_BINDING_REPORT_INTERFACE;
  readonly validator_interface: typeof UI_POLICY_BINDING_VALIDATOR_INTERFACE;
  readonly validator_version: typeof UI_POLICY_BINDING_VALIDATOR_VERSION;
  readonly action_count: number;
  readonly confirmation_binding_count: number;
  readonly unresolved_action_ids: readonly string[];
  readonly review_required_action_ids: readonly string[];
  readonly reason_codes: readonly UiPolicyBindingReasonCode[];
  readonly violation_count: number;
  readonly acceptance_outcome: UiPolicyAcceptanceOutcome;
  readonly automatic_acceptance_blocked: boolean;
  readonly ui_visibility_authorizes: false;
  readonly browser_policy_authoritative: false;
}

export interface BaselineViolation {
  readonly code: string;
  readonly message: string;
  readonly subject_id: string;
  readonly path: string | null;
  readonly evidence_level: BaselineViolationEvidenceLevel;
  readonly verification_status: GuiVerificationStatus;
  readonly source_supported: boolean;
}

export interface KnownPreChangeFailure {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly evidence_level: BaselineViolationEvidenceLevel;
  readonly verification_status: 'unverified';
  readonly source_supported: boolean;
  readonly live_confirmed: false;
}

export interface UnearnedClaimBoundary {
  readonly verified_live_accessibility: false;
  readonly verified_live_visual: false;
  readonly verified_live_interaction: false;
  readonly verified_authorization: false;
  readonly verified_wcag: false;
  readonly verified_complete_security: false;
  readonly pixel_change_is_neutral_observation: true;
  readonly ui_visibility_authorizes: false;
  readonly browser_policy_authoritative: false;
  readonly executed_code: false;
}

export interface DependencyInventory {
  readonly sources: readonly string[];
  readonly tests: readonly string[];
  readonly actions: readonly string[];
  readonly styles: readonly string[];
}

export interface UiSemanticBaseline {
  readonly interface: typeof UI_SEMANTIC_BASELINE_INTERFACE;
  readonly schema_version: typeof UI_SEMANTIC_BASELINE_SCHEMA;
  readonly extractor_interface: typeof AGENT_SUPERVISOR_TARGET_INTERFACE;
  readonly extractor_schema_version: typeof AGENT_SUPERVISOR_TARGET_SCHEMA;
  readonly extractor_version: typeof AGENT_SUPERVISOR_TARGET_VERSION;
  readonly canonical_json_profile: typeof CANONICAL_JSON_PROFILE;
  readonly task_id: 'VGO-062';
  readonly baseline_id: string;
  readonly application_identity: GuiApplicationIdentity;
  readonly screen_identity: GuiScreenIdentity;
  readonly component_identities: readonly UiComponentIdentity[];
  readonly live_target: SourceInventoryEntry;
  readonly surfaces: readonly SourceInventoryEntry[];
  readonly source_inventory: readonly SourceInventoryEntry[];
  readonly registration_divergence: RegistrationDivergence;
  readonly scan_receipt: ScanReceipt;
  readonly graph_receipt: GraphReceipt;
  readonly state_receipt: StateReceipt;
  readonly capsule_receipt: CapsuleReceipt;
  readonly policy_receipt: PolicyReceipt;
  readonly invalidation_receipt: InvalidationReceipt;
  readonly evaluator_receipt: EvaluatorReceipt;
  readonly invariant_receipt: InvariantReceipt;
  readonly dependencies: DependencyInventory;
  readonly violations: readonly BaselineViolation[];
  readonly unresolved_dynamics: readonly string[];
  readonly known_pre_change_failures: readonly KnownPreChangeFailure[];
  readonly unmeasured_live_metrics: readonly ObjectiveMetricId[];
  readonly claim_boundary: UnearnedClaimBoundary;
  readonly completeness_boundary: GuiCompletenessBoundary;
  readonly analysis_classification: GuiAnalysisClassification;
  readonly verification_status: GuiVerificationStatus;
  readonly repository_revision: string;
  readonly executed_code: false;
  readonly ui_baseline: UiBaseline;
  readonly metric_snapshot: UiMetricSnapshot;
  readonly baseline_digest: string;
  readonly baseline_cid: string;
}

export interface AgentSupervisorTargetOptions {
  readonly repositoryRoot?: string;
}

export interface AgentSupervisorTarget {
  readonly interface: typeof AGENT_SUPERVISOR_TARGET_INTERFACE;
  readonly schema_version: typeof AGENT_SUPERVISOR_TARGET_SCHEMA;
  readonly extractorVersion: typeof AGENT_SUPERVISOR_TARGET_VERSION;
  readonly liveTargetPath: typeof AGENT_SUPERVISOR_LIVE_TARGET_PATH;
  record(options?: AgentSupervisorTargetOptions): UiSemanticBaseline;
}

export class AgentSupervisorTargetError extends Error {
  readonly name = 'AgentSupervisorTargetError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Path / IO helpers (never execute source)
// ---------------------------------------------------------------------------

export function resolveRepositoryRoot(explicit?: string): string {
  if (explicit) {
    const live = join(explicit, AGENT_SUPERVISOR_LIVE_TARGET_PATH);
    if (!existsSync(live)) {
      throw new AgentSupervisorTargetError(
        `repositoryRoot does not contain ${AGENT_SUPERVISOR_LIVE_TARGET_PATH}`,
      );
    }
    return explicit;
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 16; i += 1) {
    if (existsSync(join(dir, AGENT_SUPERVISOR_LIVE_TARGET_PATH))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new AgentSupervisorTargetError(
    `unable to resolve repository root containing ${AGENT_SUPERVISOR_LIVE_TARGET_PATH}`,
  );
}

function absoluteFromRepo(root: string, relative: string): string {
  return join(root, ...relative.split('/'));
}

function readRepoText(root: string, relative: string): string {
  return readFileSync(absoluteFromRepo(root, relative), 'utf8');
}

function inventoryEntry(
  root: string,
  descriptor: SurfaceDescriptor,
  scanned: boolean,
): SourceInventoryEntry {
  const abs = absoluteFromRepo(root, descriptor.path);
  if (!existsSync(abs)) {
    return Object.freeze({
      path: descriptor.path,
      role: descriptor.role,
      authority: descriptor.authority,
      exists: false,
      kind: 'missing',
      digest: null,
      byte_length: null,
      scanned: false,
      notes: descriptor.notes,
    });
  }
  const stat = statSync(abs);
  if (stat.isDirectory()) {
    return Object.freeze({
      path: descriptor.path,
      role: descriptor.role,
      authority: descriptor.authority,
      exists: true,
      kind: 'directory',
      digest: null,
      byte_length: null,
      scanned: false,
      notes: descriptor.notes,
    });
  }
  const bytes = readFileSync(abs);
  return Object.freeze({
    path: descriptor.path,
    role: descriptor.role,
    authority: descriptor.authority,
    exists: true,
    kind: 'file',
    digest: sha256Digest(bytes),
    byte_length: bytes.byteLength,
    scanned,
    notes: descriptor.notes,
  });
}

function firstMatchLine(content: string, pattern: RegExp): number | null {
  const match = pattern.exec(content);
  if (!match || match.index === undefined) return null;
  return content.slice(0, match.index).split('\n').length;
}

// ---------------------------------------------------------------------------
// Canonical JSON / decode
// ---------------------------------------------------------------------------

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AgentSupervisorTargetError(
        'canonical JSON rejects non-finite numbers',
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new AgentSupervisorTargetError(
    `canonical JSON cannot encode ${typeof value}`,
  );
}

function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = record[key];
  }
  return out;
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return sortRecord(counts);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function applicationIdentityDict(): Record<string, unknown> {
  return {
    interface: GUI_APPLICATION_IDENTITY_INTERFACE,
    schema_version: GUI_APPLICATION_IDENTITY_SCHEMA,
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    package_namespace: AGENT_SUPERVISOR_PACKAGE_NAMESPACE,
    display_name: AGENT_SUPERVISOR_DISPLAY_NAME,
    repository_root: 'swissknife',
  };
}

function screenIdentityDict(): Record<string, unknown> {
  return {
    interface: GUI_SCREEN_IDENTITY_INTERFACE,
    schema_version: GUI_SCREEN_IDENTITY_SCHEMA,
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    route_id: AGENT_SUPERVISOR_ROUTE_ID,
  };
}

function componentIdentityDict(
  identity: UiComponentIdentity,
): Record<string, unknown> {
  return {
    interface: identity.interface,
    schema_version: identity.schema_version,
    application_id: identity.application_id,
    screen_id: identity.screen_id,
    qualified_name: identity.qualified_name,
    component_kind: identity.component_kind,
    package_namespace: identity.package_namespace,
  };
}

function makeComponentIdentity(
  qualifiedName: string,
  componentKind: GuiComponentKind,
): UiComponentIdentity {
  return decodeUiComponentIdentity({
    interface: UI_COMPONENT_IDENTITY_INTERFACE,
    schema_version: UI_COMPONENT_IDENTITY_SCHEMA,
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    qualified_name: qualifiedName,
    component_kind: componentKind,
    package_namespace: AGENT_SUPERVISOR_PACKAGE_NAMESPACE,
  });
}

function findingComponentKind(kind: GuiFindingKind): GuiComponentKind | null {
  if (COMPONENT_KIND_SET.has(kind)) return kind as GuiComponentKind;
  if (kind === 'component') return 'composite';
  if (kind === 'host_boundary') return 'host_boundary';
  return null;
}

// ---------------------------------------------------------------------------
// Source-supported extraction
// ---------------------------------------------------------------------------

function extractRegistrationDivergence(
  root: string,
): RegistrationDivergence {
  const manifestPath = 'swissknife/src/services/apps/virtual-desktop-app-manifest.ts';
  const runtimePath = 'swissknife/web/js/main-simple.js';
  const extraPath = 'swissknife/web/js/main.js';
  const manifest = existsSync(absoluteFromRepo(root, manifestPath))
    ? readRepoText(root, manifestPath)
    : '';
  const runtime = existsSync(absoluteFromRepo(root, runtimePath))
    ? readRepoText(root, runtimePath)
    : '';
  const extraExists = existsSync(absoluteFromRepo(root, extraPath));

  const manifestComponent = /id:\s*'agent-supervisor'[\s\S]{0,400}?component:\s*'([^']+)'/.exec(
    manifest,
  )?.[1] ?? null;
  const runtimeComponent =
    /this\.apps\.set\('agent-supervisor',\s*\{[\s\S]{0,240}?component:\s*'([^']+)'/.exec(
      runtime,
    )?.[1] ?? null;
  const canonicalApplicationDefinitionCount = countSourceOccurrences(
    manifest,
    /\bapp\(\{/g,
  );
  const runtimeRegistrationCount = countSourceOccurrences(
    runtime,
    /this\.apps\.set\('/g,
  );

  return Object.freeze({
    canonical_manifest_path: manifestPath,
    runtime_projection_path: runtimePath,
    additional_runtime_maps: Object.freeze(extraExists ? [extraPath] : []),
    canonical_component: manifestComponent,
    runtime_component: runtimeComponent,
    components_match:
      manifestComponent !== null &&
      runtimeComponent !== null &&
      manifestComponent === runtimeComponent,
    silently_selected_one: false as const,
    counts_derived_from_source: true as const,
    canonical_application_definition_count: canonicalApplicationDefinitionCount,
    runtime_registration_count: runtimeRegistrationCount,
    notes:
      'Canonical manifest and runtime projection are both recorded. Application and registry counts are derived from committed source categories rather than copied from plan prose. Divergence is reported rather than silently selecting one.',
  });
}

function countSourceOccurrences(content: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = content.match(new RegExp(pattern.source, flags));
  return matches ? matches.length : 0;
}

function extractDisplayedActions(
  liveContent: string,
): {
  bindings: UiActionBinding[];
  evidence: UiActionBindingEvidence[];
  actions: string[];
} {
  const bindings: UiActionBinding[] = [];
  const evidence: UiActionBindingEvidence[] = [];
  const actions: string[] = [];
  for (const spec of DISPLAYED_ACTIONS) {
    const needle = `data-action="${spec.data_action}"`;
    if (!liveContent.includes(needle)) continue;
    const line = firstMatchLine(liveContent, new RegExp(needle)) ?? 1;
    const confirmationId = spec.requires_confirmation
      ? `confirm:${spec.data_action}`
      : '';
    bindings.push(
      makeUiActionBinding({
        action_id: spec.action_id,
        method: spec.method,
        schema_id: AGENT_SUPERVISOR_CONTRACT_SCHEMA,
        requires_confirmation: spec.requires_confirmation,
        confirmation_id: confirmationId,
        policy_id: spec.governed ? 'policy:agent-supervisor-console' : '',
        depends_on_schema: spec.governed,
        is_destructive: spec.is_destructive,
        component_id: AGENT_SUPERVISOR_COMPONENT_NAME,
      }),
    );
    evidence.push({
      action_id: spec.action_id,
      contract_reference: AGENT_SUPERVISOR_CONTRACT_SCHEMA_REF,
      source_span: makeSourceSpan({
        path: AGENT_SUPERVISOR_LIVE_TARGET_PATH,
        start_line: line,
        start_column: 0,
        end_line: line,
        end_column: needle.length,
      }),
      resolution: 'exact',
      candidate_targets: Object.freeze([
        {
          method: spec.method,
          schema_id: AGENT_SUPERVISOR_CONTRACT_SCHEMA,
        },
      ]),
    });
    actions.push(spec.action_id);
  }
  return { bindings, evidence, actions };
}

function extractStyleDependencies(liveContent: string): readonly string[] {
  const styles: string[] = [];
  if (
    liveContent.includes('renderStyles()') ||
    liveContent.includes('.agent-supervisor {')
  ) {
    styles.push(`${AGENT_SUPERVISOR_LIVE_TARGET_PATH}#embedded-css`);
  }
  return Object.freeze(styles);
}

function collectKnownPreChangeFailures(
  root: string,
  liveContent: string,
): readonly KnownPreChangeFailure[] {
  const failures: KnownPreChangeFailure[] = [];
  const push = (
    code: string,
    message: string,
    path: string,
    sourceSupported: boolean,
  ): void => {
    failures.push(
      Object.freeze({
        code,
        message,
        path,
        evidence_level: 'structural',
        verification_status: 'unverified',
        source_supported: sourceSupported,
        live_confirmed: false as const,
      }),
    );
  };

  if (liveContent.includes('root.outerHTML = this.renderRoot()')) {
    push(
      'outerhtml-root-replace-focus-risk',
      'update() replaces the entire root with outerHTML and then rebinds events; form or control focus can be lost across deterministic rerenders. Live focus loss is not claimed verified here.',
      AGENT_SUPERVISOR_LIVE_TARGET_PATH,
      true,
    );
  }
  if (liveContent.includes('aria-disabled="${canSubmit ? \'false\' : \'true\'}"')) {
    push(
      'aria-disabled-instead-of-native-disabled',
      'Steering and dispatch submit controls use aria-disabled where native disabled semantics may better match the dispatch guard. Live disabled-dispatch behavior is not claimed verified here.',
      AGENT_SUPERVISOR_LIVE_TARGET_PATH,
      true,
    );
  }
  if (
    !liveContent.includes('aria-invalid') &&
    !liveContent.includes('aria-describedby') &&
    !liveContent.includes('aria-errormessage')
  ) {
    push(
      'missing-field-error-association',
      'Steering and dispatch validation feedback is rendered but field-to-error association attributes are absent from the live source. Exact invalid-state semantics require live-DOM verification.',
      AGENT_SUPERVISOR_LIVE_TARGET_PATH,
      true,
    );
  }

  const playwrightPath =
    'swissknife/build-tools/configs/playwright.agent-supervisor.config.ts';
  if (existsSync(absoluteFromRepo(root, playwrightPath))) {
    const config = readRepoText(root, playwrightPath);
    if (!config.includes('agent-supervisor-console.spec.ts')) {
      push(
        'console-spec-not-discovered-by-reviewed-playwright-config',
        'The reviewed Agent Supervisor Playwright configuration does not include agent-supervisor-console.spec.ts. VGO-068 owns a dedicated optimizer configuration.',
        playwrightPath,
        true,
      );
    }
  }

  push(
    'existing-accessibility-coverage-is-not-live-dom-audit',
    'Existing all-app accessibility coverage is primarily simulator and heuristic based. It is not a live-DOM accessibility audit and is not WCAG certification.',
    AGENT_SUPERVISOR_LIVE_TARGET_PATH,
    false,
  );
  push(
    'existing-screenshots-are-not-pixel-diff-baseline',
    'Existing screenshots are evidence captures, not a complete pixel-diff baseline. Synthetic deterministic PNG fixtures must never be reported as browser screenshots.',
    AGENT_SUPERVISOR_LIVE_TARGET_PATH,
    false,
  );

  if (
    liveContent.includes('data-steering-confirm') ||
    liveContent.includes('data-dispatch-confirm') ||
    liveContent.includes('data-receipt-operation-confirm')
  ) {
    push(
      'static-confirmation-is-not-argument-digest-bound',
      'The live source has confirmation checkboxes for steering, dispatch, and receipt writes, but static extraction cannot bind those confirmations to a current argument digest. Exact confirmation remains a live host obligation.',
      AGENT_SUPERVISOR_LIVE_TARGET_PATH,
      true,
    );
  }

  push(
    'python-ui-invariant-engine-not-invoked',
    'The VGO-021 UiInvariantEngine lives in Python. This TypeScript target does not spawn that engine or any solver and does not claim prover availability in the sealed validation environment.',
    AGENT_SUPERVISOR_LIVE_TARGET_PATH,
    false,
  );

  failures.sort((a, b) => a.code.localeCompare(b.code));
  return Object.freeze(failures);
}

function collectBaselineViolations(
  state: UiStateMachine,
  known: readonly KnownPreChangeFailure[],
): readonly BaselineViolation[] {
  const violations: BaselineViolation[] = state.violations.map(item =>
    Object.freeze({
      code: item.code,
      message: item.message,
      subject_id: item.subject_id,
      path: AGENT_SUPERVISOR_LIVE_TARGET_PATH,
      evidence_level: 'structural' as const,
      verification_status: 'unverified' as const,
      source_supported: true,
    }),
  );
  for (const failure of known) {
    violations.push(
      Object.freeze({
        code: failure.code,
        message: failure.message,
        subject_id: failure.code,
        path: failure.path,
        evidence_level: failure.evidence_level,
        verification_status: failure.verification_status,
        source_supported: failure.source_supported,
      }),
    );
  }
  violations.sort((a, b) => {
    const byCode = a.code.localeCompare(b.code);
    if (byCode !== 0) return byCode;
    return a.subject_id.localeCompare(b.subject_id);
  });
  return Object.freeze(violations);
}

function collectUnresolvedDynamics(
  scan: GuiStaticScanResult,
  graph: UiComponentGraph,
  state: UiStateMachine,
  capsule: UiSemanticCapsule,
): readonly string[] {
  return uniqueSorted([
    ...scan.unresolved,
    ...graph.unresolved,
    ...state.unresolved,
    ...capsule.unresolved_dynamic_behavior,
  ]);
}

function deriveCompleteness(
  classification: GuiAnalysisClassification,
  unresolved: readonly string[],
  violations: readonly BaselineViolation[],
): GuiCompletenessBoundary {
  if (classification === 'opaque') return 'unknown';
  if (
    unresolved.length > 0 ||
    violations.length > 0 ||
    classification !== 'exact'
  ) {
    return 'partial';
  }
  return 'complete_within_boundary';
}

function measuredMetrics(input: {
  unresolvedCount: number;
  invariantCount: number;
  incompleteAsync: number;
  unsupportedCount: number;
  actionBindingInvalidCount: number;
}): UiMetricSnapshot {
  const metrics = emptyMetricValues();
  metrics.unresolved_observation_count = input.unresolvedCount;
  metrics.invariant_violation_count = input.invariantCount;
  metrics.missing_loading_error_behavior_count = input.incompleteAsync;
  metrics.unsupported_check_count = input.unsupportedCount;
  metrics.action_binding_invalid_count = input.actionBindingInvalidCount;
  return makeUiMetricSnapshot(metrics);
}

function scanReceiptFrom(scan: GuiStaticScanResult): ScanReceipt {
  return Object.freeze({
    interface: scan.interface,
    schema_version: scan.schema_version,
    extractor_version: scan.extractor_version,
    sources: Object.freeze([...scan.sources]),
    finding_count: scan.findings.length,
    edge_count: scan.edges.length,
    finding_kind_counts: Object.freeze(
      countBy(scan.findings.map(finding => finding.kind)),
    ),
    relation_counts: Object.freeze(
      countBy(scan.edges.map(edge => edge.relation)),
    ),
    analysis_classification: scan.analysis_classification,
    verification_status: scan.verification_status,
    completeness_boundary: scan.completeness_boundary,
    unresolved: Object.freeze([...scan.unresolved]),
    executed_code: false as const,
  });
}

function graphReceiptFrom(graph: UiComponentGraph): GraphReceipt {
  const validation = validateUiComponentGraph(graph);
  return Object.freeze({
    interface: graph.interface,
    schema_version: graph.schema_version,
    extractor_version: graph.extractor_version,
    accepted_vgo_002_task_cid: graph.accepted_vgo_002_task_cid,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    relation_counts: Object.freeze(
      countBy(graph.edges.map(edge => edge.relation as GuiDependencyRelation)),
    ),
    unresolved_count: graph.unresolved.length,
    unresolved: Object.freeze([...graph.unresolved]),
    analysis_classification: graph.analysis_classification,
    verification_status: graph.verification_status,
    completeness_boundary: graph.completeness_boundary,
    validation_ok: validation.ok,
    validation_issue_codes: uniqueSorted(validation.issues.map(issue => issue.code)),
    completion_receipt_issued: false,
    executed_code: false as const,
  });
}

function stateReceiptFrom(state: UiStateMachine): StateReceipt {
  return Object.freeze({
    interface: state.interface,
    schema_version: state.schema_version,
    extractor_version: state.extractor_version,
    machine_id: state.machine_id,
    initial_state_id: state.initial_state_id,
    state_count: state.states.length,
    event_count: state.events.length,
    transition_count: state.transitions.length,
    reachable_state_count: state.reachability.reachable_state_ids.length,
    unreachable_state_count: state.reachability.unreachable_state_ids.length,
    state_kind_counts: Object.freeze(
      countBy(state.states.map(item => item.kind as UiStateKind)),
    ),
    async_effect_count: state.async_effects.length,
    incomplete_async_effect_count: state.async_effects.filter(
      effect => !effect.complete,
    ).length,
    violation_count: state.violations.length,
    violations: Object.freeze(
      state.violations.map(item =>
        Object.freeze({
          code: item.code,
          subject_id: item.subject_id,
          message: item.message,
        }),
      ),
    ),
    unresolved: Object.freeze([...state.unresolved]),
    analysis_classification: state.analysis_classification,
    completeness_boundary: state.completeness_boundary,
    executed_code: false as const,
  });
}

function capsuleReceiptFrom(capsule: UiSemanticCapsule): CapsuleReceipt {
  return Object.freeze({
    interface: capsule.interface,
    capsule_id: capsule.capsule_id,
    qualified_name: capsule.stable_identity.qualified_name,
    analysis_classification: capsule.analysis_classification,
    verification_status: capsule.verification_status,
    completeness_boundary: capsule.completeness_boundary,
    source_revision: capsule.source_revision,
    unresolved_dynamic_behavior: Object.freeze([
      ...capsule.unresolved_dynamic_behavior,
    ]),
    known_violation_ids: Object.freeze([...capsule.known_violation_ids]),
    confirmation_required: capsule.confirmation_required,
  });
}

function policyReceiptFrom(report: UiPolicyBindingReport): PolicyReceipt {
  return Object.freeze({
    interface: report.interface,
    validator_interface: report.validator_interface,
    validator_version: report.validator_version,
    action_count: report.action_bindings.length,
    confirmation_binding_count: report.confirmation_bindings.length,
    unresolved_action_ids: Object.freeze([...report.unresolved_action_ids]),
    review_required_action_ids: Object.freeze([
      ...report.review_required_action_ids,
    ]),
    reason_codes: Object.freeze([...report.reason_codes]),
    violation_count: report.violations.length,
    acceptance_outcome: report.acceptance_outcome,
    automatic_acceptance_blocked: report.automatic_acceptance_blocked,
    ui_visibility_authorizes: false as const,
    browser_policy_authoritative: false as const,
  });
}

const INVALIDATION_IDENTIFIER_RE =
  /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;

function invalidationReceiptFrom(
  plan: UiInvalidationPlan,
): InvalidationReceipt {
  return Object.freeze({
    interface: plan.interface,
    schema_version: plan.schema_version,
    planner_interface: UI_INVALIDATION_PLANNER_INTERFACE,
    planner_version: UI_INVALIDATION_PLANNER_VERSION,
    change_set_id: plan.change_set_id,
    plan_id: plan.plan_id,
    reasons: uniqueSorted(plan.reasons),
    affected_check_ids: uniqueSorted(plan.affected_check_ids),
    affected_component_ids: uniqueSorted(plan.affected_component_ids),
    fallback_triggered: plan.fallback_triggered,
    confidence: plan.confidence,
    verification_status: 'unverified' as const,
    executed_code: false as const,
  });
}

function evaluatorReceiptFrom(input: {
  decision: AcceptanceDecision;
  reasonCodes: readonly AcceptanceReasonCode[];
  objectiveId: ObjectiveMetricId;
}): EvaluatorReceipt {
  return Object.freeze({
    interface: GUI_OBJECTIVE_EVALUATOR_INTERFACE,
    schema_version: GUI_OBJECTIVE_EVALUATOR_SCHEMA,
    evaluator_version: GUI_OBJECTIVE_EVALUATOR_VERSION,
    objective_id: input.objectiveId,
    decision: input.decision,
    unknown_critical_evidence: true as const,
    automatic_acceptance_blocked: true as const,
    reason_codes: uniqueSorted(input.reasonCodes) as readonly AcceptanceReasonCode[],
    verification_status: 'unverified' as const,
    executed_code: false as const,
  });
}

function invariantReceipt(): InvariantReceipt {
  return Object.freeze({
    interface: 'UiInvariantEngine@1',
    schema_version: 'ui-invariant-engine/v1',
    invoked: false as const,
    solver_claimed_available: false as const,
    capability_gap:
      'python-ui-invariant-engine-not-invoked-from-static-target' as const,
    verification_status: 'unverified' as const,
    executed_code: false as const,
  });
}

function planBaselineInvalidation(input: {
  graph: UiComponentGraph;
  actions: readonly string[];
  unresolved: readonly string[];
}): UiInvalidationPlan {
  const validActions = input.actions.filter(id =>
    INVALIDATION_IDENTIFIER_RE.test(id),
  );
  return planUiInvalidation(
    makeUiChangeSet({
      change_set_id: 'changeset:agent-supervisor-semantic-baseline',
      change_kinds: [
        'component_implementation',
        'state_machine',
        'css_design_token',
        'action_binding',
      ],
      file_paths: [AGENT_SUPERVISOR_LIVE_TARGET_PATH],
      component_ids: [AGENT_SUPERVISOR_COMPONENT_NAME],
      action_ids: validActions,
      summary:
        'Current live Agent Supervisor source identity used as the semantic baseline invalidation seed.',
    }),
    {
      planId: 'invalidation:agent-supervisor-semantic-baseline',
      context: {
        application_id: AGENT_SUPERVISOR_APPLICATION_ID,
        screen_id: AGENT_SUPERVISOR_SCREEN_ID,
        edges: input.graph.edges.map(edge => ({
          source_component_id: edge.source_component_id,
          target_component_id: edge.target_component_id,
          relation: edge.relation,
          confidence: edge.confidence,
        })),
        capsules: [
          {
            component_id: AGENT_SUPERVISOR_COMPONENT_NAME,
            action_binding_ids: validActions,
            test_ids: [
              'swissknife/test/e2e/agent-supervisor-console.spec.ts',
              'swissknife/test/e2e/agent-supervisor-goal-task-lifecycle.spec.ts',
            ],
          },
        ],
        known_component_ids: [AGENT_SUPERVISOR_COMPONENT_NAME],
        known_scenario_ids: Object.values(STABLE_SCENARIO_IDS),
        unresolved: input.unresolved,
        graph_confidence: input.graph.analysis_classification,
        missing_edges: input.graph.unresolved.length > 0,
      },
    },
  );
}

function collectComponentIdentities(
  scan: GuiStaticScanResult,
): readonly UiComponentIdentity[] {
  const identities = new Map<string, UiComponentIdentity>();
  const primary = makeComponentIdentity(
    AGENT_SUPERVISOR_COMPONENT_NAME,
    'screen',
  );
  identities.set(primary.qualified_name, primary);
  for (const finding of scan.findings) {
    const kind = findingComponentKind(finding.kind);
    if (kind === null) continue;
    const qualified = finding.stable_identity.replace(/\s+/g, '_');
    if (identities.has(qualified)) continue;
    try {
      identities.set(qualified, makeComponentIdentity(qualified, kind));
    } catch {
      // Scanner identities that are not closed wire identifiers stay
      // unresolved rather than aborting the baseline.
    }
  }
  return Object.freeze(
    [...identities.values()].sort((a, b) =>
      a.qualified_name.localeCompare(b.qualified_name),
    ),
  );
}

function sourceRevisionFromInventory(
  entries: readonly SourceInventoryEntry[],
): string {
  const payload = entries
    .filter(entry => entry.exists && entry.digest)
    .map(entry => ({ digest: entry.digest, path: entry.path }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return sha256Digest(canonicalJson(payload));
}

const CLAIM_BOUNDARY: UnearnedClaimBoundary = Object.freeze({
  verified_live_accessibility: false,
  verified_live_visual: false,
  verified_live_interaction: false,
  verified_authorization: false,
  verified_wcag: false,
  verified_complete_security: false,
  pixel_change_is_neutral_observation: true,
  ui_visibility_authorizes: false,
  browser_policy_authoritative: false,
  executed_code: false,
});

function walkForVerified(
  value: unknown,
  path: string,
  acc: string[],
): void {
  if (value === 'verified') {
    acc.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkForVerified(item, `${path}[${index}]`, acc);
    });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === 'claim_boundary' ||
        key === 'unearned_verified_claims' ||
        key === 'known_pre_change_failures'
      ) {
        continue;
      }
      walkForVerified(item, path ? `${path}.${key}` : key, acc);
    }
  }
}

/**
 * Returns JSON paths whose value is the unearned token `verified`.
 * Static extraction cannot earn verified status.
 */
export function collectUnearnedVerifiedClaims(value: unknown): readonly string[] {
  const acc: string[] = [];
  walkForVerified(value, '', acc);
  return Object.freeze(acc.sort((a, b) => a.localeCompare(b)));
}

export function assertNoUnearnedVerifiedClaims(value: unknown): void {
  const claims = collectUnearnedVerifiedClaims(value);
  if (claims.length > 0) {
    throw new AgentSupervisorTargetError(
      `unearned verified claim(s): ${claims.join(', ')}`,
    );
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) out[key] = sortKeysDeep(record[key]);
    }
    return out;
  }
  return value;
}

export function uiSemanticBaselineToDict(
  baseline: UiSemanticBaseline,
): Record<string, unknown> {
  return {
    analysis_classification: baseline.analysis_classification,
    application_identity: {
      application_id: baseline.application_identity.application_id,
      display_name: baseline.application_identity.display_name,
      interface: baseline.application_identity.interface,
      package_namespace: baseline.application_identity.package_namespace,
      repository_root: baseline.application_identity.repository_root,
      schema_version: baseline.application_identity.schema_version,
    },
    baseline_cid: baseline.baseline_cid,
    baseline_digest: baseline.baseline_digest,
    baseline_id: baseline.baseline_id,
    canonical_json_profile: baseline.canonical_json_profile,
    capsule_receipt: { ...baseline.capsule_receipt },
    claim_boundary: { ...baseline.claim_boundary },
    completeness_boundary: baseline.completeness_boundary,
    component_identities: baseline.component_identities.map(componentIdentityDict),
    dependencies: {
      actions: [...baseline.dependencies.actions],
      sources: [...baseline.dependencies.sources],
      styles: [...baseline.dependencies.styles],
      tests: [...baseline.dependencies.tests],
    },
    evaluator_receipt: {
      ...baseline.evaluator_receipt,
      reason_codes: [...baseline.evaluator_receipt.reason_codes],
    },
    executed_code: false,
    extractor_interface: baseline.extractor_interface,
    extractor_schema_version: baseline.extractor_schema_version,
    extractor_version: baseline.extractor_version,
    graph_receipt: {
      ...baseline.graph_receipt,
      relation_counts: { ...baseline.graph_receipt.relation_counts },
      unresolved: [...baseline.graph_receipt.unresolved],
      validation_issue_codes: [...baseline.graph_receipt.validation_issue_codes],
    },
    interface: baseline.interface,
    invalidation_receipt: {
      ...baseline.invalidation_receipt,
      affected_check_ids: [...baseline.invalidation_receipt.affected_check_ids],
      affected_component_ids: [
        ...baseline.invalidation_receipt.affected_component_ids,
      ],
      reasons: [...baseline.invalidation_receipt.reasons],
    },
    invariant_receipt: { ...baseline.invariant_receipt },
    known_pre_change_failures: baseline.known_pre_change_failures.map(item => ({
      ...item,
    })),
    live_target: { ...baseline.live_target },
    metric_snapshot: uiMetricSnapshotToDict(baseline.metric_snapshot),
    policy_receipt: {
      ...baseline.policy_receipt,
      reason_codes: [...baseline.policy_receipt.reason_codes],
      review_required_action_ids: [
        ...baseline.policy_receipt.review_required_action_ids,
      ],
      unresolved_action_ids: [...baseline.policy_receipt.unresolved_action_ids],
    },
    registration_divergence: {
      additional_runtime_maps: [
        ...baseline.registration_divergence.additional_runtime_maps,
      ],
      canonical_application_definition_count:
        baseline.registration_divergence.canonical_application_definition_count,
      canonical_component: baseline.registration_divergence.canonical_component,
      canonical_manifest_path:
        baseline.registration_divergence.canonical_manifest_path,
      components_match: baseline.registration_divergence.components_match,
      counts_derived_from_source:
        baseline.registration_divergence.counts_derived_from_source,
      notes: baseline.registration_divergence.notes,
      runtime_component: baseline.registration_divergence.runtime_component,
      runtime_projection_path:
        baseline.registration_divergence.runtime_projection_path,
      runtime_registration_count:
        baseline.registration_divergence.runtime_registration_count,
      silently_selected_one:
        baseline.registration_divergence.silently_selected_one,
    },
    repository_revision: baseline.repository_revision,
    scan_receipt: {
      ...baseline.scan_receipt,
      finding_kind_counts: { ...baseline.scan_receipt.finding_kind_counts },
      relation_counts: { ...baseline.scan_receipt.relation_counts },
      sources: [...baseline.scan_receipt.sources],
      unresolved: [...baseline.scan_receipt.unresolved],
    },
    schema_version: baseline.schema_version,
    screen_identity: {
      application_id: baseline.screen_identity.application_id,
      interface: baseline.screen_identity.interface,
      route_id: baseline.screen_identity.route_id,
      schema_version: baseline.screen_identity.schema_version,
      screen_id: baseline.screen_identity.screen_id,
    },
    source_inventory: baseline.source_inventory.map(entry => ({ ...entry })),
    state_receipt: {
      ...baseline.state_receipt,
      state_kind_counts: { ...baseline.state_receipt.state_kind_counts },
      unresolved: [...baseline.state_receipt.unresolved],
      violations: baseline.state_receipt.violations.map(item => ({ ...item })),
    },
    surfaces: baseline.surfaces.map(entry => ({ ...entry })),
    task_id: baseline.task_id,
    ui_baseline: uiBaselineToDict(baseline.ui_baseline),
    unmeasured_live_metrics: [...baseline.unmeasured_live_metrics],
    unresolved_dynamics: [...baseline.unresolved_dynamics],
    verification_status: baseline.verification_status,
    violations: baseline.violations.map(item => ({ ...item })),
  };
}

export function serializeUiSemanticBaseline(
  baseline: UiSemanticBaseline,
): string {
  return `${JSON.stringify(sortKeysDeep(uiSemanticBaselineToDict(baseline)), null, 2)}\n`;
}

/**
 * Durable evidence subset: identities, live/canonical/legacy inventory,
 * scanner/graph/state receipt constraints, violations, and claim boundary.
 * Scan counts and content digests are recomputed by the compiler and are
 * asserted in tests rather than frozen as unearned golden numbers.
 */
export function semanticBaselineEvidenceView(
  baseline: UiSemanticBaseline,
): Record<string, unknown> {
  return {
    analysis_classification_is_closed: [
      'exact',
      'conservative',
      'heuristic',
      'opaque',
    ].includes(baseline.analysis_classification),
    application_identity: {
      application_id: baseline.application_identity.application_id,
      display_name: baseline.application_identity.display_name,
      interface: baseline.application_identity.interface,
      package_namespace: baseline.application_identity.package_namespace,
      repository_root: baseline.application_identity.repository_root,
      schema_version: baseline.application_identity.schema_version,
    },
    canonical_json_profile: baseline.canonical_json_profile,
    claim_boundary: { ...baseline.claim_boundary },
    completeness_boundary_is_closed: [
      'complete_within_boundary',
      'partial',
      'best_effort',
      'unknown',
    ].includes(baseline.completeness_boundary),
    component_identity_qualified_names: baseline.component_identities
      .map(identity => identity.qualified_name)
      .filter(name => name === AGENT_SUPERVISOR_COMPONENT_NAME),
    dependencies: {
      actions: [...baseline.dependencies.actions],
      sources: [...baseline.dependencies.sources],
      styles: [...baseline.dependencies.styles],
      tests: [...baseline.dependencies.tests],
    },
    evaluator_receipt: {
      automatic_acceptance_blocked:
        baseline.evaluator_receipt.automatic_acceptance_blocked,
      executed_code: baseline.evaluator_receipt.executed_code,
      interface: baseline.evaluator_receipt.interface,
      unknown_critical_evidence:
        baseline.evaluator_receipt.unknown_critical_evidence,
      verification_status: baseline.evaluator_receipt.verification_status,
    },
    executed_code: baseline.executed_code,
    extractor_interface: baseline.extractor_interface,
    extractor_schema_version: baseline.extractor_schema_version,
    extractor_version: baseline.extractor_version,
    graph_receipt: {
      accepted_vgo_002_task_cid_bound:
        typeof baseline.graph_receipt.accepted_vgo_002_task_cid === 'string' &&
        baseline.graph_receipt.accepted_vgo_002_task_cid.startsWith('sha256:'),
      executed_code: baseline.graph_receipt.executed_code,
      interface: baseline.graph_receipt.interface,
      schema_version: baseline.graph_receipt.schema_version,
      verification_status: baseline.graph_receipt.verification_status,
    },
    interface: baseline.interface,
    invalidation_receipt: {
      executed_code: baseline.invalidation_receipt.executed_code,
      interface: baseline.invalidation_receipt.interface,
      planner_interface: baseline.invalidation_receipt.planner_interface,
      verification_status: baseline.invalidation_receipt.verification_status,
    },
    invariant_receipt: {
      capability_gap: baseline.invariant_receipt.capability_gap,
      executed_code: baseline.invariant_receipt.executed_code,
      interface: baseline.invariant_receipt.interface,
      invoked: baseline.invariant_receipt.invoked,
      solver_claimed_available:
        baseline.invariant_receipt.solver_claimed_available,
      verification_status: baseline.invariant_receipt.verification_status,
    },
    known_pre_change_failures: baseline.known_pre_change_failures.map(item => ({
      code: item.code,
      evidence_level: item.evidence_level,
      live_confirmed: item.live_confirmed,
      path: item.path,
      source_supported: item.source_supported,
      verification_status: item.verification_status,
    })),
    live_target: {
      authority: baseline.live_target.authority,
      exists: baseline.live_target.exists,
      kind: baseline.live_target.kind,
      path: baseline.live_target.path,
      role: baseline.live_target.role,
      scanned: baseline.live_target.scanned,
    },
    policy_receipt: {
      automatic_acceptance_blocked:
        baseline.policy_receipt.automatic_acceptance_blocked,
      browser_policy_authoritative:
        baseline.policy_receipt.browser_policy_authoritative,
      interface: baseline.policy_receipt.interface,
      ui_visibility_authorizes: baseline.policy_receipt.ui_visibility_authorizes,
    },
    registration_divergence: {
      additional_runtime_maps: [
        ...baseline.registration_divergence.additional_runtime_maps,
      ],
      canonical_application_definition_count:
        baseline.registration_divergence.canonical_application_definition_count,
      canonical_component: baseline.registration_divergence.canonical_component,
      canonical_manifest_path:
        baseline.registration_divergence.canonical_manifest_path,
      components_match: baseline.registration_divergence.components_match,
      counts_derived_from_source:
        baseline.registration_divergence.counts_derived_from_source,
      runtime_component: baseline.registration_divergence.runtime_component,
      runtime_projection_path:
        baseline.registration_divergence.runtime_projection_path,
      runtime_registration_count:
        baseline.registration_divergence.runtime_registration_count,
      silently_selected_one:
        baseline.registration_divergence.silently_selected_one,
    },
    scan_receipt: {
      executed_code: baseline.scan_receipt.executed_code,
      interface: baseline.scan_receipt.interface,
      schema_version: baseline.scan_receipt.schema_version,
      sources: [...baseline.scan_receipt.sources],
      verification_status: baseline.scan_receipt.verification_status,
    },
    schema_version: baseline.schema_version,
    screen_identity: {
      application_id: baseline.screen_identity.application_id,
      interface: baseline.screen_identity.interface,
      route_id: baseline.screen_identity.route_id,
      schema_version: baseline.screen_identity.schema_version,
      screen_id: baseline.screen_identity.screen_id,
    },
    source_inventory: baseline.source_inventory.map(entry => ({
      authority: entry.authority,
      exists: entry.exists,
      kind: entry.kind,
      path: entry.path,
      role: entry.role,
      scanned: entry.scanned,
    })),
    state_receipt: {
      executed_code: baseline.state_receipt.executed_code,
      interface: baseline.state_receipt.interface,
      schema_version: baseline.state_receipt.schema_version,
    },
    surfaces: baseline.surfaces.map(entry => ({
      authority: entry.authority,
      exists: entry.exists,
      kind: entry.kind,
      path: entry.path,
      role: entry.role,
    })),
    task_id: baseline.task_id,
    unmeasured_live_metrics: [...baseline.unmeasured_live_metrics],
    verification_status: baseline.verification_status,
  };
}

export function serializeAgentSupervisorSemanticBaselineEvidence(
  baseline: UiSemanticBaseline,
): string {
  return `${JSON.stringify(sortKeysDeep(semanticBaselineEvidenceView(baseline)), null, 2)}\n`;
}

export function uiSemanticBaselineIdentity(
  baseline: UiSemanticBaseline,
): GuiCanonicalIdentity {
  const dict = uiSemanticBaselineToDict(baseline);
  delete dict.baseline_cid;
  delete dict.baseline_digest;
  return canonicalIdentity(dict, {
    domain: DOMAIN_UI_SEMANTIC_BASELINE,
    schemaVersion: UI_SEMANTIC_BASELINE_SCHEMA,
  });
}

export function uiSemanticBaselineDigest(baseline: UiSemanticBaseline): string {
  return baseline.baseline_digest;
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export function recordAgentSupervisorSemanticBaseline(
  options: AgentSupervisorTargetOptions = {},
): UiSemanticBaseline {
  const root = resolveRepositoryRoot(options.repositoryRoot);
  const liveAbs = absoluteFromRepo(root, AGENT_SUPERVISOR_LIVE_TARGET_PATH);
  if (!existsSync(liveAbs)) {
    throw new AgentSupervisorTargetError(
      `live target missing: ${AGENT_SUPERVISOR_LIVE_TARGET_PATH}`,
    );
  }

  const liveContent = readRepoText(root, AGENT_SUPERVISOR_LIVE_TARGET_PATH);
  const allDescriptors = [...CANONICAL_SURFACES, ...LEGACY_SURFACES];
  const inventory = allDescriptors.map(descriptor =>
    inventoryEntry(
      root,
      descriptor,
      descriptor.path === AGENT_SUPERVISOR_LIVE_TARGET_PATH,
    ),
  );
  const liveTarget = inventory.find(
    entry => entry.path === AGENT_SUPERVISOR_LIVE_TARGET_PATH,
  );
  if (!liveTarget || !liveTarget.exists || liveTarget.kind !== 'file') {
    throw new AgentSupervisorTargetError(
      `live target is not a readable file: ${AGENT_SUPERVISOR_LIVE_TARGET_PATH}`,
    );
  }

  const repositoryRevision = sourceRevisionFromInventory(inventory);

  const scan = scanGuiSources(
    [
      {
        path: AGENT_SUPERVISOR_LIVE_TARGET_PATH,
        content: liveContent,
        language: 'javascript',
      },
    ],
    {
      applicationId: AGENT_SUPERVISOR_APPLICATION_ID,
      screenId: AGENT_SUPERVISOR_SCREEN_ID,
      packageNamespace: AGENT_SUPERVISOR_PACKAGE_NAMESPACE,
    },
  );
  if (scan.executed_code !== false) {
    throw new AgentSupervisorTargetError(
      'scanner executed repository source; refuse baseline',
    );
  }
  if (scan.verification_status === 'verified') {
    throw new AgentSupervisorTargetError(
      'scanner reported verified status; static extraction cannot earn verification',
    );
  }

  const graph = buildUiComponentGraph(scan, {
    applicationId: AGENT_SUPERVISOR_APPLICATION_ID,
    screenId: AGENT_SUPERVISOR_SCREEN_ID,
    packageNamespace: AGENT_SUPERVISOR_PACKAGE_NAMESPACE,
  });
  if (graph.accepted_vgo_002_task_cid !== ACCEPTED_VGO_002_TASK_CID) {
    throw new AgentSupervisorTargetError(
      'graph is not bound to the accepted VGO-002 task CID',
    );
  }

  const state = extractUiStateMachineFromScan(scan, {
    applicationId: AGENT_SUPERVISOR_APPLICATION_ID,
    screenId: AGENT_SUPERVISOR_SCREEN_ID,
    machineId: 'state:agent-supervisor',
  });

  const boundedEdges = scan.edges.slice(0, MAX_COLLECTION_ITEMS);
  const omittedEdges = scan.edges.length - boundedEdges.length;
  const capsule = compileUiSemanticCapsuleFromFacts(
    {
      findings: scan.findings,
      edges: boundedEdges,
      unresolved: [
        ...scan.unresolved,
        ...(omittedEdges > 0
          ? [`dependency_edge_bound:${omittedEdges}_omitted`]
          : []),
      ],
      sources: scan.sources,
      analysis_classification: scan.analysis_classification,
      verification_status: scan.verification_status,
      completeness_boundary: scan.completeness_boundary,
      scanner_extractor_version: scan.extractor_version,
    },
    {
      applicationId: AGENT_SUPERVISOR_APPLICATION_ID,
      screenId: AGENT_SUPERVISOR_SCREEN_ID,
      packageNamespace: AGENT_SUPERVISOR_PACKAGE_NAMESPACE,
      capsuleId: 'capsule:AgentSupervisorConsole',
      purpose: 'Agent Supervisor console semantic capsule',
      sourceRevision: repositoryRevision,
      verificationStatus: 'unverified',
    },
  );
  if (capsule.verification_status === 'verified') {
    throw new AgentSupervisorTargetError(
      'capsule reported verified status; static extraction cannot earn verification',
    );
  }

  const displayed = extractDisplayedActions(liveContent);
  const policy = validatePolicyBindings({
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    action_bindings: displayed.bindings,
    confirmation_bindings: [],
    binding_evidence: displayed.evidence,
  });
  if (policy.ui_visibility_authorizes !== false) {
    throw new AgentSupervisorTargetError(
      'policy report must not treat UI visibility as authorization',
    );
  }
  if (policy.browser_policy_authoritative !== false) {
    throw new AgentSupervisorTargetError(
      'policy report must not treat browser policy as authoritative',
    );
  }

  const knownFailures = collectKnownPreChangeFailures(root, liveContent);
  const violations = collectBaselineViolations(state, knownFailures);
  const unresolved = collectUnresolvedDynamics(scan, graph, state, capsule);
  const classification = worstGuiExtractionConfidence([
    scan.analysis_classification,
    graph.analysis_classification,
    state.analysis_classification,
    capsule.analysis_classification,
  ]);
  const completeness = deriveCompleteness(
    classification,
    unresolved,
    violations,
  );
  const invalidationPlan = planBaselineInvalidation({
    graph,
    actions: displayed.actions,
    unresolved,
  });
  if (invalidationPlan.interface !== UI_INVALIDATION_PLAN_INTERFACE) {
    throw new AgentSupervisorTargetError(
      'invalidation planner returned an unexpected interface',
    );
  }

  const applicationIdentity = decodeGuiApplicationIdentity(
    applicationIdentityDict(),
  );
  const screenIdentity = decodeGuiScreenIdentity(screenIdentityDict());
  const componentIdentities = collectComponentIdentities(scan);

  const styleDeps = extractStyleDependencies(liveContent);
  const sourceDeps = uniqueSorted(
    inventory
      .filter(
        entry =>
          entry.exists &&
          (entry.authority === 'canonical' ||
            entry.authority === 'live_target' ||
            entry.authority === 'runtime_projection' ||
            entry.authority === 'supporting' ||
            entry.authority === 'contract'),
      )
      .map(entry => entry.path),
  );
  const testDeps = uniqueSorted(
    inventory
      .filter(entry => entry.exists && entry.authority === 'test')
      .map(entry => entry.path),
  );

  const actionBindingInvalidCount = policy.violations.filter(
    item =>
      item.code !== 'missing_runtime_reevaluation' &&
      item.code !== 'missing_source_span',
  ).length;
  const unsupportedCount =
    UNMEASURED_LIVE_METRICS.length +
    policy.violations.filter(item => item.code === 'missing_runtime_reevaluation')
      .length;

  const metrics = measuredMetrics({
    unresolvedCount: unresolved.length,
    invariantCount: state.violations.length,
    incompleteAsync: state.async_effects.filter(effect => !effect.complete)
      .length,
    unsupportedCount,
    actionBindingInvalidCount,
  });

  const compiled = compileUiBaseline({
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    repository_revision: repositoryRevision,
    scenario_ids: Object.values(STABLE_SCENARIO_IDS),
    metrics,
    artifact_digests: liveTarget.digest ? [liveTarget.digest] : [],
    extractor_version: '1.0.0',
  });

  const evaluatorObjective: ObjectiveMetricId = 'accessibility_violation_count';
  const evaluation = evaluateObjective({
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    repository_revision: repositoryRevision,
    objective_id: evaluatorObjective,
    scenario_ids: Object.values(STABLE_SCENARIO_IDS),
    baseline: compiled.baseline,
    baseline_metrics: metrics,
    candidate_metrics: metrics,
    artifact_digests: liveTarget.digest ? [liveTarget.digest] : [],
  });
  if (evaluation.decision.decision === 'accept') {
    throw new AgentSupervisorTargetError(
      'semantic baseline cannot auto-accept; live critical evidence is absent',
    );
  }
  if (evaluation.decision.unknown_critical_evidence !== true) {
    throw new AgentSupervisorTargetError(
      'semantic baseline must treat missing live receipts as unknown critical evidence',
    );
  }

  const scanReceipt = scanReceiptFrom(scan);
  const graphReceipt = graphReceiptFrom(graph);
  const stateReceipt = stateReceiptFrom(state);
  const capsuleReceipt = capsuleReceiptFrom(capsule);
  const policyReceipt = policyReceiptFrom(policy);
  const invalidationReceipt = invalidationReceiptFrom(invalidationPlan);
  const evaluatorReceipt = evaluatorReceiptFrom({
    decision: evaluation.decision.decision,
    reasonCodes: evaluation.decision.blocking_reason_codes,
    objectiveId: evaluatorObjective,
  });
  const invariantEngineReceipt = invariantReceipt();
  const registration = extractRegistrationDivergence(root);

  const baselineId = `baseline:${repositoryRevision.slice(7, 23)}`;
  const seed: Omit<UiSemanticBaseline, 'baseline_digest' | 'baseline_cid'> = {
    interface: UI_SEMANTIC_BASELINE_INTERFACE,
    schema_version: UI_SEMANTIC_BASELINE_SCHEMA,
    extractor_interface: AGENT_SUPERVISOR_TARGET_INTERFACE,
    extractor_schema_version: AGENT_SUPERVISOR_TARGET_SCHEMA,
    extractor_version: AGENT_SUPERVISOR_TARGET_VERSION,
    canonical_json_profile: CANONICAL_JSON_PROFILE,
    task_id: 'VGO-062',
    baseline_id: baselineId,
    application_identity: applicationIdentity,
    screen_identity: screenIdentity,
    component_identities: componentIdentities,
    live_target: liveTarget,
    surfaces: Object.freeze(inventory),
    source_inventory: Object.freeze(inventory),
    registration_divergence: registration,
    scan_receipt: scanReceipt,
    graph_receipt: graphReceipt,
    state_receipt: stateReceipt,
    capsule_receipt: capsuleReceipt,
    policy_receipt: policyReceipt,
    invalidation_receipt: invalidationReceipt,
    evaluator_receipt: evaluatorReceipt,
    invariant_receipt: invariantEngineReceipt,
    dependencies: Object.freeze({
      sources: sourceDeps,
      tests: testDeps,
      actions: Object.freeze(displayed.actions),
      styles: styleDeps,
    }),
    violations,
    unresolved_dynamics: unresolved,
    known_pre_change_failures: knownFailures,
    unmeasured_live_metrics: UNMEASURED_LIVE_METRICS,
    claim_boundary: CLAIM_BOUNDARY,
    completeness_boundary: completeness,
    analysis_classification: classification,
    verification_status: 'unverified',
    repository_revision: repositoryRevision,
    executed_code: false,
    ui_baseline: compiled.baseline,
    metric_snapshot: compiled.metrics,
    baseline_digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    baseline_cid: 'bAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  };

  const identity = uiSemanticBaselineIdentity(seed as UiSemanticBaseline);
  const baseline: UiSemanticBaseline = Object.freeze({
    ...seed,
    baseline_digest: identity.digest,
    baseline_cid: identity.cid,
  });

  const recomputed = uiSemanticBaselineIdentity(baseline);
  if (
    recomputed.digest !== baseline.baseline_digest ||
    recomputed.cid !== baseline.baseline_cid
  ) {
    throw new AgentSupervisorTargetError(
      'semantic baseline identity does not rehash',
    );
  }
  assertNoUnearnedVerifiedClaims(uiSemanticBaselineToDict(baseline));
  if (baseline.live_target.path !== AGENT_SUPERVISOR_LIVE_TARGET_PATH) {
    throw new AgentSupervisorTargetError(
      'baseline live_target.path must be the selected Agent Supervisor source',
    );
  }
  return baseline;
}

export function createAgentSupervisorTarget(): AgentSupervisorTarget {
  return Object.freeze({
    interface: AGENT_SUPERVISOR_TARGET_INTERFACE,
    schema_version: AGENT_SUPERVISOR_TARGET_SCHEMA,
    extractorVersion: AGENT_SUPERVISOR_TARGET_VERSION,
    liveTargetPath: AGENT_SUPERVISOR_LIVE_TARGET_PATH,
    record(options?: AgentSupervisorTargetOptions) {
      return recordAgentSupervisorSemanticBaseline(options);
    },
  });
}
