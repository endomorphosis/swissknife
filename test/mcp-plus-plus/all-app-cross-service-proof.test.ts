/** @vitest-environment node */
import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  EXECUTABLE_BACKEND_OWNERS,
} from '../../src/services/apps/all-app-executable-backend-contract';
import {
  ALL_APP_TOOL_MATRIX_SCHEMA,
  KDA_RECEIPT_CATALOG_SCHEMA,
  buildAllAppCrossServiceProof,
  validateAllAppCrossServiceProof,
  type LiveGatewayEvidence,
  type PeerEvidence,
} from '../../src/services/mcp/all-app-cross-service-proof';

const CID = 'bafkreig3xelgbpuk2x24kzhl75fhsxwaa2wudhivemvohz2mrwr2fajhcy';
const DID = 'did:key:z6MkvAUPBCMQzakz16QeKSg68XSeewjGUvpzUjxQGD33qwKu';

describe('SVD-181 cross-service all-application proof', () => {
  it('keeps semantic roles separate from diagnostic status and preserves live receipt evidence', () => {
    const proof = buildAllAppCrossServiceProof({
      generatedAt: '2026-07-21T12:00:00.000Z',
      liveGatewayEvidence: liveEvidence(),
      peerEvidence: peerEvidence(),
    });
    const validation = validateAllAppCrossServiceProof(proof);
    expect(validation, validation.errors.join('\n')).toEqual({ valid: true, errors: [] });
    expect(proof.matrix).toMatchObject({
      schema: ALL_APP_TOOL_MATRIX_SCHEMA,
      task_id: 'SVD-181',
      status: 'passed',
      summary: {
        app_count: 45,
        primary_semantic_role_count: 79,
        diagnostic_kda_row_count: 135,
        live_application_execution_count: 101,
        real_server_safe_read_count: 6,
        real_application_safe_read_count: 6,
      },
      acceptance: {
        primary_roles_separate_from_diagnostic_status: true,
        real_safe_read_over_http_and_libp2p_for_each_reachable_server: true,
        governed_writes_confirmation_gated_dry_run: true,
      },
    });
    expect(proof.receiptCatalog).toMatchObject({
      schema: KDA_RECEIPT_CATALOG_SCHEMA,
      status: 'passed',
      summary: { server_count: 3, transport_count: 6, real_safe_read_count: 6 },
    });

    const apps = (proof.matrix as any).apps;
    const terminal = apps.find((app: any) => app.app_id === 'terminal');
    expect(terminal.semantic_backend_roles.roles.length).toBeGreaterThan(0);
    expect(terminal.diagnostic_kda_status.rows).toHaveLength(3);
    expect(terminal.diagnostic_kda_status.rows.every((row: any) => row.diagnostic_only)).toBe(true);
    const calculator = apps.find((app: any) => app.app_id === 'calculator');
    expect(calculator.semantic_backend_roles.roles).toEqual([]);
    expect(calculator.diagnostic_kda_status.rows).toHaveLength(3);

    const governedExecutions = apps.flatMap((app: any) => app.semantic_backend_roles.roles)
      .filter((role: any) => role.mutates_remote_state)
      .flatMap((role: any) => role.executions);
    expect(governedExecutions.length).toBeGreaterThan(0);
    expect(governedExecutions.every((row: any) =>
      row.execution_mode === 'confirmation_gated_dry_run'
      && row.policy.outcome === 'require_confirmation'
      && row.confirmation.dry_run === true)).toBe(true);
  });

  it('fails closed when a governed write loses its confirmation decision', () => {
    const live = liveEvidence();
    const write = live.executions!.find(execution =>
      execution.invocation?.operation_class === 'governed_write_request')!;
    write.policy!.outcome = 'allow';
    expect(() => buildAllAppCrossServiceProof({
      generatedAt: '2026-07-21T12:00:00.000Z',
      liveGatewayEvidence: live,
      peerEvidence: peerEvidence(),
    })).toThrow(/confirmation-gated dry run/);
  });

  it('rejects a checked-in matrix when call-bound evidence is removed', () => {
    const proof = buildAllAppCrossServiceProof({
      generatedAt: '2026-07-21T12:00:00.000Z',
      liveGatewayEvidence: liveEvidence(),
      peerEvidence: peerEvidence(),
    });
    const apps = (proof.matrix as any).apps;
    const execution = apps.find((app: any) => app.semantic_backend_roles.roles.length > 0)
      .semantic_backend_roles.roles[0].executions[0];
    execution.descriptor_cid = null;
    const validation = validateAllAppCrossServiceProof(proof);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toMatch(/DID\/descriptor\/policy\/receipt\/event evidence incomplete/);
  });
});

