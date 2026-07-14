/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import {
  AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_ID,
  AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_SCHEMA,
  AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_SCHEMA,
  AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_TASK_ID,
  buildAgentSupervisorExpandedIOEnvelopes,
  validateAgentSupervisorExpandedIOEnvelopes,
  type AgentSupervisorExpandedIOEnvelopeCatalog,
  type ExpandedIOServiceBinding,
} from '../../src/services/apps/agent-supervisor-expanded-io-envelopes';
import {
  EXPANDED_IO_MODALITIES,
  buildAgentSupervisorExpandedIOMap,
} from '../../src/services/glasses/agent-supervisor-expanded-io-map';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidencePath = join(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
  'agent-supervisor-expanded-io-envelopes.json',
);
const generatedAt = '2026-07-14T00:00:00.000Z';

let catalog: AgentSupervisorExpandedIOEnvelopeCatalog;

describe('SVD-069 MCP++ expanded Meta glasses I/O permission and receipt envelopes', () => {
  beforeAll(() => {
    catalog = buildAgentSupervisorExpandedIOEnvelopes(buildAgentSupervisorExpandedIOMap(), {
      generatedAt,
      dryRun: true,
    });
    actualFs.mkdirSync(dirname(evidencePath), { recursive: true });
    actualFs.writeFileSync(evidencePath, `${JSON.stringify(catalog, null, 2)}\n`);
  });

  it('publishes deterministic content-addressed envelopes for every app and expanded I/O action', () => {
    const map = buildAgentSupervisorExpandedIOMap();
    const artifact = JSON.parse(
      actualFs.readFileSync(evidencePath, 'utf8'),
    ) as AgentSupervisorExpandedIOEnvelopeCatalog;

    expect(catalog).toMatchObject({
      schema: AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_SCHEMA,
      catalog_id: AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_ID,
      task_id: AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_TASK_ID,
      generated_at: generatedAt,
      source_map_cid: map.map_cid,
      safe_dry_run: true,
      physical_hardware_claimed: false,
      app_count: map.app_count,
      envelope_count: map.app_count * EXPANDED_IO_MODALITIES.length,
    });
    expect(catalog.catalog_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(new Set(catalog.envelopes.map(envelope => envelope.envelope_id)).size)
      .toBe(catalog.envelope_count);
    expect(new Set(catalog.envelopes.map(envelope => envelope.envelope_cid)).size)
      .toBe(catalog.envelope_count);
    expect(artifact).toEqual(catalog);
    expect(validateAgentSupervisorExpandedIOEnvelopes(artifact, map)).toEqual({ valid: true, errors: [] });
  });

  it('carries permission, redaction, confirmation, receipt, DAG, rollback, and timeout/cancel fields on every envelope', () => {
    for (const envelope of catalog.envelopes) {
      expect(envelope.schema).toBe(AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_SCHEMA);
      expect(envelope.service_family).toBe('ipfs_accelerate_py');
      expect(envelope.tool_name).toBe('WorkflowCoordinator.submit_task');
      expect(envelope.permission_scope).toMatch(/^meta_glasses\./);
      expect(['none', 'privacy-filtered', 'transcript-redacted', 'metadata-only', 'secret-values-blocked'])
        .toContain(envelope.redaction_policy);
      expect(['not-required', 'pending', 'confirmed', 'denied']).toContain(envelope.confirmation_state);
      expect(envelope.permission.confirmation_state).toBe(envelope.confirmation_state);
      expect(envelope.receipt_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(envelope.event_dag_ref).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(envelope.event_dag_refs).toEqual([
        expect.objectContaining({
          event_cid: envelope.event_dag_ref,
          parents: [envelope.receipt_cid],
          storage_service_family: 'ipfs_kit_py',
          storage_tool_name: 'dag_put',
        }),
      ]);
      expect(envelope.rollback_token).toMatch(/^rollback:sha256:[0-9a-f]{64}$/);
      expect(envelope.rollback.rollback_token).toBe(envelope.rollback_token);
      expect(envelope.timeout_ms).toBeGreaterThan(0);
      expect(envelope.cancel_supported).toBe(true);
      expect(envelope.timeout_cancel).toMatchObject({
        timeout_ms: envelope.timeout_ms,
        on_timeout: 'cancel-job-preserve-receipt-and-fallback',
        cancel_supported: true,
        cancel_service_family: 'ipfs_accelerate_py',
        cancel_tool_name: 'cancel_task',
        cancellation_signal: 'AbortSignal',
        on_cancel: 'stop-device-io-preserve-receipt-and-fallback',
        fallback_order: ['mobile-card', 'desktop-only'],
      });
      expect(envelope.operator_visible).toBe(true);
      expect(envelope.physical_hardware_claimed).toBe(false);
    }
  });

  it('assigns execution, storage, DAG, indexing, provenance, and search to the required Python services', () => {
    const expected: Array<[ExpandedIOServiceBinding['role'], string, string]> = [
      ['supervisor-job-execution', 'ipfs_accelerate_py', 'WorkflowCoordinator.submit_task'],
      ['artifact-storage', 'ipfs_kit_py', 'ipfs_add'],
      ['event-dag-storage', 'ipfs_kit_py', 'dag_put'],
      ['indexing', 'ipfs_datasets_py', 'load_index'],
      ['provenance', 'ipfs_datasets_py', 'record_provenance'],
      ['search', 'ipfs_datasets_py', 'semantic_search'],
    ];

    for (const envelope of catalog.envelopes) {
      expect(envelope.service_bindings).toHaveLength(expected.length);
      for (const [role, serviceFamily, toolName] of expected) {
        expect(envelope.service_bindings).toContainEqual(expect.objectContaining({
          role,
          service_family: serviceFamily,
          tool_name: toolName,
          dispatch_state: 'suppressed-dry-run',
        }));
      }
    }
    for (const [role] of expected) {
      expect(catalog.service_role_counts[role]).toBe(catalog.envelope_count);
    }
  });

  it('makes the default dry run incapable of device access, execution, or persistence', () => {
    for (const envelope of catalog.envelopes) {
      expect(envelope.dry_run).toBe(true);
      expect(envelope.permission.execution_allowed).toBe(false);
      expect(envelope.dry_run_behavior).toMatchObject({
        enabled: true,
        safe: true,
        device_io_performed: false,
        supervisor_job_dispatched: false,
        artifact_payload_persisted: false,
        event_dag_persisted: false,
        index_or_provenance_written: false,
        receipt_kind: 'deterministic-simulation',
      });
      expect(envelope.event_dag_refs[0].state).toBe('simulated');
      expect(envelope.rollback.mode).toBe('no-mutation');
    }
  });

  it('fails closed for denied or unconfirmed routes and enables only explicitly confirmed live routes', () => {
    const map = buildAgentSupervisorExpandedIOMap();
    const live = buildAgentSupervisorExpandedIOEnvelopes(map, {
      dryRun: false,
      confirmationStates: {
        'ai-chat/microphone.input': 'confirmed',
        'ai-chat/camera.photo_capture': 'denied',
      },
    });
    const confirmed = live.envelopes.find(envelope =>
      envelope.app_id === 'ai-chat' && envelope.modality === 'microphone.input');
    const declined = live.envelopes.find(envelope =>
      envelope.app_id === 'ai-chat' && envelope.modality === 'camera.photo_capture');
    const pending = live.envelopes.find(envelope =>
      envelope.app_id === 'ai-chat' && envelope.modality === 'speaker.output');
    const unsupported = live.envelopes.find(envelope =>
      envelope.app_id === 'calculator' && envelope.modality === 'camera.video_capture');
    const display = live.envelopes.find(envelope =>
      envelope.app_id === 'calculator' && envelope.modality === 'display.output');

    expect(confirmed).toMatchObject({
      confirmation_state: 'confirmed',
      permission: { decision: 'permit', execution_allowed: true },
      rollback: { mode: 'compensating-receipt' },
    });
    expect(confirmed?.service_bindings.every(binding => binding.dispatch_state === 'ready')).toBe(true);
    expect(declined).toMatchObject({
      confirmation_state: 'denied',
      permission: { decision: 'deny', execution_allowed: false },
    });
    expect(pending).toMatchObject({
      confirmation_state: 'pending',
      permission: { decision: 'pending', execution_allowed: false },
    });
    expect(unsupported).toMatchObject({
      disposition: 'denied',
      binding: null,
      confirmation_state: 'denied',
      permission: { decision: 'deny', execution_allowed: false },
    });
    expect(display).toMatchObject({
      confirmation_state: 'not-required',
      permission: { decision: 'permit', execution_allowed: true },
    });
    expect(validateAgentSupervisorExpandedIOEnvelopes(live, map)).toEqual({ valid: true, errors: [] });
  });

  it('is byte deterministic and validation detects lineage, service, or dry-run drift', () => {
    const repeated = buildAgentSupervisorExpandedIOEnvelopes(buildAgentSupervisorExpandedIOMap(), {
      generatedAt,
      dryRun: true,
    });
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(catalog));

    const corrupt = JSON.parse(JSON.stringify(catalog)) as AgentSupervisorExpandedIOEnvelopeCatalog;
    const mutableEnvelope = corrupt.envelopes[0] as unknown as {
      receipt_cid: string;
      service_bindings: Array<ExpandedIOServiceBinding>;
    };
    mutableEnvelope.receipt_cid = 'sha256:bad';
    mutableEnvelope.service_bindings = mutableEnvelope.service_bindings.filter(
      binding => binding.role !== 'event-dag-storage',
    );
    const validation = validateAgentSupervisorExpandedIOEnvelopes(corrupt);

    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toContain('receipt and event-DAG refs must be CIDs');
    expect(validation.errors.join('\n')).toContain('event-dag-storage is not assigned to ipfs_kit_py:dag_put');
    expect(validation.errors.join('\n')).toContain('envelope_cid does not match the envelope body');
    expect(validation.errors.join('\n')).toContain('catalog_cid does not match the catalog body');
  });
});
