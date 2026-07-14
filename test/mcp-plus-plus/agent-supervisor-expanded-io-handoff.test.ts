/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import {
  AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_CATALOG_ID,
  AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_SCHEMA,
  AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID,
  buildAgentSupervisorExpandedIOHandoff,
  validateAgentSupervisorExpandedIOHandoff,
  type AgentSupervisorExpandedIOHandoffCatalog,
} from '../../src/services/glasses/agent-supervisor-expanded-io-handoff';
import { buildAgentSupervisorExpandedIOEnvelopes } from '../../src/services/apps/agent-supervisor-expanded-io-envelopes';
import { buildAgentSupervisorExpandedIOMap } from '../../src/services/glasses/agent-supervisor-expanded-io-map';
import { buildVirtualDesktopOrbIdlCompleteCoverage } from '../../src/services/glasses/desktop-orb-idl-contract';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidencePath = join(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
  'agent-supervisor-expanded-io-handoff.json',
);
const generatedAt = '2026-07-14T00:00:00.000Z';

let catalog: AgentSupervisorExpandedIOHandoffCatalog;

describe('SVD-071 expanded I/O ORB/IDL and Meta control-plane handoff packets', () => {
  beforeAll(() => {
    const ioMap = buildAgentSupervisorExpandedIOMap(undefined, { generatedAt });
    const envelopes = buildAgentSupervisorExpandedIOEnvelopes(ioMap, { generatedAt, dryRun: true });
    const descriptors = buildVirtualDesktopOrbIdlCompleteCoverage().descriptors;
    catalog = buildAgentSupervisorExpandedIOHandoff(ioMap, envelopes, descriptors, { generatedAt });
    actualFs.mkdirSync(dirname(evidencePath), { recursive: true });
    actualFs.writeFileSync(evidencePath, `${JSON.stringify(catalog, null, 2)}\n`);
  });

  it('compiles a deterministic packet for every reviewed expanded I/O envelope', () => {
    const ioMap = buildAgentSupervisorExpandedIOMap(undefined, { generatedAt });
    const envelopes = buildAgentSupervisorExpandedIOEnvelopes(ioMap, { generatedAt, dryRun: true });
    const artifact = JSON.parse(actualFs.readFileSync(evidencePath, 'utf8')) as AgentSupervisorExpandedIOHandoffCatalog;

    expect(catalog).toMatchObject({
      schema: AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_SCHEMA,
      catalog_id: AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_CATALOG_ID,
      task_id: AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID,
      generated_at: generatedAt,
      source_map_cid: ioMap.map_cid,
      source_envelope_catalog_cid: envelopes.catalog_cid,
      app_count: ioMap.app_count,
      packet_count: envelopes.envelope_count,
      physical_hardware_claimed: false,
    });
    expect(catalog.catalog_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(new Set(catalog.packets.map(packet => packet.packet_id)).size).toBe(catalog.packet_count);
    expect(new Set(catalog.packets.map(packet => packet.packet_cid)).size).toBe(catalog.packet_count);
    expect(artifact).toEqual(catalog);
    expect(validateAgentSupervisorExpandedIOHandoff(artifact, ioMap, envelopes)).toEqual({ valid: true, errors: [] });
  });

  it('binds display, camera, microphone, speaker, and headphone routes to current ORB/IDL and Meta control-plane surfaces', () => {
    const display = catalog.packets.find(packet => packet.app_id === 'agent-supervisor' && packet.modality === 'display.output');
    const photo = catalog.packets.find(packet => packet.app_id === 'agent-supervisor' && packet.modality === 'camera.photo_capture');
    const microphone = catalog.packets.find(packet => packet.app_id === 'agent-supervisor' && packet.modality === 'microphone.transcription');
    const speaker = catalog.packets.find(packet => packet.app_id === 'agent-supervisor' && packet.modality === 'speaker.output');
    const headphone = catalog.packets.find(packet => packet.app_id === 'agent-supervisor' && packet.modality === 'headphone.output');

    expect(display).toMatchObject({
      orb_idl: { descriptor_id: 'virtual-desktop.agent-supervisor', method_id: 'read_status' },
      control_plane: {
        capability: 'display.output',
        control_plane_route: 'swissknife.webapp_bridge.publish_display_event',
        fallback_tool: 'hallucinate_app.meta_glasses.display_fallback',
        raw_payload_forwarded: false,
      },
    });
    expect(photo).toMatchObject({
      control_plane: {
        capability: 'camera.photo_capture',
        binding_id: 'camera.photo_capture.capture_photo.binding',
        control_plane_route: 'swissknife.mobile_orb.request_capture',
      },
    });
    expect(microphone).toMatchObject({
      control_plane: { capability: 'microphone.input', control_plane_route: 'swissknife.mobile_orb.publish_glasses_event' },
    });
    for (const packet of [speaker, headphone]) {
      expect(packet).toMatchObject({
        control_plane: { control_plane_route: 'swissknife.mobile_orb.publish_glasses_event' },
      });
    }
  });

  it('preserves receipts and rollback while making permission, audio-summary, mobile-card, and desktop decisions redacted and visible', () => {
    for (const packet of catalog.packets) {
      expect(packet.orb_idl.interface_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.orb_idl.method_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.receipt).toMatchObject({
        receipt_cid: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        event_dag_ref: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        source_envelope_cid: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        preserved: true,
      });
      expect(packet.rollback).toMatchObject({ preserves_receipt: true, preserves_event_dag: true });
      expect(packet.fallbacks.map(fallback => fallback.kind).sort()).toEqual([
        'audio-summary', 'desktop-only', 'mobile-card', 'permission-fallback',
      ]);
      expect(packet.fallbacks.every(fallback => (
        fallback.operator_visible && fallback.receipt_preserved && fallback.event_dag_preserved && Boolean(fallback.reason)
      ))).toBe(true);
      expect(packet.fallbacks).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'audio-summary', target_surface: 'audio_channel', redaction: 'transcript-redacted' }),
        expect.objectContaining({ kind: 'mobile-card', target_surface: 'mobile_card', redaction: 'metadata-only' }),
      ]));
      expect(packet.operator_decision).toEqual(expect.objectContaining({
        visible: true,
        redacted: true,
        details_excluded: ['raw_audio', 'raw_pixels', 'secret_values', 'inline_asset_bytes'],
      }));
    }
    expect(catalog.fallback_counts).toEqual({
      'permission-fallback': catalog.packet_count,
      'audio-summary': catalog.packet_count,
      'mobile-card': catalog.packet_count,
      'desktop-only': catalog.packet_count,
    });
    expect(catalog.operator_decision_counts['permission-fallback']).toBeGreaterThan(0);
    expect(catalog.operator_decision_counts['redacted-fallback']).toBeGreaterThan(0);
  });

  it('is byte deterministic and detects stale descriptor, receipt, or redaction lineage', () => {
    const ioMap = buildAgentSupervisorExpandedIOMap(undefined, { generatedAt });
    const envelopes = buildAgentSupervisorExpandedIOEnvelopes(ioMap, { generatedAt, dryRun: true });
    const repeated = buildAgentSupervisorExpandedIOHandoff(
      ioMap,
      envelopes,
      [...buildVirtualDesktopOrbIdlCompleteCoverage().descriptors].reverse(),
      { generatedAt, generatedFrom: [...catalog.generated_from].reverse() },
    );
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(catalog));

    const corrupt = JSON.parse(JSON.stringify(catalog)) as AgentSupervisorExpandedIOHandoffCatalog;
    const packet = corrupt.packets[0] as unknown as {
      receipt: { receipt_cid: string };
      fallbacks: Array<{ kind: string; redaction: string }>;
    };
    packet.receipt.receipt_cid = 'sha256:bad';
    packet.fallbacks.find(fallback => fallback.kind === 'mobile-card')!.redaction = 'transcript-redacted';
    const validation = validateAgentSupervisorExpandedIOHandoff(corrupt, ioMap, envelopes);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toContain('receipt preservation or rollback lineage drifted');
    expect(validation.errors.join('\n')).toContain('mobile-card must be metadata-redacted');
    expect(validation.errors.join('\n')).toContain('packet CID does not match packet body');
    expect(validation.errors.join('\n')).toContain('catalog CID does not match catalog body');
  });
});