function liveEvidence(): LiveGatewayEvidence {
  const executions = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app =>
    app.backend_bindings.flatMap(binding =>
      binding.transport_policy.allowed_transports.map(transport => {
        const governed = binding.mediated_intent.mutates_remote_state;
        const realSafeRead = app.app_id === 'mcp-control' && !governed;
        const correlationId = `desktop:${binding.binding_id}:${transport}`;
        return {
          app_id: app.app_id,
          binding_id: binding.binding_id,
          ui_control_id: `live-gateway-control-${binding.binding_id}`,
          owner: binding.owner,
          selected_tool_id: binding.tool_selection.preferred_tool_ids[0],
          selected_transport: transport,
          correlation_id: correlationId,
          invocation: {
            narrow_non_mutating_input: !governed,
            dry_run: !realSafeRead,
            operation_class: governed ? 'governed_write_request' : 'read_request',
            confirmation_required: governed,
            real_safe_read: realSafeRead,
            confirmation_or_policy: governed
              ? 'confirmation_gated_dry_run'
              : realSafeRead ? 'safe_read_not_required' : 'safe_read_dry_run',
          },
          request: { route: '/mcp/tools/call', same_origin: true },
          policy: {
            outcome: governed ? 'require_confirmation' : 'allow',
            decision_id: `policy:${binding.binding_id}`,
            consent: governed ? 'granted' : 'not_required',
            dry_run: !realSafeRead,
          },
          response: { outcome: 'executed', ok: true, http_status: 200 },
          receipt_refs: [CID],
          event_dag_refs: [CID],
          persistence: { status: 'persisted', receipt_cid: CID, event_cid: CID },
          transport_observation: {
            transport,
            descriptor_cid: CID,
            ucan_did_verified: true,
            remote_did: DID,
            identity_proof_cid: CID,
            correlation_id: correlationId,
          },
          no_backend_urls_or_credentials_exposed: true,
        };
      }),
    ));
  return {
    schema: 'swissknife.all-app-live-gateway-executions.v2',
    task_id: 'SVD-126',
    generated_at: '2026-07-21T11:00:00.000Z',
    status: 'passed',
    execution_origin: 'canonical-virtual-desktop-browser',
    executions,
  };
}

function peerEvidence(): PeerEvidence {
  return {
    schema: 'swissknife.all_tools_peer_interoperability_evidence.v1',
    task_id: 'SVD-100',
    generated_at: '2026-07-21T11:30:00.000Z',
    decision: 'go',
    services: EXECUTABLE_BACKEND_OWNERS.map(owner => ({
      service: owner,
      decision: 'go',
      approved_fixture: { tool: `safe_read_${owner}`, arguments: {}, approval: 'non-mutating read' },
      gates: [{ id: 'all', passed: true, reason: null }],
      transports: Object.fromEntries((['http', 'libp2p'] as const).map(transport => [transport, {
        connected: true,
        selected_transport: transport,
        no_transport_fallback: true,
        normalized_negotiated_profiles: ['idl', 'cid-envelope', 'ucan', 'event-dag', ...(transport === 'libp2p' ? ['p2p-transport'] : [])],
        descriptor: { retrieved_cids: [CID], cid_retrieval_complete: true, compatible: true, method_names: [`safe_read_${owner}`] },
        identity: { verified: true, remote_did: DID, identity_proof_cid: CID, peer_id: '12D3KooWfixture' },
      }])),
      fixture: {
        tool: `safe_read_${owner}`,
        arguments: {},
        approval: 'non-mutating read',
        transport_results: Object.fromEntries((['http', 'libp2p'] as const).map(transport => [transport, {
          tool: `safe_read_${owner}`,
          status: 'executed',
          governance: {
            operation_class: 'safe_read',
            mutates_remote_state: false,
            confirmation_required: false,
            confirmation_state: 'not_required',
            dry_run: false,
            policy_decision_id: `policy:${owner}:${transport}`,
            policy_outcome: 'allow',
            correlation_id: `safe-read:${owner}:${transport}`,
          },
          delegation: { proof_cid: CID, valid: true },
          plain_call: { returned: true, outcome: 'success' },
          envelope: {
            interface_cid: CID,
            input_cid: CID,
            intent_cid: CID,
            envelope_cid: CID,
            output_cid: CID,
            receipt_cid: CID,
            event_cid: CID,
            receipt_success: true,
            artifact_persistence_complete: true,
          },
          cid_retrieval: { all_expected_cids_present: true, all_found_verified: true, artifacts: [] },
          event_dag: { execution_event_present: true, provenance_visible: true, event_cid: CID },
          error: null,
        }])),
      },
    })),
  };
}
