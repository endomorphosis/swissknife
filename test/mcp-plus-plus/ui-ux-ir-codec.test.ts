/**
 * UIR-032 — SwissKnife TypeScript UI/UX IR codec tests.
 *
 * Validates field closure, set/order semantics, canonical bytes, error classes,
 * and MCP UI profile conversion losses against the Python ui-ux-ir/v1 contract.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_UI_UX_IR_SCHEMA_VERSION,
  ReviewStatus,
  TerminalOutcomeKind,
  UIIR_DOCUMENT_FIELDS,
  UIIR_REQUIRED_PATHS,
  UIIRDecodeError,
  UIIRValidationError,
  UI_UX_IR_SCHEMA_VERSION,
  canonicalizeUiIr,
  convertMcpUiProfileToUiIr,
  decodeUiIr,
  uiIrIdentity,
  uiIrSha256,
  uiIrToDict,
  type UIIRDocument,
} from '../../src/services/mcp/ui-ux-ir-codec';
import {
  SWISSKNIFE_MCP_UI_PROFILE,
  SWISSKNIFE_MCP_UI_PROFILE_VERSION,
  type MCPUIProfileDescriptor,
} from '../../src/services/mcp/mcp-ui-profile';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

/** Shared fixture matching Python test_versioning._minimal_document(). */
function minimalDocumentPayload(): Record<string, unknown> {
  return {
    schema_version: UI_UX_IR_SCHEMA_VERSION,
    document_id: 'doc:form-v1',
    title: 'Sample form',
    sources: [
      {
        ref_id: 'source:form-v1',
        source_uri: 'https://example.test/ui/form',
        source_id: 'form-v1',
        source_revision: 'rev-1',
        content_sha256: SHA_A,
        container_uri: 'ipfs://bafy-fixture/form',
        container_sha256: SHA_B,
        content_cid: '',
        license_expression: '',
        review_status: ReviewStatus.TRUSTED_FIXTURE,
        span: { start_char: 0, end_char: 120 },
      },
    ],
    components: [
      {
        component_id: 'component:root',
        role: 'form',
        purpose: 'Collect a value and submit it.',
        accessible_name_ref: 'loc:form-title',
        accessible_description_ref: '',
        parent_id: '',
        child_ids: ['component:submit'],
        modality_binding_ids: [],
        data_binding_ids: [],
        program_binding_ids: [],
        feedback_ids: [],
        privacy_sensitivity: 'none',
        presentation_classification: 'interactive',
        source_ref_ids: ['source:form-v1'],
      },
      {
        component_id: 'component:submit',
        role: 'button',
        purpose: 'Submit the form.',
        accessible_name_ref: '',
        accessible_description_ref: '',
        parent_id: 'component:root',
        child_ids: [],
        modality_binding_ids: [],
        data_binding_ids: [],
        program_binding_ids: [],
        feedback_ids: [],
        privacy_sensitivity: 'none',
        presentation_classification: 'interactive',
        source_ref_ids: ['source:form-v1'],
      },
    ],
    entry_components: ['component:root'],
    terminal_outcomes: [
      {
        outcome_id: 'outcome:success',
        kind: TerminalOutcomeKind.SUCCESS,
        description: '',
        source_ref_ids: ['source:form-v1'],
      },
    ],
  };
}

/**
 * Python-equivalent canonicalization for cross-check:
 * sort mapping keys recursively, compact JSON, ensure_ascii, utf-8.
 */
function pythonStyleCanonicalBytes(payload: Record<string, unknown>): Buffer {
  const normalize = (value: unknown): unknown => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) {
        out[key] = normalize(obj[key]);
      }
      return out;
    }
    if (Array.isArray(value)) return value.map(normalize);
    return value;
  };
  const text = JSON.stringify(normalize(payload)).replace(
    /[\u007f-\uffff]/g,
    ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return Buffer.from(text, 'utf8');
}

