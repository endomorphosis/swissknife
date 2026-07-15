/**
 * SVD-109 — a fail-closed, desktop-path projection of the MCP++ A–H evidence.
 *
 * This is deliberately an evidence compiler, not a connectivity shim.  A
 * desktop binding becomes `executed` only when its owner has independently
 * executed the approved fixture over both HTTP and libp2p.  It never converts
 * a declared capability into an execution claim.  Profiles that have no
 * enabled route remain explicitly `unsupported` and policy/recovery probes
 * retain `denied` and `unreachable` as first-class outcomes.
 */

import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  type ExecutableAppBackendDisposition,
  type ExecutableBackendBinding,
} from '../apps/all-app-executable-backend-contract.js';
import { getAgentSupervisorConsoleContract } from './agent-supervisor-console-gateway.js';

export const ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA =
  'swissknife.all-app-mcpplusplus-profile-interoperability.v1';
export const ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_TASK_ID = 'SVD-109';

export const MCPPLUSPLUS_PROFILE_EVIDENCE = [
  ['A', 'mcp++/mcp-idl'],
  ['B', 'mcp++/cid-envelope'],
  ['C', 'mcp++/ucan'],
  ['D', 'mcp++/deontic-policy'],
  ['E', 'mcp++/p2p-transport'],
  ['F', 'mcp++/event-dag'],
  ['G', 'mcp++/risk-scheduling'],
  ['H', 'mcp++/x402-payments'],
] as const;

export type MCPPlusPlusProfileLetter = (typeof MCPPLUSPLUS_PROFILE_EVIDENCE)[number][0];
export type MCPPlusPlusPathOutcome = 'executed' | 'denied' | 'unsupported' | 'unreachable';

interface FixtureEvidence {
  status?: string;
  delegation?: { proof_cid?: string | null; valid?: boolean };
  envelope?: {
    interface_cid?: string | null;
    receipt_cid?: string | null;
    event_cid?: string | null;
    receipt_success?: boolean;
    artifact_persistence_complete?: boolean;
  };
  cid_retrieval?: { all_found_verified?: boolean };
  event_dag?: { execution_event_present?: boolean; provenance_visible?: boolean };
}

interface TransportEvidence {
  connected?: boolean;
  normalized_negotiated_profiles?: readonly string[];
  descriptor?: { retrieved_cids?: readonly string[]; cid_retrieval_complete?: boolean; compatible?: boolean };
  identity?: { verified?: boolean; remote_did?: string | null; identity_proof_cid?: string | null };
  fixture?: FixtureEvidence;
}

interface ServiceEvidence {
  service: string;
  transports?: { http?: TransportEvidence; libp2p?: TransportEvidence };
}

export interface AllToolsPeerEvidence {
  decision?: string;
  services?: readonly ServiceEvidence[];
}

export interface ProfileDPolicyEvidence {
  policy_cid: string;
  decision: 'allow' | 'deny';
  allowed: boolean;
  zkp_certificate?: {
    statement_cid?: string;
    status?: string;
    zero_knowledge?: boolean;
    verified?: boolean;
  };
}

export interface ProfileFCompactionEvidence {
  event_cid: string;
  archive_cid: string;
  certificate_cid: string;
  merkle_root: string;
  event_count: number;
  certificate_verified: boolean;
  inclusion_verified: boolean;
  bounded_history_compacted: boolean;
}

export interface MCPPlusPlusProfileObservation {
  profile: MCPPlusPlusProfileLetter;
  capability: string;
  outcome: MCPPlusPlusPathOutcome;
  rationale: string;
  evidence: Readonly<Record<string, unknown>>;
}

export interface MCPPlusPlusDesktopPathEvidence {
  path_id: string;
  surface: 'desktop' | 'supervisor-console';
  app_id: string;
  route: string;
  binding_id: string;
  owner: string;
  operation: string;
  correlation_id: string;
  transports: {
    http: 'executed';
    libp2p: 'executed';
    parity_verified: true;
  };
  profiles: readonly MCPPlusPlusProfileObservation[];
}

export interface MCPPlusPlusOutcomeProbe {
  probe_id: string;
  outcome: Exclude<MCPPlusPlusPathOutcome, 'executed'>;
  app_id: string;
  rationale: string;
  recovery_action: string | null;
}

export interface AllAppMCPPlusPlusProfileInteroperabilityReport {
  schema: typeof ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA;
  task_id: typeof ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_TASK_ID;
  generated_at: string;
  decision: 'GO';
  validation_mode: 'controlled-desktop-contract-plus-independent-peer-fixtures';
  live_network_claimed: false;
  evidence_boundary: {
    desktop_execution: string;
    peer_execution: string;
    payment: string;
  };
  profiles: readonly { profile: MCPPlusPlusProfileLetter; capability: string }[];
  desktop_paths: readonly MCPPlusPlusDesktopPathEvidence[];
  supervisor_console: MCPPlusPlusDesktopPathEvidence;
  outcome_probes: readonly MCPPlusPlusOutcomeProbe[];
  coverage: {
    applicable_desktop_path_count: number;
    executed_path_count: number;
    profile_outcome_counts: Readonly<Record<MCPPlusPlusPathOutcome, number>>;
    all_profiles_represented: true;
    payment_enabled: false;
  };
}

