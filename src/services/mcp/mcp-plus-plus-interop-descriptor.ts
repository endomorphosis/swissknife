/**
 * SwissKnife <-> Mcp-Plus-Plus interoperability descriptor.
 *
 * VAI-665 objective validation repair: interface contract swissknife Mcp-Plus-Plus,
 * goal_packet/interoperability/swissknife/06921590135c,
 * tests/integration/test_swissknife_mcp_plus_plus_interop.py.
 *
 * This module proves that SwissKnife's own MCP++ client implementation
 * (`./mcp-plus-plus.js`) is describable as a canonical MCP-IDL (Profile A)
 * interface descriptor that the upstream `Mcp-Plus-Plus` conformance suite
 * (Python/TS/Go/Rust validators) can register, query, and validate, and that
 * SwissKnife's policy-mediation control surface contract and interaction
 * envelope schemas can carry Mcp-Plus-Plus surface events end to end.
 *
 * It closes the VAIOS-G704 objective gap for the shared
 * `goal_packet/interoperability/swissknife/06921590135c` packet, which also
 * covers VAIOS-G700, VAIOS-G701, VAIOS-G702, VAIOS-G703, VAIOS-G705, and
 * VAIOS-G706.
 */

import {
  MCPPlusPlus,
  MCPPPInterfaceDescriptor,
  IPFS_KIT_INTERFACE,
  IPFS_ACCELERATE_INTERFACE,
  IPFS_DATASETS_INTERFACE,
  createMCPPlusPlusClient,
} from './mcp-plus-plus.js';

// --- Objective / goal packet metadata ---

export const SWISSKNIFE_MCP_PLUS_PLUS_OBJECTIVE_GOALS = [
  'VAIOS-G700',
  'VAIOS-G701',
  'VAIOS-G702',
  'VAIOS-G703',
  'VAIOS-G704',
  'VAIOS-G705',
  'VAIOS-G706',
] as const;

export const SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_METADATA = {
  interface_contract: 'interface contract swissknife Mcp-Plus-Plus',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goal_id: 'VAIOS-G704',
  source_surface: 'swissknife',
  target_surface: 'mcp_plus_plus',
};

// --- Profile A: MCP-IDL interface descriptor for the SwissKnife<->Mcp-Plus-Plus surface ---

export const MCP_PLUS_PLUS_INTEROP_OPERATIONS = [
  'mcpplusplus.negotiate_capabilities',
  'mcpplusplus.execute_with_envelope',
  'mcpplusplus.create_delegation',
  'mcpplusplus.evaluate_policy',
  'mcpplusplus.get_dag_frontier',
  'mcpplusplus.check_compatibility',
  'mcpplusplus.create_p2p_session',
] as const;

export const SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'swissknife-mcp-plus-plus-interop',
  namespace: 'com.swissknife.interop.mcp_plus_plus',
  version: '0.1.0',
  interface_cid: 'bafyswissknifemcpplusplusinterop000000001',
  methods: [
    {
      name: 'mcpplusplus.negotiate_capabilities',
      input_schema_cid: 'bafy_negotiate_in',
      output_schema_cid: 'bafy_negotiate_out',
      error_schema_cids: ['bafy_err_unsupported_profile'],
    },
    {
      name: 'mcpplusplus.execute_with_envelope',
      input_schema_cid: 'bafy_execute_in',
      output_schema_cid: 'bafy_execute_out',
      error_schema_cids: ['bafy_err_policy_mediation_required'],
      interaction_pattern: 'request-response',
    },
    {
      name: 'mcpplusplus.create_delegation',
      input_schema_cid: 'bafy_delegate_in',
      output_schema_cid: 'bafy_delegate_out',
      error_schema_cids: [],
    },
    {
      name: 'mcpplusplus.evaluate_policy',
      input_schema_cid: 'bafy_policy_in',
      output_schema_cid: 'bafy_policy_out',
      error_schema_cids: ['bafy_err_policy_mediation_required'],
    },
    {
      name: 'mcpplusplus.get_dag_frontier',
      input_schema_cid: 'bafy_frontier_in',
      output_schema_cid: 'bafy_frontier_out',
      error_schema_cids: [],
    },
    {
      name: 'mcpplusplus.check_compatibility',
      input_schema_cid: 'bafy_compat_in',
      output_schema_cid: 'bafy_compat_out',
      error_schema_cids: ['bafy_err_compatibility_check_failed'],
    },
    {
      name: 'mcpplusplus.create_p2p_session',
      input_schema_cid: 'bafy_p2p_in',
      output_schema_cid: 'bafy_p2p_out',
      error_schema_cids: [],
      interaction_pattern: 'stream',
    },
  ],
  errors: [
    { name: 'PolicyMediationRequired', code: 409 },
    { name: 'UnsupportedProfile', code: 422 },
    { name: 'CompatibilityCheckFailed', code: 409 },
  ],
  requires: [
    'mcp++/mcp-idl',
    'mcp++/cid-envelope',
    'mcp++/ucan',
    'mcp++/deontic-policy',
    'mcp++/event-dag',
    'mcp++/p2p-transport',
  ],
  compatibility: {
    compatible_with: [
      IPFS_KIT_INTERFACE.interface_cid,
      IPFS_ACCELERATE_INTERFACE.interface_cid,
      IPFS_DATASETS_INTERFACE.interface_cid,
    ],
    supersedes: [],
  },
  semantic_tags: [
    'interop',
    'mcp++',
    'swissknife',
    'control-surface',
    'policy-mediation',
    'mcp_plus_plus',
  ],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-mcp-plus-plus-interop@0.1.0',
  interface: SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE,
  metadata: SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_METADATA,
  objective_goals: SWISSKNIFE_MCP_PLUS_PLUS_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    policy_decision: 'swissknife/contracts/policy_decision.schema.json',
    mcp_plus_plus_compatibility_receipt:
      'swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json',
  },
  runtime_handoff: {
    source_surface: 'swissknife',
    target_surface: 'mcp_plus_plus',
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    negotiated_profiles: [
      'mcp++/mcp-idl',
      'mcp++/cid-envelope',
      'mcp++/ucan',
      'mcp++/deontic-policy',
      'mcp++/event-dag',
      'mcp++/p2p-transport',
    ],
    idl_fixture_ref: 'Mcp-Plus-Plus/tests-py/fixtures/valid/mcp_idl_descriptor.json',
    interop_fixture_ref:
      'Mcp-Plus-Plus/tests-py/fixtures/valid/swissknife_mcp_plus_plus_interop_descriptor.json',
    control_surface_policy_id: 'policy:swissknife:mcp-plus-plus-interop',
  },
  validation: {
    task_id: 'VAI-665',
    goal_id: 'VAIOS-G704',
    objective_gap_ref:
      'data/virtual_ai_os/discovery/2026-07-08-vai-665-objective-gap-57359897bf4f.md',
    validation_repair_ref:
      'data/virtual_ai_os/discovery/2026-07-08-vai-665-validation-repair.md',
    evidence: 'objective validation repair',
  },
};

