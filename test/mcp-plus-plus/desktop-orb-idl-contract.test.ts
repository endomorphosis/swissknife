/**
 * @vitest-environment node
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  VISIBLE_DESKTOP_APP_IDS,
} from '../../src/services/apps/virtual-desktop-app-manifest';
import {
  VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_ID,
  VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA,
  VIRTUAL_DESKTOP_ORB_IDL_TASK_ID,
  buildVirtualDesktopOrbIdlCompleteCoverage,
  validateVirtualDesktopOrbIdlCompleteCoverage,
  type DesktopOrbIdlModalityKind,
  type VirtualDesktopOrbIdlCompleteCoverage,
} from '../../src/services/glasses/desktop-orb-idl-contract';
import { computeInterfaceCID } from '../../src/services/mcp/mcp-idl';

const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const coveragePath = join(evidenceRoot, 'orb-idl-complete-coverage.json');
const schemaPath = join(process.cwd(), 'contracts/orb_idl_virtual_desktop_contract.schema.json');
const docPath = join(process.cwd(), 'docs/orb-idl-virtual-desktop-contract.md');

const expectedModalities: DesktopOrbIdlModalityKind[] = [
  'display',
  'camera',
  'speaker',
  'microphone',
  'input',
];

let coverage: VirtualDesktopOrbIdlCompleteCoverage;

describe('SWR-108 virtual desktop ORB/IDL complete coverage', () => {
  beforeAll(() => {
    coverage = buildVirtualDesktopOrbIdlCompleteCoverage(VIRTUAL_DESKTOP_APP_MANIFEST, {
      generatedAt: '2026-07-10T00:00:00.000Z',
    });
    mkdirSync(dirname(coveragePath), { recursive: true });
    writeFileSync(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`);
  });

  it('ships the JSON schema, docs, and generated coverage artifact', () => {
    expect(existsSync(schemaPath)).toBe(true);
    expect(existsSync(docPath)).toBe(true);
    expect(existsSync(coveragePath)).toBe(true);

    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const doc = readFileSync(docPath, 'utf8');
    const artifact = JSON.parse(readFileSync(coveragePath, 'utf8'));

    expect(schema.$id).toBe('https://hallucinate.app/contracts/orb_idl_virtual_desktop_contract.schema.json');
    expect(schema.properties.schema.const).toBe(VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA);
    expect(schema.$defs.appDescriptor.required).toEqual(expect.arrayContaining([
      'idl_descriptor',
      'modality_contract',
      'action_policy',
      'fallback_semantics',
      'glasses_projection',
    ]));
    expect(doc).toContain('SWR-108');
    expect(doc).toContain('agent-supervisor');
    expect(doc).toContain('orb-idl-complete-coverage.json');
    expect(artifact.schema).toBe(VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA);
  });

  it('validates one ORB/IDL descriptor for every canonical virtual desktop app', () => {
    const validation = validateVirtualDesktopOrbIdlCompleteCoverage(coverage, VIRTUAL_DESKTOP_APP_MANIFEST);

    expect(validation).toEqual({ valid: true, errors: [], warnings: [] });
    expect(coverage).toMatchObject({
      schema: VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA,
      contract_id: VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_ID,
      task_id: VIRTUAL_DESKTOP_ORB_IDL_TASK_ID,
      app_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
      descriptor_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
      modality_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length * expectedModalities.length,
      typed_fallback_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length * expectedModalities.length,
    });
    expect(coverage.expected_outputs).toEqual(expect.arrayContaining([
      'src/services/glasses',
      'contracts',
      'test-results/virtual-desktop-ipfs-mcp-orb/orb-idl-complete-coverage.json',
      'docs/orb-idl-virtual-desktop-contract.md',
    ]));
    expect(coverage.validation_commands).toEqual(expect.arrayContaining([
      'npm run evidence:mcp-glasses',
      'npm run typecheck:services',
    ]));
    expect(coverage.interface_cid_count).toBe(coverage.descriptor_count);

    const descriptorAppIds = coverage.descriptors.map(descriptor => descriptor.app_id).sort();
    expect(descriptorAppIds).toEqual(VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort());
    for (const id of VISIBLE_DESKTOP_APP_IDS) {
      expect(descriptorAppIds).toContain(id);
    }
  });

  it('makes display, camera, speaker, microphone, input, action policy, and fallback semantics explicit', () => {
    for (const descriptor of coverage.descriptors) {
      expect(Object.keys(descriptor.modality_contract).sort()).toEqual([...expectedModalities].sort());
      expect(descriptor.fallback_semantics.length).toBeGreaterThanOrEqual(expectedModalities.length);
      expect(descriptor.action_policy.desktop_policy_path).toBe('same-as-desktop-confirmation');
      expect(descriptor.idl_descriptor.methods.map(method => method.name)).toEqual(
        expect.arrayContaining(['read_status', 'read_receipts', 'request_action', 'request_fallback']),
      );
      expect(computeInterfaceCID(descriptor.idl_descriptor)).toBe(descriptor.interface_cid);

      for (const modality of Object.values(descriptor.modality_contract)) {
        expect(modality.fallback.kind).toBeTruthy();
        expect(modality.fallback.typed_reason).toBeTruthy();
        expect(modality.fallback.semantics).toBeTruthy();
        if (modality.availability === 'unsupported') {
          expect(modality.hardware_available).toBe(false);
          expect(modality.fallback.kind).toBe('unsupported-modality');
        }
      }
    }
    expect(coverage.unsupported_modality_count).toBeGreaterThan(0);
    expect(coverage.confirmed_policy_action_count).toBeGreaterThan(0);
  });

  it('keeps the Supervisor Console glasses projection read-only until the desktop confirmation policy path is used', () => {
    const supervisor = coverage.descriptors.find(descriptor => descriptor.app_id === 'agent-supervisor');

    expect(supervisor).toBeTruthy();
    expect(coverage.supervisor_console).toEqual({
      app_id: 'agent-supervisor',
      default_projection: 'read-only',
      status_read_only: true,
      receipts_read_only: true,
      steering_requires_confirmation: true,
      policy_path: 'same-as-desktop-confirmation',
    });
    expect(supervisor?.glasses_projection).toMatchObject({
      default_mode: 'read-only',
      status_read_only: true,
      receipts_read_only: true,
      steering_requires_confirmation: true,
    });
    expect(supervisor?.modality_contract.display.read_only).toBe(true);
    expect(supervisor?.modality_contract.input.read_only).toBe(true);
    expect(supervisor?.action_policy.glasses_policy_path).toBe('read-only-status');
    expect(supervisor?.action_policy.steering_requires_confirmed_policy_path).toBe(true);

    const status = supervisor?.action_policy.operation_policies.find(policy => policy.method === 'read_status');
    const receipts = supervisor?.action_policy.operation_policies.find(policy => policy.method === 'read_receipts');
    const steering = supervisor?.action_policy.operation_policies.find(policy => policy.method === 'request_prompt_steering');

    expect(status).toMatchObject({ read_only: true, confirmation: 'none' });
    expect(receipts).toMatchObject({ read_only: true, confirmation: 'none' });
    expect(steering).toMatchObject({
      read_only: false,
      confirmation: 'required_for_steering',
      fallback: {
        kind: 'confirmed-policy-path',
        target_surface: 'policy_console',
        typed_reason: 'policy_gate',
      },
    });
  });
});
