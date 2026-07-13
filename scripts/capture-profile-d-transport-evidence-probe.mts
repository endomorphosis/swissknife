#!/usr/bin/env node

/**
 * Direct Profile D transport probe. This intentionally performs no process
 * bootstrap so it can run against already-managed host adapters and bridges.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as ucans from '@ucans/ucans';
import { CID } from 'multiformats/cid';
import {
  createMultiServerConnector,
  IPFS_ACCELERATE_SERVER,
  IPFS_DATASETS_SERVER,
  IPFS_KIT_SERVER,
  MCPPPServerConnector,
} from '../src/services/mcp/mcp-plus-plus-connector.ts';

const projectRoot = resolve(import.meta.dirname, '..');
const evidenceRoot = join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPath = join(evidenceRoot, 'profile-d-policy-http-libp2p.json');
const announceFiles = [
  'ipfs-kit-mcp-p2p-announce.json',
  'ipfs-datasets-mcp-p2p-announce.json',
  'ipfs-accelerate-mcp-p2p-announce.json',
];
const serverConfigs = {
  ipfs_kit_py: IPFS_KIT_SERVER,
  ipfs_datasets_py: IPFS_DATASETS_SERVER,
  ipfs_accelerate_py: IPFS_ACCELERATE_SERVER,
} as const;
const actor = 'did:key:swissknife-profile-d-parity';
const action = 'tools.call';
const evaluatedAt = '2026-07-11T00:00:00Z';
const vectors = [
  {
    id: 'allow', expected: 'allow', request: {
      actor, action, evaluated_at: evaluatedAt, request_zkp_certificate: true,
      policy: { clauses: [{ clause_type: 'permission', actor, action }] },
    },
  },
  {
    id: 'prohibition', expected: 'deny', request: {
      actor, action, evaluated_at: evaluatedAt, request_zkp_certificate: true,
      policy: { clauses: [
        { clause_type: 'permission', actor, action },
        { clause_type: 'prohibition', actor, action },
      ] },
    },
  },
  {
    id: 'obligation', expected: 'allow_with_obligations', request: {
      actor, action, evaluated_at: evaluatedAt, request_zkp_certificate: true,
      policy: { clauses: [
        { clause_type: 'permission', actor, action },
        { clause_type: 'obligation', actor, action, obligation_deadline: '2030-01-01T00:00:00Z' },
      ] },
    },
  },
  {
    id: 'expired', expected: 'deny', request: {
      actor, action, evaluated_at: evaluatedAt, request_zkp_certificate: true,
      policy: { clauses: [{ clause_type: 'permission', actor, action, valid_until: '2000-01-01T00:00:00Z' }] },
    },
  },
  {
    id: 'resource_scope', expected: 'deny', request: {
      actor, action, resource: 'dataset/private', evaluated_at: evaluatedAt, request_zkp_certificate: true,
      policy: { clauses: [{ clause_type: 'permission', actor, action, resource: 'dataset/public/*' }] },
    },
  },
] as const;

interface NormalizedDecision {
  readonly decision: string | null;
  readonly allowed: boolean;
  readonly obligations: readonly Record<string, unknown>[];
  readonly policy_cid: string | null;
  readonly decision_cid: string | null;
  readonly intent_cid: string | null;
  readonly formal_logic: readonly string[];
  readonly formal_logic_cid: string | null;
  readonly zkp: {
    readonly status: string | null;
    readonly zero_knowledge: boolean | null;
    readonly proof: unknown;
    readonly statement_cid: string | null;
  };
  readonly artifact_persistence: {
    readonly profile: string | null;
    readonly complete: boolean;
    readonly artifacts: Record<string, {
      readonly cid: string | null;
      readonly backend: string | null;
      readonly persisted: boolean;
      readonly verified: boolean;
    }>;
  };
}

function normalized(decision: Record<string, unknown>): NormalizedDecision {
  const certificate = record(decision.zkp_certificate);
  const persistence = record(decision.artifact_persistence);
  const artifacts = Object.fromEntries(Object.entries(record(persistence.artifacts)).map(([kind, artifact]) => {
    const value = record(artifact);
    return [kind, {
      cid: stringOrNull(value.cid),
      backend: stringOrNull(value.backend),
      persisted: value.persisted === true,
      verified: value.verified === true,
    }];
  }));
  return {
    decision: stringOrNull(decision.decision),
    allowed: decision.allowed === true,
    obligations: Array.isArray(decision.obligations) ? decision.obligations.filter(isRecord) : [],
    policy_cid: stringOrNull(decision.policy_cid),
    decision_cid: stringOrNull(decision.decision_cid),
    intent_cid: stringOrNull(decision.intent_cid),
    formal_logic: Array.isArray(decision.formal_logic) ? decision.formal_logic.filter((item): item is string => typeof item === 'string') : [],
    formal_logic_cid: stringOrNull(decision.formal_logic_cid),
    zkp: {
      status: stringOrNull(certificate.status),
      zero_knowledge: typeof certificate.zero_knowledge === 'boolean' ? certificate.zero_knowledge : null,
      proof: certificate.proof ?? null,
      statement_cid: stringOrNull(certificate.statement_cid),
    },
    artifact_persistence: {
      profile: stringOrNull(persistence.profile),
      complete: persistence.complete === true,
      artifacts,
    },
  };
}

function isProfileDDagJsonCid(value: string | null): boolean {
  if (!value) return false;
  try {
    const cid = CID.parse(value);
    return cid.version === 1 && cid.code === 0x0129 && cid.multihash.code === 0x12 && cid.multihash.size === 32;
  } catch {
    return false;
  }
}

function validResult(result: NormalizedDecision, expected: string): boolean {
  const required = {
    policy: result.policy_cid,
    intent: result.intent_cid,
    decision: result.decision_cid,
    formal_logic: result.formal_logic_cid,
    statement: result.zkp.statement_cid,
  };
  const persistenceValid = result.artifact_persistence.profile === 'D'
    && result.artifact_persistence.complete
    && Object.entries(required).every(([kind, cid]) => {
      const artifact = result.artifact_persistence.artifacts[kind];
      return artifact?.cid === cid && artifact.persisted && artifact.verified;
    });
  return result.decision === expected
    && isProfileDDagJsonCid(result.policy_cid)
    && isProfileDDagJsonCid(result.decision_cid)
    && isProfileDDagJsonCid(result.intent_cid)
    && isProfileDDagJsonCid(result.formal_logic_cid)
    && result.formal_logic.length > 0
    && result.zkp.status === 'statement_ready'
    && result.zkp.zero_knowledge === false
    && result.zkp.proof === null
    && isProfileDDagJsonCid(result.zkp.statement_cid)
    && persistenceValid;
}

async function readArtifacts(
  connector: MCPPPServerConnector,
  result: NormalizedDecision,
): Promise<Record<string, { found: boolean; verified: boolean; cid: string | null; backend: string | null }>> {
  const cids = {
    policy: result.policy_cid,
    intent: result.intent_cid,
    decision: result.decision_cid,
    formal_logic: result.formal_logic_cid,
    statement: result.zkp.statement_cid,
  };
  const rows = await Promise.all(Object.entries(cids).map(async ([kind, cid]) => {
    const artifact = cid ? await connector.getArtifact(cid) : null;
    return [kind, {
      found: artifact?.found === true,
      verified: artifact?.verified === true,
      cid: artifact?.cid ?? null,
      backend: artifact?.backend ?? null,
    }] as const;
  }));
  return Object.fromEntries(rows);
}

function artifactsRetrievable(
  reads: Record<string, { found: boolean; verified: boolean; cid: string | null }>,
  result: NormalizedDecision,
): boolean {
  const expected = {
    policy: result.policy_cid,
    intent: result.intent_cid,
    decision: result.decision_cid,
    formal_logic: result.formal_logic_cid,
    statement: result.zkp.statement_cid,
  };
  return Object.entries(expected).every(([kind, cid]) =>
    reads[kind]?.found === true && reads[kind]?.verified === true && reads[kind]?.cid === cid,
  );
}

async function main(): Promise<void> {
  const announces = announceFiles.map(fileName => ({
    ...JSON.parse(readFileSync(join(evidenceRoot, fileName), 'utf8')) as Record<string, unknown>,
    announce_file: fileName,
  }));
  const multiaddrs = Object.fromEntries(announces.map(announce => {
    const config = serverConfigs[String(announce.service) as keyof typeof serverConfigs];
    if (!config || typeof announce.multiaddr !== 'string') throw new Error(`Invalid Profile D bridge announcement: ${announce.announce_file}`);
    return [config.name, announce.multiaddr];
  }));
  const agentKey = await ucans.EdKeypair.create({ exportable: true });
  const multi = createMultiServerConnector(agentKey.did(), { libp2p: multiaddrs });
  const p2pConnections = await multi.connectAll();
  const services: Record<string, unknown>[] = [];

  for (const announce of announces) {
    const service = String(announce.service);
    const config = serverConfigs[service as keyof typeof serverConfigs];
    const p2p = multi.getConnector(config.name);
    const http = new MCPPPServerConnector({ ...config, transport: 'http' });
    let error: string | null = null;
    let httpConnection: { success?: boolean; profiles?: string[] } | null = null;
    const rows: Record<string, unknown>[] = [];
    try {
      httpConnection = await http.connect();
      for (const vector of vectors) {
        const [httpDecision, libp2pDecision] = await Promise.all([
          http.evaluateProfileDPolicy(vector.request),
          p2p.evaluateProfileDPolicy(vector.request),
        ]);
        const normalizedHttp = normalized(httpDecision as Record<string, unknown>);
        const normalizedLibp2p = normalized(libp2pDecision as Record<string, unknown>);
        const [httpArtifacts, libp2pArtifacts] = await Promise.all([
          readArtifacts(http, normalizedHttp),
          readArtifacts(p2p, normalizedLibp2p),
        ]);
        rows.push({
          id: vector.id,
          expected: vector.expected,
          http: normalizedHttp,
          libp2p: normalizedLibp2p,
          http_artifacts: httpArtifacts,
          libp2p_artifacts: libp2pArtifacts,
          equal: JSON.stringify(normalizedHttp) === JSON.stringify(normalizedLibp2p),
          valid: validResult(normalizedHttp, vector.expected)
            && validResult(normalizedLibp2p, vector.expected)
            && artifactsRetrievable(httpArtifacts, normalizedHttp)
            && artifactsRetrievable(libp2pArtifacts, normalizedLibp2p),
        });
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      await Promise.allSettled([http.disconnect(), p2p.disconnect()]);
    }
    const p2pConnection = p2pConnections.get(config.name);
    services.push({
      service,
      endpoint: config.baseUrl + config.policyPath,
      multiaddr: announce.multiaddr,
      http_connected: httpConnection?.success === true,
      libp2p_connected: p2pConnection?.success === true && p2p.transportKind === 'libp2p',
      profile_d_negotiated_http: httpConnection?.profiles?.includes('mcp++/deontic-policy') === true,
      profile_d_negotiated_libp2p: p2pConnection?.profiles?.includes('mcp++/deontic-policy') === true,
      vectors: rows,
      error,
    });
  }
  await Promise.allSettled(announces.map(announce => multi.getConnector(serverConfigs[String(announce.service) as keyof typeof serverConfigs].name)?.disconnect()));
  const passed = services.every(service =>
    service.http_connected === true
    && service.libp2p_connected === true
    && service.profile_d_negotiated_http === true
    && service.profile_d_negotiated_libp2p === true
    && Array.isArray(service.vectors)
    && service.vectors.length === vectors.length
    && service.vectors.every(vector => vector.equal === true && vector.valid === true)
    && service.error === null,
  );
  const evidence = {
    schema: 'swissknife.profile_d_http_libp2p_parity.v2',
    generated_at: new Date().toISOString(),
    decision: passed ? 'go' : 'no_go',
    service_count: services.length,
    vector_count: vectors.length,
    cid_contract: { version: 1, codec: 'dag-json', multihash: 'sha2-256' },
    services,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({
    decision: evidence.decision,
    service_count: evidence.service_count,
    vector_count: evidence.vector_count,
    output: outputPath,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

main().catch(error => {
  const evidence = {
    schema: 'swissknife.profile_d_http_libp2p_parity.v2',
    generated_at: new Date().toISOString(),
    decision: 'no_go',
    service_count: 0,
    vector_count: vectors.length,
    cid_contract: { version: 1, codec: 'dag-json', multihash: 'sha2-256' },
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    services: [],
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.error(evidence.error);
  process.exitCode = 1;
});