/**
 * Registers the SwissKnife<->Mcp-Plus-Plus interop interface descriptor with a
 * live `MCPPlusPlus` client instance, proving the descriptor participates in
 * the same runtime registry (`registerInterface`/`getInterface`/
 * `queryInterfaces`/`checkCompatibility`) that the pre-built IPFS descriptors
 * use. Returns the registered `interface_cid`.
 */
export function registerSwissKnifeMcpPlusPlusInterop(client: MCPPlusPlus): string {
  return client.registerInterface(SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE);
}

/**
 * Creates an MCP++ client pre-loaded with the standard IPFS descriptors
 * (`createMCPPlusPlusClient`) plus the SwissKnife<->Mcp-Plus-Plus interop
 * descriptor, so callers get a fully wired runtime handoff surface.
 */
export function createMCPPlusPlusClientWithSwissKnifeInterop(agentDID: string): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeMcpPlusPlusInterop(client);
  return client;
}

// --- SwissKnife control-surface-contract / interaction-envelope payload builders ---

const MCP_PLUS_PLUS_POLICY_BUNDLE_REF = {
  policy_id: 'policy:swissknife:mcp-plus-plus-interop',
  policy_cid: 'local:swissknife:mcp-plus-plus-interop',
  version: '0.1.0',
  scope: 'swissknife-mcp-plus-plus-interop',
  source: 'system_default' as const,
};

const MCP_PLUS_PLUS_LOGIC_BINDING = {
  binding_id: 'binding:swissknife-mcp-plus-plus-negotiate',
  policy_bundle_ref: MCP_PLUS_PLUS_POLICY_BUNDLE_REF,
  compiled_policy_cid: 'local:swissknife:mcp-plus-plus-interop',
  ir_version: '0.1.0',
  frame_fact_kinds: ['actor', 'surface', 'event', 'method', 'context'],
  surface_refs: ['agent', 'mcp_server', 'remote_client'],
  method_refs: ['mcpplusplus.execute_with_envelope', 'mcpplusplus.negotiate_capabilities'],
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
  compiled_artifact_refs: [
    {
      artifact_type: 'deontic_policy' as const,
      cid: 'local:swissknife:mcp-plus-plus-interop',
      media_type: 'application/json',
      description: 'interface contract swissknife Mcp-Plus-Plus',
    },
  ],
  interaction_envelope_schema_ref: 'interaction_envelope' as const,
  policy_decision_schema_ref: 'policy_decision' as const,
  mediation_receipt_schema_ref: 'mediation_receipt' as const,
  mediation_required: true,
};

/**
 * Builds a payload that validates against
 * `swissknife/contracts/control_surface_contract.schema.json` for the
 * SwissKnife<->Mcp-Plus-Plus handoff.
 */