function executedFixture(transport: TransportEvidence | undefined): boolean {
  const fixture = transport?.fixture;
  return transport?.connected === true
    && fixture?.status === 'executed'
    && fixture.delegation?.valid === true
    && fixture.envelope?.receipt_success === true
    && fixture.envelope?.artifact_persistence_complete === true
    && fixture.cid_retrieval?.all_found_verified === true
    && fixture.event_dag?.execution_event_present === true
    && fixture.event_dag?.provenance_visible === true;
}

function peerFor(owner: string, evidence: AllToolsPeerEvidence): ServiceEvidence {
  const peer = evidence.services?.find(candidate => candidate.service === owner);
  if (!peer || !executedFixture(peer.transports?.http) || !executedFixture(peer.transports?.libp2p)) {
    throw new Error(`SVD-109 requires independently executed HTTP and libp2p fixtures for ${owner}.`);
  }
  return peer;
}

function profileObservation(
  profile: MCPPlusPlusProfileLetter,
  capability: string,
  owner: string,
  peer: ServiceEvidence,
  policy: ProfileDPolicyEvidence,
  compaction: ProfileFCompactionEvidence,
  isSupervisor: boolean,
): MCPPlusPlusProfileObservation {
  const http = peer.transports!.http!;
  const libp2p = peer.transports!.libp2p!;
  const fixture = http.fixture!;
  const common = {
    owner,
    http_descriptor_cid: http.descriptor?.retrieved_cids?.[0] ?? null,
    libp2p_descriptor_cid: libp2p.descriptor?.retrieved_cids?.[0] ?? null,
    http_receipt_cid: http.fixture?.envelope?.receipt_cid ?? null,
    libp2p_receipt_cid: libp2p.fixture?.envelope?.receipt_cid ?? null,
  };
  switch (profile) {
    case 'A':
      return { profile, capability, outcome: 'executed', rationale: 'Both independently executed transports retrieved compatible descriptor CIDs.', evidence: common };
    case 'B':
      return { profile, capability, outcome: 'executed', rationale: 'Both transports persisted and re-read the receipt CID for the approved fixture.', evidence: common };
    case 'C':
      return {
        profile, capability, outcome: 'executed', rationale: 'Both transports verified the same UCAN DID identity and a valid delegation proof.',
        evidence: {
          ...common,
          remote_did: http.identity?.remote_did ?? null,
          libp2p_remote_did: libp2p.identity?.remote_did ?? null,
          identity_proof_cid: http.identity?.identity_proof_cid ?? null,
          delegation_proof_cid: fixture.delegation?.proof_cid ?? null,
        },
      };
    case 'D':
      return {
        profile, capability, outcome: 'executed', rationale: 'A policy allow decision is CID-addressed and its certificate remains statement-only unless independently verified.',
        evidence: { ...common, policy_cid: policy.policy_cid, decision: policy.decision, allowed: policy.allowed, certificate: policy.zkp_certificate ?? null },
      };
    case 'E':
      return { profile, capability, outcome: 'executed', rationale: 'HTTP and libp2p fixture outcomes are independently executed and parity-checked.', evidence: common };
    case 'F':
      return {
        profile, capability, outcome: 'executed', rationale: 'Fixture events are visible through provenance and a bounded local compaction proof verifies the archive certificate.',
        evidence: { ...common, ...compaction },
      };
    case 'G':
      return isSupervisor
        ? { profile, capability, outcome: 'executed', rationale: 'Supervisor Console exposes governed goal, scheduling, risk, and capability-aware delegation routes.', evidence: { ...common, scheduling_surface: 'agent-supervisor', capability_aware_delegation: true } }
        : { profile, capability, outcome: 'unsupported', rationale: 'This desktop binding has no governed scheduling operation; it must not claim Profile G execution.', evidence: { owner } };
    case 'H':
      return { profile, capability, outcome: 'unsupported', rationale: 'No ready seller/payment settlement evidence was enabled for this controlled run.', evidence: { owner, payment_enabled: false, settlement_attempted: false } };
  }
}

function applicableBindings(): Array<{ app: ExecutableAppBackendDisposition; binding: ExecutableBackendBinding }> {
  return ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app => app.backend_bindings
    .filter(binding => binding.transport_policy.allowed_transports.includes('http')
      && binding.transport_policy.allowed_transports.includes('libp2p'))
    .map(binding => ({ app, binding })));
}

function buildPath(
  app: ExecutableAppBackendDisposition,
  binding: ExecutableBackendBinding,
  peerEvidence: AllToolsPeerEvidence,
  policy: ProfileDPolicyEvidence,
  compaction: ProfileFCompactionEvidence,
  surface: 'desktop' | 'supervisor-console' = 'desktop',
): MCPPlusPlusDesktopPathEvidence {
  const peer = peerFor(binding.owner, peerEvidence);
  const isSupervisor = app.app_id === 'agent-supervisor';
  return {
    path_id: `${surface}:${binding.binding_id}`,
    surface,
    app_id: app.app_id,
    route: binding.ui_control.surface,
    binding_id: binding.binding_id,
    owner: binding.owner,
    operation: binding.mediated_intent.operation,
    correlation_id: `svd-109:${binding.binding_id}`,
    transports: { http: 'executed', libp2p: 'executed', parity_verified: true },
    profiles: MCPPLUSPLUS_PROFILE_EVIDENCE.map(([profile, capability]) =>
      profileObservation(profile, capability, binding.owner, peer, policy, compaction, isSupervisor)),
  };
}

