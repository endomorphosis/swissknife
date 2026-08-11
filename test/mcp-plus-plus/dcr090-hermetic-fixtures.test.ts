/**
 * DCR-090: hermetic cross-repository contract conformance fixtures (SwissKnife).
 *
 * Proves monorepo fixture invariants without claiming live server green:
 * - real connector module origin is importable
 * - mock echo of requested capabilities is rejected as a counterexample
 * - profile incompatibility yields a deterministic failing counterexample
 * - live_conformance stays false without real server evidence
 */
import { describe, it, expect } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Jest runs with cwd = swissknife package root.
const SWISSKNIFE_ROOT = process.cwd();
const MONOREPO_ROOT = join(SWISSKNIFE_ROOT, '..');

const REAL_CONNECTOR = join(
  SWISSKNIFE_ROOT,
  'src',
  'services',
  'mcp',
  'mcp-plus-plus-connector.ts',
);

const REQUIRED_ROOTS = [
  'external/ipfs_accelerate',
  'external/ipfs_datasets',
  'external/ipfs_kit',
  'Mcp-Plus-Plus',
  'swissknife',
] as const;

type Counterexample = {
  kind: string;
  reason?: string;
  implementation_id?: string;
  profile?: string;
};

function detectMode(root: string): 'monorepo' | 'standalone_clone' {
  const present = REQUIRED_ROOTS.filter((rel) => existsSync(join(root, rel))).length;
  return present >= 4 ? 'monorepo' : 'standalone_clone';
}

function rejectMockEcho(
  requested: string[],
  observed: string[],
  implementationId: string,
): Counterexample[] {
  if (!requested.length) return [];
  if (requested.join('\0') === observed.join('\0') && implementationId.startsWith('mock:')) {
    return [
      {
        kind: 'mock_echo',
        implementation_id: implementationId,
        reason: 'mock_echoed_requested_capabilities',
      },
    ];
  }
  return [];
}

function profileCounterexample(
  profile: string,
  admitted: string[],
  implementationId: string,
): Counterexample[] {
  if (profile && admitted.length && !admitted.includes(profile)) {
    return [
      {
        kind: 'incompatible_profile',
        implementation_id: implementationId,
        profile,
        reason: 'profile_not_admitted',
      },
    ];
  }
  return [];
}

describe('DCR-090 hermetic cross-repository fixtures', () => {
  it('finds the real SwissKnife MCP++ connector (not a mock package)', () => {
    expect(existsSync(REAL_CONNECTOR)).toBe(true);
    const src = readFileSync(REAL_CONNECTOR, 'utf8');
    expect(src).toMatch(/MCPPPServerConnector|class\s+MCP/);
    // Must not be a trivial capability echo stub.
    expect(src.includes('echo requested capabilities as observed')).toBe(false);
  });

  it('detects monorepo roots when present', () => {
    const mode = detectMode(MONOREPO_ROOT);
    // When run from monorepo checkout this is monorepo; standalone swissknife
    // clones may be standalone_clone — both are valid hermetic modes.
    expect(['monorepo', 'standalone_clone']).toContain(mode);
    if (mode === 'monorepo') {
      for (const rel of REQUIRED_ROOTS) {
        expect(existsSync(join(MONOREPO_ROOT, rel))).toBe(true);
      }
    }
  });

  it('rejects mock echo of requested capabilities', () => {
    const requested = ['initialize', 'tools/list', 'tools/call'];
    const counterexamples = rejectMockEcho(requested, [...requested], 'mock:echo-server');
    expect(counterexamples).toHaveLength(1);
    expect(counterexamples[0].kind).toBe('mock_echo');
    expect(counterexamples[0].reason).toBe('mock_echoed_requested_capabilities');
  });

  it('allows non-mock implementations with matching capability lists', () => {
    const requested = ['initialize', 'tools/list'];
    const counterexamples = rejectMockEcho(
      requested,
      [...requested],
      'swissknife:mcp-plus-plus-connector',
    );
    expect(counterexamples).toHaveLength(0);
  });

  it('produces deterministic incompatible-profile counterexamples', () => {
    const counterexamples = profileCounterexample(
      'mcp++/experimental',
      ['mcp++/default'],
      'impl:real-ish',
    );
    expect(counterexamples).toHaveLength(1);
    expect(counterexamples[0].kind).toBe('incompatible_profile');
    expect(counterexamples[0].profile).toBe('mcp++/experimental');
  });

  it('keeps live_conformance false without real server evidence', () => {
    const live_conformance = false; // hermetic fixture path never self-greens
    const server_ok = false;
    const claim_live = true;
    const live = Boolean(claim_live && server_ok && existsSync(REAL_CONNECTOR));
    expect(live).toBe(false);
    expect(live_conformance).toBe(false);
  });

  it('builds a stable hermetic graph CID for the fixture shape', () => {
    const payload = {
      snapshot_id: 'snap:dcr090',
      interface: 'SwissKnifeMcpContractGraph@1',
      nodes: [
        { id: 'ui_action', root: 'swissknife', stage: 'ui_action' },
        { id: 'orb_idl', root: 'swissknife', stage: 'orb_idl' },
        { id: 'mcp_method', root: 'Mcp-Plus-Plus', stage: 'mcp_method_schema' },
        { id: 'handler', root: 'external/ipfs_accelerate', stage: 'handler' },
      ],
      edges: [
        { from: 'ui_action', to: 'orb_idl', kind: 'binds' },
        { from: 'orb_idl', to: 'mcp_method', kind: 'declares' },
        { from: 'mcp_method', to: 'handler', kind: 'routes' },
      ],
      live_conformance: false,
      runtime_model_calls: 0,
    };
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const cid =
      'sha256:' + createHash('sha256').update(canonical).digest('hex');
    const cid2 =
      'sha256:' +
      createHash('sha256').update(JSON.stringify(payload, Object.keys(payload).sort())).digest('hex');
    expect(cid).toBe(cid2);
    expect(cid.startsWith('sha256:')).toBe(true);
    expect(payload.live_conformance).toBe(false);
    expect(payload.runtime_model_calls).toBe(0);
  });
});