function datasetDescriptor(
  overrides: Partial<MCPUIProfileDescriptor> = {},
): MCPUIProfileDescriptor {
  const descriptor: MCPUIProfileDescriptor = {
    name: 'ipfs-dataset-workbench',
    namespace: 'org.endomorphosis.ipfs_datasets_py',
    version: '1.0.0',
    methods: [
      {
        name: 'browse',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
        output_schema: {
          type: 'object',
          properties: { entries: { type: 'array' } },
          required: ['entries'],
        },
      },
      {
        name: 'pin',
        input_schema: {
          type: 'object',
          properties: { cid: { type: 'string' } },
          required: ['cid'],
        },
        output_schema: {
          type: 'object',
          properties: { job_id: { type: 'string' } },
          required: ['job_id'],
        },
      },
    ],
    errors: [{ name: 'NotFound' }, { name: 'Unauthorized' }],
    requires: [],
    compatibility: {
      compatible_with: [],
      supersedes: [],
    },
    semanticTags: ['ipfs', 'dataset'],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    meta: {
      profile: SWISSKNIFE_MCP_UI_PROFILE,
      profile_version: SWISSKNIFE_MCP_UI_PROFILE_VERSION,
      app_id: 'ipfs-dataset-workbench',
      title: 'IPFS Dataset Workbench',
      publisher: 'endomorphosis',
      icon: 'dataset.svg',
    },
    services: [
      {
        id: 'datasets',
        interface_type: 'dataset',
        transport: 'mcp-server',
        endpoint: 'mcp://datasets',
        operations: ['browse', 'pin'],
      },
    ],
    ui: {
      primary_template: 'explorer',
      templates: [
        {
          kind: 'explorer',
          operations: ['browse', 'pin'],
          regions: [
            { id: 'browser', kind: 'table', operation: 'browse' },
            { id: 'pin-status', kind: 'timeline', operation: 'pin' },
          ],
        },
      ],
      sections: [
        { id: 'browser', title: 'Browse', kind: 'table', operation: 'browse' },
      ],
    },
    data_contracts: {
      operations: [
        {
          method: 'browse',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
          output_schema: {
            type: 'object',
            properties: { entries: { type: 'array' } },
            required: ['entries'],
          },
          stream: { kind: 'events' },
        },
        {
          method: 'pin',
          input_schema: {
            type: 'object',
            properties: { cid: { type: 'string' } },
            required: ['cid'],
          },
          output_schema: {
            type: 'object',
            properties: { job_id: { type: 'string' } },
            required: ['job_id'],
          },
          stream: { kind: 'progress' },
          retry_policy: { max_attempts: 3, backoff_ms: 250 },
        },
      ],
      schemas: {
        Entry: { type: 'object', properties: { name: { type: 'string' } } },
      },
    },
    permissions: {
      default_deny: true,
      operations: {
        browse: ['dataset.read'],
        pin: ['dataset.write'],
      },
    },
    state_model: {
      keys: ['selected_path', 'pin_job'],
      events: ['browse.completed', 'pin.progress'],
      projections: ['browser_table'],
      replay: true,
    },
    workflow_graph: {
      id: 'wf-pin-after-browse',
      title: 'Browse then pin',
      shared_state_keys: ['selected_path'],
      steps: [
        {
          id: 'step-browse',
          operation: 'browse',
          write_state_keys: ['selected_path'],
        },
        {
          id: 'step-pin',
          operation: 'pin',
          depends_on: ['step-browse'],
          read_state_keys: ['selected_path'],
          rollback: { operation: 'browse', reason: 'restore selection' },
        },
      ],
    },
    trust: {
      signed_by: 'did:key:zTest',
      signature_algorithm: 'Ed25519',
      signature: 'sig-bytes',
      signed_at: '2026-08-04T00:00:00Z',
      canonical_cid: 'sha256:' + 'c'.repeat(64),
    },
    control_surface_contract: {
      version: '1',
      control_surfaces: [],
      intent_bindings: [],
      policy_hooks: {
        compile_api: 'compile',
        evaluate_api: 'evaluate',
        decision_receipt: true,
      },
      context_schema: {},
      conflict_resolution: { default: 'deny' },
      logic_bindings: [],
      mediation_receipts: {},
    },
    ...overrides,
  };
  return descriptor;
}

