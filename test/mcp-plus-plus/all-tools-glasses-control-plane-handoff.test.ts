/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const replayBundlesPath = join(evidenceRoot, 'all-tools-glasses-handoff-replay-bundles.json');
const controlPlanePath = join(evidenceRoot, 'all-tools-glasses-control-plane-handoff.json');

type ControlPlaneSurface =
  | 'native_dat'
  | 'display_webapp'
  | 'mobile_card'
  | 'notification_tray'
  | 'audio_channel'
  | 'desktop_handoff';

interface ReplayBundle {
  bundle_id: string;
  packet_id: string;
  descriptor_id: string;
  app_id: string;
  service_id: string;
  interface_cid: string;
  behavior: string;
  display_target: string;
  fallback_target: string;
  adapter_required: boolean;
  rollback_token: string;
  policy_tags: string[];
  method_refs: {
    method: string;
    tool_id: string;
    receipt_refs: string[];
    event_dag_refs: string[];
  }[];
  receipt_refs: string[];
  event_dag_refs: string[];
  replay_frames: { state: string; valid: boolean; fallback: string | null }[];
}

interface ReplayBundleCatalog {
  schema: string;
  bundle_count: number;
  bundles: ReplayBundle[];
}

interface ControlPlaneRoute {
  route_id: string;
  bundle_id: string;
  packet_id: string;
  app_id: string;
  service_id: string;
  status: 'accepted';
  surface: ControlPlaneSurface;
  fallback_surface: ControlPlaneSurface;
  behavior: string;
  high_risk: boolean;
  redacted: boolean;
  confirmation_gate: 'preserve' | 'require_operator_confirmation';
  operator_visible_fallback: boolean;
  fallback_decision: 'direct' | 'redacted_mobile_confirmation' | 'redacted_desktop_handoff';
  receipt_refs: string[];
  event_dag_refs: string[];
  rollback_token: string;
}

interface ControlPlaneHandoffArtifact {
  schema: 'swissknife.all-tools-glasses-control-plane-handoff.v1';
  generated_at: string;
  generated_from: string[];
  route_count: number;
  accepted_count: number;
  redacted_route_count: number;
  operator_visible_fallback_count: number;
  receipt_preserved_count: number;
  event_dag_preserved_count: number;
  surface_counts: Record<string, number>;
  behavior_counts: Record<string, number>;
  routes: ControlPlaneRoute[];
}

let replayCatalog: ReplayBundleCatalog;
let controlPlaneArtifact: ControlPlaneHandoffArtifact;

describe('all MCP/MCP++ Meta glasses control-plane handoff routing', () => {
  beforeAll(() => {
    replayCatalog = readJson<ReplayBundleCatalog>(replayBundlesPath);
    controlPlaneArtifact = buildControlPlaneHandoffArtifact(replayCatalog);
    actualFs.mkdirSync(dirname(controlPlanePath), { recursive: true });
    actualFs.writeFileSync(controlPlanePath, `${JSON.stringify(controlPlaneArtifact, null, 2)}\n`);
  });

  it('accepts every replay bundle into the hardware-free control-plane fixture', () => {
    expect(controlPlaneArtifact.schema).toBe('swissknife.all-tools-glasses-control-plane-handoff.v1');
    expect(controlPlaneArtifact.route_count).toBe(replayCatalog.bundle_count);
    expect(controlPlaneArtifact.accepted_count).toBe(replayCatalog.bundle_count);
    expect(controlPlaneArtifact.route_count).toBe(104);
    expect(controlPlaneArtifact.routes.every(route => route.status === 'accepted')).toBe(true);
    expect(actualFs.existsSync(controlPlanePath)).toBe(true);
  });

  it('routes displayable bundles to display-webapp, mobile-card, and audio surfaces', () => {
    expect(controlPlaneArtifact.surface_counts).toEqual({
      audio_channel: 35,
      display_webapp: 62,
      mobile_card: 7,
    });
    expect(controlPlaneArtifact.behavior_counts).toEqual({
      'audio-summary': 35,
      'display-webapp': 62,
      'mobile-card': 7,
    });
    for (const route of controlPlaneArtifact.routes) {
      if (route.behavior === 'display-webapp') expect(route.surface).toBe('display_webapp');
      if (route.behavior === 'mobile-card') expect(route.surface).toBe('mobile_card');
      if (route.behavior === 'audio-summary') expect(route.surface).toBe('audio_channel');
    }
  });

  it('preserves receipts, event DAG refs, rollback tokens, and confirmation gates', () => {
    for (const route of controlPlaneArtifact.routes) {
      expect(route.receipt_refs.length).toBeGreaterThan(0);
      expect(route.event_dag_refs.length).toBeGreaterThan(0);
      expect(route.rollback_token).toBe(`rollback:${route.packet_id}`);
      expect(['preserve', 'require_operator_confirmation']).toContain(route.confirmation_gate);
    }
    expect(controlPlaneArtifact.receipt_preserved_count).toBe(104);
    expect(controlPlaneArtifact.event_dag_preserved_count).toBe(104);
  });

  it('emits operator-visible redacted fallback decisions for high-risk bundles', () => {
    const highRiskRoutes = controlPlaneArtifact.routes.filter(route => route.high_risk);

    expect(highRiskRoutes).toHaveLength(7);
    expect(controlPlaneArtifact.redacted_route_count).toBe(7);
    expect(controlPlaneArtifact.operator_visible_fallback_count).toBe(7);
    for (const route of highRiskRoutes) {
      expect(route.redacted).toBe(true);
      expect(route.operator_visible_fallback).toBe(true);
      expect(route.confirmation_gate).toBe('require_operator_confirmation');
      expect(['redacted_mobile_confirmation', 'redacted_desktop_handoff']).toContain(route.fallback_decision);
    }
  });
});

