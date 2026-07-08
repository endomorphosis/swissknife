/**
 * SwissKnife <-> Mcp-Plus-Plus interop descriptor.
 * VAI-665 objective validation repair for VAIOS-G704.
 */

import { MCPPlusPlus, MCPPPInterfaceDescriptor, createMCPPlusPlusClient } from './mcp-plus-plus.js';

export const SWISSKNIFE_MCP_PLUS_PLUS_OBJECTIVE_GOALS = [
  'VAIOS-G700',
  'VAIOS-G701',
  'VAIOS-G702',
  'VAIOS-G703',
  'VAIOS-G704',
  'VAIOS-G705',
  'VAIOS-G706',
] as const;

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
  methods: MCP_PLUS_PLUS_INTEROP_OPERATIONS.map((name) => ({
    name,
    input_schema_cid: `bafy_${name}_in`,
    output_schema_cid: `bafy_${name}_out`,
    error_schema_cids: [],
  })),
  errors: [{ name: 'InteropFailure', code: 500 }],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['interop', 'swissknife', 'mcp_plus_plus'],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-mcp-plus-plus-interop@0.1.0',
  interface: SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE,
  metadata: {
    interface_contract: 'interface contract swissknife Mcp-Plus-Plus',
    goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
    goal_id: 'VAIOS-G704',
  },
  objective_goals: SWISSKNIFE_MCP_PLUS_PLUS_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    policy_decision: 'swissknife/contracts/policy_decision.schema.json',
    mcp_plus_plus_compatibility_receipt:
      'swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json',
    mcp_idl_fixture: 'Mcp-Plus-Plus/tests-py/fixtures/valid/mcp_idl_descriptor.json',
    swissknife_fixture:
      'Mcp-Plus-Plus/tests-py/fixtures/valid/swissknife_mcp_plus_plus_interop_descriptor.json',
  },
  runtime_handoff: {
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    operations: MCP_PLUS_PLUS_INTEROP_OPERATIONS,
    norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
  },
  validation: { task_id: 'VAI-665', goal_id: 'VAIOS-G704', evidence: 'objective validation repair' },
};

export function registerSwissKnifeMcpPlusPlusInterop(client: MCPPlusPlus): string {
  return client.registerInterface(SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeInterop(agentDID: string): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeMcpPlusPlusInterop(client);
  return client;
}

export function toMcpIdlValidatorDescriptor() {
  const { name, namespace, version, methods, errors, requires, compatibility } =
    SWISSKNIFE_MCP_PLUS_PLUS_INTEROP_INTERFACE;
  return { name, namespace, version, methods, errors, requires, compatibility };
}

export function buildSwissKnifeMcpPlusPlusControlSurfaceContract() {
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [{ id: 'swissknife.mcp_plus_plus.mcp-server', kind: 'mcp_server' }],
      intent_bindings: [
        {
          intent: 'swissknife.mcp_plus_plus.execute_with_envelope',
          method: 'mcpplusplus.execute_with_envelope',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'interface_cid'],
        },
      ],
      logic_bindings: [{ norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'] }],
    },
  };
}

export function buildSwissKnifeMcpPlusPlusInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-mcp-plus-plus:execute-with-envelope:1',
    surface: 'mcp_server',
    normalized_intent: {
      method: 'mcpplusplus.execute_with_envelope',
      arguments: { arguments_hash: 'sha256:swissknife-mcp-plus-plus-execute-with-envelope' },
    },
  };
}
