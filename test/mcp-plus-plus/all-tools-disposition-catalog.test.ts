/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_TOOLS_DISPOSITION_CATALOG,
  ALL_TOOLS_DISPOSITION_CATALOG_ID,
  ALL_TOOLS_DISPOSITION_CATALOG_SCHEMA,
  ALL_TOOLS_DISPOSITION_CATALOG_VERSION,
  STATIC_DISCOVERED_BACKEND_TOOLS,
  buildAllToolsDispositionCatalog,
  toolIdentity,
  validateAllToolsDispositionCatalog,
  type ToolTransportObservation,
} from '../../src/services/mcp/all-tools-disposition-catalog';
import { EXECUTABLE_BACKEND_OWNERS } from '../../src/services/apps/all-app-executable-backend-contract';

const EVIDENCE_PATH = join(
  process.cwd(),
  'test-results/virtual-desktop-ipfs-mcp-orb/all-tools-disposition-catalog.json',
);

describe('SVD-105 all backend tools disposition catalog', () => {
  it('maps every descriptor-discovered exact name from all three owners', () => {
    const validation = validateAllToolsDispositionCatalog();
    expect(validation).toEqual({ valid: true, errors: [] });
    expect(ALL_TOOLS_DISPOSITION_CATALOG).toMatchObject({
      schema: ALL_TOOLS_DISPOSITION_CATALOG_SCHEMA,
      catalog_id: ALL_TOOLS_DISPOSITION_CATALOG_ID,
      version: ALL_TOOLS_DISPOSITION_CATALOG_VERSION,
      backend_owners: EXECUTABLE_BACKEND_OWNERS,
    });

    const discovered = new Set(STATIC_DISCOVERED_BACKEND_TOOLS.map(toolIdentity));
    const catalogued = new Set(ALL_TOOLS_DISPOSITION_CATALOG.entries.map(toolIdentity));
    expect(catalogued).toEqual(discovered);
    for (const owner of EXECUTABLE_BACKEND_OWNERS) {
      expect(ALL_TOOLS_DISPOSITION_CATALOG.entries.some(entry => entry.owner === owner)).toBe(true);
    }
    expect(ALL_TOOLS_DISPOSITION_CATALOG.entries.every(entry =>
      ['app_operation', 'diagnostic_operation', 'server_only'].includes(entry.disposition.kind),
    )).toBe(true);
  });

  it('keeps app, diagnostic, and governed server-only surfaces distinct', () => {
    const entries = ALL_TOOLS_DISPOSITION_CATALOG.entries;
    expect(entries.some(entry => entry.disposition.kind === 'app_operation')).toBe(true);
    expect(entries.some(entry => entry.disposition.kind === 'diagnostic_operation'
      && entry.disposition.app_id === 'mcp-plus-plus')).toBe(true);
    const serverOnly = entries.filter(entry => entry.disposition.kind === 'server_only');
    expect(serverOnly.length).toBeGreaterThan(0);
    for (const entry of serverOnly) {
      expect(entry.disposition).toMatchObject({
        governance: 'policy_review_required',
        review_surface: 'mcp-control',
      });
      expect(entry.reachability.approved_transports).toEqual([]);
    }
  });

  it('records name-level HTTP and libp2p reachability only when each has evidence', () => {
    const tool = STATIC_DISCOVERED_BACKEND_TOOLS.find(candidate => candidate.tool_id === 'get_task');
    if (!tool) throw new Error('Expected accelerate get_task descriptor fixture');
    const observations: readonly ToolTransportObservation[] = [
      {
        transport: 'http',
        state: 'reachable',
        evidence_id: 'cid:svd-105-http-get-task',
        rationale: 'Approved HTTP fixture returned a correlation-preserving receipt.',
      },
      {
        transport: 'libp2p',
        state: 'reachable',
        evidence_id: 'cid:svd-105-libp2p-get-task',
        rationale: 'Approved libp2p fixture returned a correlation-preserving receipt.',
      },
    ];
    const catalog = buildAllToolsDispositionCatalog(
      STATIC_DISCOVERED_BACKEND_TOOLS,
      new Map([[toolIdentity(tool), observations]]),
    );
    const entry = catalog.entries.find(candidate => toolIdentity(candidate) === toolIdentity(tool));
    expect(entry?.reachability).toEqual({
      approved_transports: ['http', 'libp2p'],
      observations,
    });

    const missingProof = buildAllToolsDispositionCatalog(
      STATIC_DISCOVERED_BACKEND_TOOLS,
      new Map([[toolIdentity(tool), [{ ...observations[0], evidence_id: undefined }]]]),
    );
    expect(validateAllToolsDispositionCatalog(missingProof).valid).toBe(false);
  });

  it('preserves newly discovered unsupported, denied, and unavailable cases with owner rationale', () => {
    const runtimeTool = {
      owner: 'ipfs_datasets_py' as const,
      tool_id: 'runtime_unclassified_tool',
      discovery_source: 'runtime_discovery' as const,
    };
    const catalog = buildAllToolsDispositionCatalog(
      [...STATIC_DISCOVERED_BACKEND_TOOLS, runtimeTool],
      new Map([[toolIdentity(runtimeTool), [
        {
          transport: 'http' as const,
          state: 'unsupported' as const,
          rationale: 'The HTTP peer did not advertise the runtime name.',
        },
        {
          transport: 'libp2p' as const,
          state: 'denied' as const,
          rationale: 'The peer descriptor requires an ungranted policy capability.',
        },
      ]]]),
    );
    const entry = catalog.entries.find(candidate => toolIdentity(candidate) === toolIdentity(runtimeTool));
    expect(entry).toMatchObject({
      owner: 'ipfs_datasets_py',
      tool_id: 'runtime_unclassified_tool',
      disposition: {
        kind: 'server_only',
        governance: 'policy_review_required',
        review_surface: 'mcp-control',
      },
      reachability: {
        approved_transports: [],
        observations: [
          { transport: 'http', state: 'unsupported' },
          { transport: 'libp2p', state: 'denied' },
        ],
      },
    });
    expect((entry?.disposition.kind === 'server_only' ? entry.disposition.rationale : '')).toContain('denied');

    const unavailable = ALL_TOOLS_DISPOSITION_CATALOG.entries
      .flatMap(entry => entry.reachability.observations)
      .filter(observation => observation.state === 'unavailable');
    expect(unavailable.length).toBeGreaterThan(0);
    expect(unavailable.every(observation => observation.rationale.length > 0)).toBe(true);
  });

  it('accepts the reviewed static baseline or a larger live-discovery capture artifact', () => {
    const artifact = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
    const validation = validateAllToolsDispositionCatalog(artifact);
    expect(validation).toEqual({ valid: true, errors: [] });
    const catalogued = new Set(artifact.entries.map(toolIdentity));
    for (const tool of STATIC_DISCOVERED_BACKEND_TOOLS) {
      expect(catalogued.has(toolIdentity(tool))).toBe(true);
    }
  });
});