function buildControlPlaneHandoffArtifact(
  replay: ReplayBundleCatalog,
): ControlPlaneHandoffArtifact {
  const routes = replay.bundles.map(bundle => routeBundle(bundle))
    .sort((left, right) => left.route_id.localeCompare(right.route_id));

  return {
    schema: 'swissknife.all-tools-glasses-control-plane-handoff.v1',
    generated_at: '2026-07-09T00:00:00.000Z',
    generated_from: [replay.schema],
    route_count: routes.length,
    accepted_count: routes.filter(route => route.status === 'accepted').length,
    redacted_route_count: routes.filter(route => route.redacted).length,
    operator_visible_fallback_count: routes.filter(route => route.operator_visible_fallback).length,
    receipt_preserved_count: routes.filter(route => route.receipt_refs.length > 0).length,
    event_dag_preserved_count: routes.filter(route => route.event_dag_refs.length > 0).length,
    surface_counts: countBy(routes, route => route.surface),
    behavior_counts: countBy(routes, route => route.behavior),
    routes,
  };
}

function routeBundle(bundle: ReplayBundle): ControlPlaneRoute {
  const highRisk = bundle.policy_tags.includes('policy:destructive')
    || bundle.policy_tags.includes('policy:credential')
    || bundle.policy_tags.includes('policy:media_capture');
  const surface = surfaceForBehavior(bundle.behavior);
  const fallbackSurface = fallbackSurfaceFor(bundle.fallback_target, highRisk);
  const redacted = highRisk || bundle.behavior === 'not-displayable' || bundle.fallback_target === 'desktop-only';

  return {
    route_id: `control-plane.${bundle.bundle_id}`,
    bundle_id: bundle.bundle_id,
    packet_id: bundle.packet_id,
    app_id: bundle.app_id,
    service_id: bundle.service_id,
    status: 'accepted',
    surface,
    fallback_surface: fallbackSurface,
    behavior: bundle.behavior,
    high_risk: highRisk,
    redacted,
    confirmation_gate: highRisk ? 'require_operator_confirmation' : 'preserve',
    operator_visible_fallback: redacted,
    fallback_decision: highRisk
      ? 'redacted_mobile_confirmation'
      : redacted
        ? 'redacted_desktop_handoff'
        : 'direct',
    receipt_refs: bundle.receipt_refs,
    event_dag_refs: bundle.event_dag_refs,
    rollback_token: bundle.rollback_token,
  };
}

function surfaceForBehavior(behavior: string): ControlPlaneSurface {
  if (behavior === 'native-display') return 'native_dat';
  if (behavior === 'display-webapp') return 'display_webapp';
  if (behavior === 'mobile-card') return 'mobile_card';
  if (behavior === 'notification') return 'notification_tray';
  if (behavior === 'audio-summary') return 'audio_channel';
  return 'desktop_handoff';
}

function fallbackSurfaceFor(fallbackTarget: string, highRisk: boolean): ControlPlaneSurface {
  if (highRisk) return 'mobile_card';
  return surfaceForBehavior(fallbackTarget);
}

function countBy<T>(items: readonly T[], selector: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(actualFs.readFileSync(filePath, 'utf8')) as T;
}