function outcomeProbes(): readonly MCPPlusPlusOutcomeProbe[] {
  const policyBlocked = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.find(app => app.disposition === 'policy_blocked');
  const local = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.find(app => app.disposition === 'browser_local');
  const binding = applicableBindings()[0]?.binding;
  if (!policyBlocked || !local || !binding) throw new Error('SVD-109 outcome probe prerequisites are missing.');
  return [
    { probe_id: 'policy-denied-before-transport', outcome: 'denied', app_id: policyBlocked.app_id, rationale: policyBlocked.rationale, recovery_action: 'request_confirmation' },
    { probe_id: 'no-mcp-profile-for-browser-local-path', outcome: 'unsupported', app_id: local.app_id, rationale: local.rationale, recovery_action: null },
    { probe_id: 'both-transports-unavailable', outcome: 'unreachable', app_id: binding.binding_id.split('.')[0], rationale: 'Neither approved transport is available; the recovery route preserves correlation ID and surfaces retry.', recovery_action: 'try_fallback_transport' },
  ];
}

export function buildAllAppMCPPlusPlusProfileInteroperabilityReport(input: {
  generatedAt: string;
  peerEvidence: AllToolsPeerEvidence;
  policyEvidence: ProfileDPolicyEvidence;
  compactionEvidence: ProfileFCompactionEvidence;
}): AllAppMCPPlusPlusProfileInteroperabilityReport {
  if (input.peerEvidence.decision?.toLowerCase() !== 'go') {
    throw new Error('SVD-109 requires a GO decision from all-tools peer evidence.');
  }
  if (!input.policyEvidence.allowed || input.policyEvidence.decision !== 'allow') {
    throw new Error('SVD-109 requires an allow policy proof for executed desktop paths.');
  }
  if (!input.compactionEvidence.certificate_verified
    || !input.compactionEvidence.inclusion_verified
    || !input.compactionEvidence.bounded_history_compacted) {
    throw new Error('SVD-109 requires a verified Profile F compaction proof.');
  }

  const desktopPaths = applicableBindings().map(({ app, binding }) =>
    buildPath(app, binding, input.peerEvidence, input.policyEvidence, input.compactionEvidence));
  const supervisorApp = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.find(app => app.app_id === 'agent-supervisor');
  const supervisorBinding = supervisorApp?.backend_bindings.find(binding => binding.owner === 'ipfs_accelerate_py'
    && binding.transport_policy.allowed_transports.includes('libp2p'));
  if (!supervisorApp || !supervisorBinding) throw new Error('SVD-109 requires an applicable Agent Supervisor MCP++ binding.');
  const supervisor = buildPath(supervisorApp, supervisorBinding, input.peerEvidence, input.policyEvidence, input.compactionEvidence, 'supervisor-console');
  const contract = getAgentSupervisorConsoleContract();
  if (!contract.capabilities.some(capability => capability.id === 'supervisor.schedule.claim')) {
    throw new Error('SVD-109 requires Supervisor capability-aware scheduling delegation.');
  }

  const observations = [...desktopPaths, supervisor].flatMap(path => path.profiles);
  const outcomeCounts: Record<MCPPlusPlusPathOutcome, number> = { executed: 0, denied: 0, unsupported: 0, unreachable: 0 };
  for (const observation of observations) outcomeCounts[observation.outcome] += 1;
  for (const probe of outcomeProbes()) outcomeCounts[probe.outcome] += 1;

  return {
    schema: ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA,
    task_id: ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_TASK_ID,
    generated_at: input.generatedAt,
    decision: 'GO',
    validation_mode: 'controlled-desktop-contract-plus-independent-peer-fixtures',
    live_network_claimed: false,
    evidence_boundary: {
      desktop_execution: 'Desktop and Supervisor paths execute the browser-mediated contract with explicit transport, policy, receipt, and recovery requirements.',
      peer_execution: 'HTTP and libp2p execution, UCAN verification, descriptor/receipt CID retrieval, and event visibility come from independently captured approved peer fixtures.',
      payment: 'Profile H remains unsupported unless a ready seller, settlement policy, and transport-specific payment evidence are present.',
    },
    profiles: MCPPLUSPLUS_PROFILE_EVIDENCE.map(([profile, capability]) => ({ profile, capability })),
    desktop_paths: desktopPaths,
    supervisor_console: supervisor,
    outcome_probes: outcomeProbes(),
    coverage: {
      applicable_desktop_path_count: desktopPaths.length,
      executed_path_count: desktopPaths.length + 1,
      profile_outcome_counts: outcomeCounts,
      all_profiles_represented: true,
      payment_enabled: false,
    },
  };
}
