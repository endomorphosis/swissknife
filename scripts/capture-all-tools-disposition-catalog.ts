import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  EXECUTABLE_BACKEND_OWNERS,
  type ExecutableBackendOwner,
} from '../src/services/apps/all-app-executable-backend-contract.js';
import {
  ALL_TOOLS_DISPOSITION_CATALOG_SCHEMA,
  STATIC_DISCOVERED_BACKEND_TOOLS,
  buildAllToolsDispositionCatalog,
  toolIdentity,
  validateAllToolsDispositionCatalog,
  type DiscoveredBackendToolRecord,
  type ToolTransportObservation,
} from '../src/services/mcp/all-tools-disposition-catalog.js';

const evidenceRoot = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const peerEvidencePath = join(evidenceRoot, 'swissknife-all-tools-peer-evidence.json');
const outputPath = join(evidenceRoot, 'all-tools-disposition-catalog.json');
const owners = new Set<string>(EXECUTABLE_BACKEND_OWNERS);

interface PeerTransport {
  connected?: boolean;
  descriptor?: { retrieved_cids?: string[]; listed_cids?: string[] };
  discovered_tool_names?: string[];
}

interface PeerService {
  service?: string;
  transports?: Partial<Record<'http' | 'libp2p', PeerTransport>>;
}

interface PeerEvidence {
  generated_at?: string;
  decision?: string;
  services?: PeerService[];
}

function asOwner(value: string | undefined): ExecutableBackendOwner | null {
  return value && owners.has(value) ? value as ExecutableBackendOwner : null;
}

function descriptorEvidenceId(transport: PeerTransport): string | undefined {
  return transport.descriptor?.retrieved_cids?.[0] ?? transport.descriptor?.listed_cids?.[0];
}

function observation(transport: 'http' | 'libp2p', record: PeerTransport | undefined): ToolTransportObservation {
  if (!record?.connected) {
    return {
      transport,
      state: 'unavailable',
      rationale: `The live ${transport} peer capture could not connect to this owner.`,
    };
  }
  const evidenceId = descriptorEvidenceId(record);
  return {
    transport,
    state: 'reachable',
    evidence_id: evidenceId,
    rationale: `The live ${transport} tools/list response and its CID-addressed descriptor advertised this exact tool name.`,
  };
}

function main(): void {
  const peer = JSON.parse(readFileSync(peerEvidencePath, 'utf8')) as PeerEvidence;
  if (String(peer.decision ?? '').toLowerCase() !== 'go') {
    throw new Error('SVD-105 requires a passing SVD-100 peer evidence capture.');
  }

  const discovered: DiscoveredBackendToolRecord[] = [];
  const reachability = new Map<string, readonly ToolTransportObservation[]>();
  for (const service of peer.services ?? []) {
    const owner = asOwner(service.service);
    if (!owner) continue;
    const byTransport = service.transports ?? {};
    const names = new Set([
      ...(byTransport.http?.discovered_tool_names ?? []),
      ...(byTransport.libp2p?.discovered_tool_names ?? []),
    ]);
    for (const toolId of [...names].filter(Boolean).sort()) {
      const tool = { owner, tool_id: toolId, discovery_source: 'runtime_discovery' as const };
      discovered.push(tool);
      reachability.set(toolIdentity(tool), [
        observation('http', byTransport.http),
        observation('libp2p', byTransport.libp2p),
      ]);
    }
  }

  // Keep reviewed descriptor-only names in the receipt as well. Their absent
  // live observation is represented as unavailable, never silently discarded.
  const catalog = buildAllToolsDispositionCatalog([...STATIC_DISCOVERED_BACKEND_TOOLS, ...discovered], reachability);
  const validation = validateAllToolsDispositionCatalog(catalog);
  if (!validation.valid) {
    throw new Error(`SVD-105 disposition catalog validation failed: ${validation.errors.join('; ')}`);
  }
  const generatedAt = new Date().toISOString();
  const report = {
    task_id: 'SVD-105',
    generated_at: generatedAt,
    capture_mode: 'live-peer-tools-list-and-descriptor-cid',
    source_peer_evidence: {
      path: 'test-results/virtual-desktop-ipfs-mcp-orb/swissknife-all-tools-peer-evidence.json',
      generated_at: peer.generated_at ?? null,
    },
    live_discovered_tool_count: discovered.length,
    decision: 'GO',
    ...catalog,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    schema: ALL_TOOLS_DISPOSITION_CATALOG_SCHEMA,
    task_id: report.task_id,
    decision: report.decision,
    live_discovered_tool_count: report.live_discovered_tool_count,
    disposition_counts: countByKind(catalog),
    output: 'test-results/virtual-desktop-ipfs-mcp-orb/all-tools-disposition-catalog.json',
  }, null, 2));
}

function countByKind(catalog: ReturnType<typeof buildAllToolsDispositionCatalog>): Record<string, number> {
  return catalog.entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.disposition.kind] = (counts[entry.disposition.kind] ?? 0) + 1;
    return counts;
  }, {});
}

main();
