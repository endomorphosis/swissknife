/**
 * Integration tests for the MCP++ wired pipeline:
 *  - IDL auto-registration in getMCPTools / mcp-registry
 *  - Envelope building + receipt creation in callMCPTool flow
 *  - Event DAG recording per tool call
 *  - InterfaceRepository shared-instance / getSharedInstance()
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ── InterfaceRepository shared instance ──────────────────────────────────────

import { InterfaceRepository, computeInterfaceCID } from '../../src/services/mcp/mcp-idl.js';

describe('InterfaceRepository', () => {
  beforeEach(() => {
    // Reset singleton between tests
    (InterfaceRepository as unknown as { _instance: unknown })._instance = null;
  });

  it('getInstance() and getSharedInstance() return the same object', () => {
    const a = InterfaceRepository.getInstance();
    const b = InterfaceRepository.getSharedInstance();
    expect(a).toBe(b);
  });

  it('register() is idempotent — same descriptor yields same CID', () => {
    const repo = InterfaceRepository.getSharedInstance();
    const desc = {
      name: 'echo',
      namespace: 'test',
      version: '1.0.0',
      methods: [{ name: 'echo' }],
      errors: [],
      requires: [],
      compatibility: {},
    };
    const cid1 = repo.register(desc);
    const cid2 = repo.register(desc);
    expect(cid1).toBe(cid2);
    expect(repo.list()).toHaveLength(1);
  });

  it('registering a server descriptor populates the list', () => {
    const repo = InterfaceRepository.getSharedInstance();
    const desc = {
      name: 'my-server',
      namespace: 'mcp-server',
      version: '2.0.0',
      methods: [],
      errors: [],
      requires: [],
      compatibility: {},
      semanticTags: ['mcp-server'],
    };
    const cid = repo.register(desc);
    expect(repo.list()).toContain(cid);
    expect(repo.getDescriptor(cid)!.name).toBe('my-server');
  });
});

// ── buildEnvelope + buildReceipt roundtrip ───────────────────────────────────

import { buildEnvelope, buildReceipt, computeReceiptCID } from '../../src/services/mcp/mcp-envelope.js';

describe('Envelope → Receipt pipeline', () => {
  it('buildEnvelope carries interfaceCid from IDL', () => {
    const desc = {
      name: 'search',
      namespace: 'tools',
      version: '1.0.0',
      methods: [{ name: 'search', inputSchema: { type: 'object' } }],
      errors: [],
      requires: [],
      compatibility: {},
    };
    const interfaceCid = computeInterfaceCID(desc);

    const envelope = buildEnvelope(
      { toolName: 'search', params: { q: 'test' } },
      interfaceCid,
    );

    expect(envelope.interface_cid).toBe(interfaceCid);
    expect(envelope.input_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(envelope.intent_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(envelope.parents).toEqual([]);
  });

  it('buildReceipt produces a receipt with matching envelope_cid', () => {
    const envelope = buildEnvelope(
      { toolName: 'echo', params: { text: 'hello' } },
      'sha256:' + 'a'.repeat(64),
    );
    // buildReceipt computes the envelopeCid itself from the envelope contents
    const outputBytes = Buffer.from(JSON.stringify({ result: 'hello' }), 'utf8');

    const receipt = buildReceipt(envelope, outputBytes);

    expect(receipt.envelope_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt.output_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    // receipt_cid is derived via computeReceiptCID
    expect(computeReceiptCID(receipt)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('computeReceiptCID is stable for equivalent receipt payloads', () => {
    const envelope = buildEnvelope(
      { toolName: 'calc', params: { a: 1 } },
      'sha256:' + '0'.repeat(64),
    );
    const outputBytes = Buffer.from('{"answer":42}', 'utf8');

    const receipt = buildReceipt(envelope, outputBytes);
    const equivalentReceipt = {
      issuedAt: receipt.issuedAt,
      output_cid: receipt.output_cid,
      envelope_cid: receipt.envelope_cid,
      decision_cid: receipt.decision_cid,
    };
    expect(computeReceiptCID(receipt)).toBe(computeReceiptCID(equivalentReceipt));
  });
});

// ── EventDAG records from envelope ───────────────────────────────────────────

import { EventDAG } from '../../src/services/logic/shared/event-dag.js';

describe('EventDAG ← envelope integration', () => {
  it('appendEvent with envelope_cid links provenance correctly', () => {
    const dag = new EventDAG();
    const outputCid = 'sha256:' + 'f'.repeat(64);

    // Build an envelope and receipt to get the canonical envelope_cid
    const envelope = buildEnvelope(
      { toolName: 'some-tool', params: {} },
      'sha256:' + '2'.repeat(64),
    );
    const receipt = buildReceipt(envelope, Buffer.from('output', 'utf8'));

    const cid = dag.appendEvent({
      intent_cid: envelope.intent_cid,
      interface_cid: envelope.interface_cid,
      proofs: [],
      decision_outcome: 'PERMIT',
      outputs: [outputCid],
      parents: [],
      timestamp: new Date().toISOString(),
      envelope_cid: receipt.envelope_cid,
    });

    const provenance = dag.getProvenance(outputCid);
    expect(provenance.map(n => n.cid)).toContain(cid);
    expect(provenance[0].envelope_cid).toBe(receipt.envelope_cid);
  });

  it('parent CIDs from DAG tips are threaded into envelope', () => {
    const dag = new EventDAG();
    const tip1 = dag.appendEvent({
      intent_cid: 'sha256:' + 'a'.repeat(64),
      interface_cid: 'sha256:' + 'b'.repeat(64),
      proofs: ['sha256:proof'],
      decision_outcome: 'PERMIT',
      outputs: [],
      parents: [],
      timestamp: new Date().toISOString(),
    });

    // getTips() returns StoredEventNode[] — extract CIDs for use as parents
    const tipCids = dag.getTips().map(n => n.cid);
    expect(tipCids).toContain(tip1);

    const envelope = buildEnvelope(
      { toolName: 'next-call', params: {} },
      'sha256:' + 'c'.repeat(64),
      undefined,
      tipCids,
    );

    expect(envelope.parents).toContain(tip1);
  });
});

// ── IDL compat check after server registration ────────────────────────────────

describe('IDL compat check', () => {
  beforeEach(() => {
    (InterfaceRepository as unknown as { _instance: unknown })._instance = null;
  });

  it('returns compatible for a known descriptor with no requires', () => {
    const repo = InterfaceRepository.getSharedInstance();
    const cid = repo.register({
      name: 'simple',
      namespace: 'test',
      version: '1.0.0',
      methods: [],
      errors: [],
      requires: [],
      compatibility: {},
    });
    const verdict = repo.compat(cid);
    expect(verdict.compatible).toBe(true);
    expect(verdict.requiresMissing).toHaveLength(0);
  });

  it('returns incompatible with missing requires', () => {
    const repo = InterfaceRepository.getSharedInstance();
    const cid = repo.register({
      name: 'needs-ucan',
      namespace: 'test',
      version: '1.0.0',
      methods: [],
      errors: [],
      requires: ['mcp++/ucan'],
      compatibility: {},
    });
    const verdict = repo.compat(cid);
    // 'mcp++/ucan' is not registered in this isolated instance
    expect(verdict.compatible).toBe(false);
    expect(verdict.requiresMissing).toContain('mcp++/ucan');
  });
});

// ── Descriptor-only generated app workflow quality gate ─────────────────────

import { runGeneratedAppQualityGate } from '../../src/services/mcp/mcp-generated-app-quality-gates.js';
import { IPFS_MCP_UI_PROFILE_DESCRIPTORS } from '../../src/services/mcp/mcp-ipfs-ui-descriptors.js';

describe('Generated MCP++ app workflow pipeline', () => {
  it('chains dataset selection, pinning, inference, artifact collection, and publication', async () => {
    const report = await runGeneratedAppQualityGate({
      descriptors: IPFS_MCP_UI_PROFILE_DESCRIPTORS,
      app_id: 'ipfs-dataset-inference-workflow',
      invoke_operation: 'select_dataset',
      stream_operation: 'pin_dataset',
    });

    expect(report.workflow?.completed_steps).toEqual([
      'select_dataset',
      'pin_dataset',
      'run_inference',
      'collect_artifact',
      'publish_artifact',
    ]);
    expect(report.workflow?.final_state).toMatchObject({
      artifact_cid: 'bafybeigdyrzt5artifact',
      publication_id: 'quality-gate-publication',
    });
    expect(report.workflow?.recovery_paths).toMatchObject({
      failed_pin_retry: true,
      failed_inference_rollback: true,
      stream_reconnect: true,
      artifact_publish_retry: true,
    });
  });
});