describe('UIIRTypeScriptCodec@1 field closure', () => {
  it('exposes the closed document field set and required paths', () => {
    expect(new Set(UIIR_DOCUMENT_FIELDS)).toEqual(
      new Set([
        'schema_version',
        'document_id',
        'title',
        'locale_defaults',
        'tags',
        'sources',
        'producer',
        'configuration',
        'review',
        'trust_bindings',
        'components',
        'composition_edges',
        'layout_regions',
        'layout_constraints',
        'design_token_refs',
        'state_variables',
        'states',
        'events',
        'transitions',
        'guards',
        'effects',
        'ux_tasks',
        'journeys',
        'success_failure_recovery',
        'feedback_contracts',
        'accessibility',
        'localization',
        'input_modality_requirements',
        'output_modality_requirements',
        'modality_alternatives',
        'device_capability_requirements',
        'adaptive_variants',
        'data_bindings',
        'content_references',
        'program_bindings',
        'intent_ir_bindings',
        'invocation_bindings',
        'mcp_idl_bindings',
        'formal_constraint_refs',
        'proof_obligation_refs',
        'entry_components',
        'initial_states',
        'terminal_outcomes',
        'extensions',
      ]),
    );
    expect(new Set(UIIR_REQUIRED_PATHS)).toEqual(
      new Set([
        'schema_version',
        'document_id',
        'title',
        'sources',
        'components',
        'entry_components',
        'terminal_outcomes',
      ]),
    );
  });

  it('never emits TypeScript-only keys in the closed toDict payload', () => {
    const decoded = decodeUiIr(minimalDocumentPayload());
    const wire = uiIrToDict(decoded);
    const keys = Object.keys(wire).sort();
    expect(keys).toEqual([...UIIR_DOCUMENT_FIELDS].sort());
    for (const key of keys) {
      expect(UIIR_DOCUMENT_FIELDS).toContain(key);
    }
  });
});