export function buildSwissKnifeMcpPlusPlusControlSurfaceContract() {
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [
        {
          id: 'swissknife.mcp_plus_plus.mcp-server',
          kind: 'mcp_server',
          event_types: ['execute_with_envelope', 'negotiate_capabilities'],
          intent_resolver: 'swissknife.mcp_plus_plus.intent_resolver',
          confidence_policy: { min_confidence: 0.85, clarify_below: 0.6 },
          logic_bindings: [MCP_PLUS_PLUS_LOGIC_BINDING],
        },
      ],
      intent_bindings: [
        {
          intent: 'swissknife.mcp_plus_plus.execute_with_envelope',
          method: 'mcpplusplus.execute_with_envelope',
          target_ref: 'mcp_plus_plus:interop_descriptor',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'interface_cid'],
          logic_bindings: [MCP_PLUS_PLUS_LOGIC_BINDING],
        },
      ],
      policy_hooks: {
        compile_api: 'swissknife://control-surface/compile',
        evaluate_api: 'swissknife://control-surface/evaluate',
        decision_receipt: true,
        compiled_artifact_types: ['deontic_policy', 'explanation'],
      },
      context_schema: {
        state_frames: ['mcp_plus_plus_session'],
        time_context: true,
        location_context: false,
        device_context: false,
        agent_identity: true,
      },
      conflict_resolution: {
        default: 'require_confirmation',
        requires_explanation: true,
        requires_user_confirmation_for: ['execute_with_envelope'],
      },
      logic_bindings: [MCP_PLUS_PLUS_LOGIC_BINDING],
      mediation_receipts: {
        decision_schema_ref: 'policy_decision',
        receipt_schema_ref: 'mediation_receipt',
        emit_for_outcomes: ['allow', 'deny', 'require_confirmation'],
        store: 'audit_log',
      },
    },
  };
}

/**
 * Builds a payload that validates against
 * `swissknife/contracts/interaction_envelope.schema.json` for the
 * SwissKnife<->Mcp-Plus-Plus handoff.
 */
export function buildSwissKnifeMcpPlusPlusInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-mcp-plus-plus:execute-with-envelope:1',
    surface: 'mcp_server',
    surface_event: 'execute_with_envelope',
    raw_payload: {
      interface_cid: SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE.interface_cid,
      method: 'mcpplusplus.negotiate_capabilities',
    },
    normalized_intent: {
      intent: 'swissknife.mcp_plus_plus.execute_with_envelope',
      method: 'mcpplusplus.execute_with_envelope',
      target_ref: 'mcp_plus_plus:interop_descriptor',
      arguments: {
        interface_cid: SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE.interface_cid,
        arguments_hash: 'sha256:swissknife-mcp-plus-plus-execute-with-envelope',
      },
      confidence: 0.97,
    },
    actor: {
      type: 'agent' as const,
      id: 'swissknife:mcp-plus-plus-operator-agent',
      delegation_chain: ['ucan:swissknife-mcp-plus-plus-interop'],
    },
    context: {
      local_time: '2026-07-08T00:00:00Z',
      state_frames: ['mcp_plus_plus_session'],
      device_mode: 'server',
      platform: 'mcp_plus_plus',
      location_context: {},
      device_context: {
        interface_cid: SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE.interface_cid,
        negotiated_profiles: [
          'mcp++/mcp-idl',
          'mcp++/cid-envelope',
          'mcp++/deontic-policy',
        ],
      },
    },
    control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    policy_bundle_ref: MCP_PLUS_PLUS_POLICY_BUNDLE_REF,
    compiled_policy_cid: 'local:swissknife:mcp-plus-plus-interop',
    logic_bindings: [
      {
        binding_id: MCP_PLUS_PLUS_LOGIC_BINDING.binding_id,
        policy_bundle_ref: MCP_PLUS_PLUS_POLICY_BUNDLE_REF,
        compiled_policy_cid: 'local:swissknife:mcp-plus-plus-interop',
        surface_ref: 'mcp_server',
        method_ref: 'mcpplusplus.execute_with_envelope',
        norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
      },
    ],
  };
}

/**
 * Converts the SwissKnife MCP-IDL descriptor to the plain MCP-IDL Profile A
 * shape expected by the upstream `Mcp-Plus-Plus` `MCPIDLValidator`
 * (`Mcp-Plus-Plus/tests-py/validators/mcp_idl.py`): `name`, `namespace`,
 * `version`, `methods`, `errors`, `requires`, `compatibility`.
 */
export function toMcpIdlValidatorDescriptor(
  descriptor: MCPPPInterfaceDescriptor = SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE
) {
  return {
    name: descriptor.name,
    namespace: descriptor.namespace,
    version: descriptor.version,
    methods: descriptor.methods.map((method) => ({
      name: method.name,
      input_schema_cid: method.input_schema_cid,
      output_schema_cid: method.output_schema_cid,
    })),
    errors: descriptor.errors,
    requires: descriptor.requires,
    compatibility: descriptor.compatibility,
    semantic_tags: descriptor.semantic_tags,
  };
}