describe('decode / validate error classes', () => {
  it('decodes a minimal valid document', () => {
    const decoded = decodeUiIr(minimalDocumentPayload());
    expect(decoded.document_id).toBe('doc:form-v1');
    expect(decoded.schema_version).toBe(UI_UX_IR_SCHEMA_VERSION);
    expect(decoded.components).toHaveLength(2);
    expect(decoded.entry_components).toEqual(['component:root']);
  });

  it('rejects unknown schema versions with UIIRDecodeError', () => {
    const bad = { ...minimalDocumentPayload(), schema_version: 'ui-ux-ir/v9' };
    expect(() => decodeUiIr(bad)).toThrow(UIIRDecodeError);
    expect(() => decodeUiIr(bad)).toThrow(/Unsupported schema_version/);
  });

  it('rejects legacy schema versions that require migration', () => {
    const legacy = {
      ...minimalDocumentPayload(),
      schema_version: LEGACY_UI_UX_IR_SCHEMA_VERSION,
    };
    expect(() => decodeUiIr(legacy)).toThrow(UIIRDecodeError);
    expect(() => decodeUiIr(legacy)).toThrow(/migration/);
  });

  it('rejects unknown top-level fields (field closure)', () => {
    const unknown = {
      ...minimalDocumentPayload(),
      not_a_field: true,
    };
    expect(() => decodeUiIr(unknown)).toThrow(UIIRDecodeError);
    expect(() => decodeUiIr(unknown)).toThrow(/unknown UIIRDocument field/);
  });

  it('rejects missing required paths', () => {
    const missing = { ...minimalDocumentPayload() };
    delete missing.title;
    expect(() => decodeUiIr(missing)).toThrow(UIIRDecodeError);
    expect(() => decodeUiIr(missing)).toThrow(/missing required/);
  });

  it('rejects dangling component references', () => {
    const dangling = minimalDocumentPayload();
    (dangling.entry_components as string[]).push('component:missing');
    expect(() => decodeUiIr(dangling)).toThrow(UIIRDecodeError);
    expect(() => decodeUiIr(dangling)).toThrow(/unknown ids/);
  });

  it('rejects executable callback keys', () => {
    const bad = minimalDocumentPayload();
    (bad.components as Array<Record<string, unknown>>)[0].on_click = 'alert(1)';
    expect(() => decodeUiIr(bad)).toThrow(UIIRDecodeError);
    expect(() => decodeUiIr(bad)).toThrow(/executable callback/);
  });

  it('rejects non-object payloads', () => {
    expect(() => decodeUiIr('[]')).toThrow(UIIRDecodeError);
    expect(() => decodeUiIr(42)).toThrow(UIIRDecodeError);
  });

  it('UIIRDecodeError is a UIIRValidationError subclass', () => {
    const err = new UIIRDecodeError('x');
    expect(err).toBeInstanceOf(UIIRValidationError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UIIRDecodeError');
  });
});

describe('canonical bytes and set/order semantics', () => {
  it('is deterministic and independent of input key order', () => {
    const decoded = decodeUiIr(minimalDocumentPayload());
    const first = canonicalizeUiIr(decoded);
    const second = canonicalizeUiIr(decoded);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(uiIrSha256(decoded).startsWith('sha256:')).toBe(true);

    const payload = uiIrToDict(decoded);
    const reordered: Record<string, unknown> = {};
    for (const key of Object.keys(payload).sort().reverse()) {
      reordered[key] = payload[key];
    }
    const again = canonicalizeUiIr(decodeUiIr(reordered));
    expect(Buffer.from(again).equals(Buffer.from(first))).toBe(true);
  });

  it('sorts set-like collections and preserves ordered child_ids', () => {
    const payload = minimalDocumentPayload();
    // Reverse component order and entry_components; set-like must normalize.
    payload.components = [...(payload.components as unknown[])].reverse();
    payload.entry_components = ['component:root', 'component:root'];
    (payload.components as Array<Record<string, unknown>>)[0].source_ref_ids = [
      'source:form-v1',
      'source:form-v1',
    ];
    // Ordered: child_ids retain document order (only one child here).
    const decoded = decodeUiIr(payload);
    const wire = uiIrToDict(decoded);
    const components = wire.components as Array<Record<string, unknown>>;
    expect(components.map(c => c.component_id)).toEqual([
      'component:root',
      'component:submit',
    ]);
    expect(wire.entry_components).toEqual(['component:root']);
    const root = components.find(c => c.component_id === 'component:root')!;
    expect(root.child_ids).toEqual(['component:submit']);
    expect(root.source_ref_ids).toEqual(['source:form-v1']);
  });

  it('matches Python-style recursive key sort + compact JSON bytes', () => {
    const decoded = decodeUiIr(minimalDocumentPayload());
    const wire = uiIrToDict(decoded);
    const expected = pythonStyleCanonicalBytes(wire);
    const actual = Buffer.from(canonicalizeUiIr(decoded));
    expect(actual.equals(expected)).toBe(true);
    const digest = createHash('sha256').update(expected).digest('hex');
    expect(uiIrSha256(decoded)).toBe(`sha256:${digest}`);
  });

  it('round-trips through JSON string and Uint8Array payloads', () => {
    const decoded = decodeUiIr(minimalDocumentPayload());
    const bytes = canonicalizeUiIr(decoded);
    const fromBytes = decodeUiIr(bytes);
    const fromString = decodeUiIr(new TextDecoder().decode(bytes));
    expect(uiIrSha256(fromBytes)).toBe(uiIrSha256(decoded));
    expect(uiIrSha256(fromString)).toBe(uiIrSha256(decoded));
  });

  it('uiIrIdentity reports digest and byte length', () => {
    const decoded = decodeUiIr(minimalDocumentPayload());
    const identity = uiIrIdentity(decoded);
    expect(identity.schema_version).toBe(UI_UX_IR_SCHEMA_VERSION);
    expect(identity.digest).toBe(uiIrSha256(decoded));
    expect(identity.byte_length).toBe(canonicalizeUiIr(decoded).byteLength);
  });

  it('rejects canonicalize of unsupported schema_version', () => {
    const bad = {
      ...uiIrToDict(decodeUiIr(minimalDocumentPayload())),
      schema_version: 'ui-ux-ir/v9',
    } as UIIRDocument;
    expect(() => canonicalizeUiIr(bad)).toThrow(UIIRValidationError);
  });
});

describe('MCP UI profile conversion', () => {
  it('maps methods, UI structure, state, and trust subject; lists every loss', () => {
    const profile = datasetDescriptor();
    const result = convertMcpUiProfileToUiIr(profile, {
      contentSha256: SHA_A,
    });

    expect(result.lossy).toBe(true);
    expect(result.losses.length).toBeGreaterThan(0);

    const { document } = result;
    expect(document.schema_version).toBe(UI_UX_IR_SCHEMA_VERSION);
    expect(document.title).toBe('IPFS Dataset Workbench');
    expect(document.sources).toHaveLength(1);
    expect(document.components.length).toBeGreaterThanOrEqual(3); // root + methods
    expect(document.program_bindings?.length).toBe(2);
    expect(document.mcp_idl_bindings?.length).toBe(2);
    expect(document.layout_regions?.length).toBeGreaterThan(0);
    expect(document.ux_tasks?.length).toBeGreaterThan(0);
    expect(document.state_variables?.map(v => v.variable_id).sort()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('selected_path'),
        expect.stringContaining('pin_job'),
      ]),
    );
    expect(document.trust_bindings?.[0]?.subject_ref).toContain('sha256:');
    expect(document.extensions?.[0]?.namespace).toBe(
      'swissknife.mcp_ui_profile',
    );

    // Mapped semantics retained after decode/canonicalize.
    const redecoded = decodeUiIr(uiIrToDict(document));
    expect(uiIrSha256(redecoded)).toBe(uiIrSha256(document));
    expect(redecoded.program_bindings?.map(b => b.target_ref).sort()).toEqual(
      document.program_bindings?.map(b => b.target_ref).sort(),
    );

    // Every loss has a stable path + reason; paths are unique enough to audit.
    const paths = result.losses.map(loss => loss.path);
    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b, 'en')));
    for (const loss of result.losses) {
      expect(loss.path.length).toBeGreaterThan(0);
      expect(loss.reason.length).toBeGreaterThan(0);
    }

    // Critical unmapped profile surfaces must appear in the loss list.
    const joined = paths.join('\n');
    expect(joined).toMatch(/permissions/);
    expect(joined).toMatch(/control_surface_contract/);
    expect(joined).toMatch(/observability/);
    expect(joined).toMatch(/interaction_patterns/);
    expect(joined).toMatch(/errors/);
    expect(joined).toMatch(/compatibility/);
    expect(joined).toMatch(/trust\.signature_material/);
    expect(joined).toMatch(/state_model\.projections/);
    expect(joined).toMatch(/state_model\.replay/);
    expect(joined).toMatch(/data_contracts\.schemas/);
    expect(joined).toMatch(/meta\.icon/);
    expect(joined).toMatch(/stream/);
    expect(joined).toMatch(/retry_policy/);
    expect(joined).toMatch(/workflow_graph\.steps/);
    expect(joined).toMatch(/services\[datasets\]\.transport_endpoint/);
    expect(joined).toMatch(/input_schema|output_schema/);
  });

  it('produces a closed canonical document without inventing extra fields', () => {
    const result = convertMcpUiProfileToUiIr(datasetDescriptor(), {
      contentSha256: SHA_A,
    });
    const wire = uiIrToDict(result.document);
    expect(Object.keys(wire).sort()).toEqual([...UIIR_DOCUMENT_FIELDS].sort());
    const bytes = canonicalizeUiIr(result.document);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(uiIrSha256(result.document)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
