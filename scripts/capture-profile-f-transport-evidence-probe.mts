#!/usr/bin/env node

/**
 * Profile F conformance probe. It appends a small parent-linked fixture across
 * HTTP and libp2p, compacts it durably, then verifies the archive certificate
 * and a Merkle inclusion proof through both normative bindings.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as ucans from '@ucans/ucans';
import {
  createMultiServerConnector,
  IPFS_ACCELERATE_SERVER,
  IPFS_DATASETS_SERVER,
  IPFS_KIT_SERVER,
  MCPPPServerConnector,
} from '../src/services/mcp/mcp-plus-plus-connector.ts';

const projectRoot = resolve(import.meta.dirname, '..');
const evidenceRoot = join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPath = join(evidenceRoot, 'profile-f-event-dag-http-libp2p.json');
const profileName = 'Profile F: Event DAG Provenance, Archival, and Compaction';
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

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function rest(method: string, url: string, body?: unknown): Promise<{ status: number; body: JsonRecord }> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = {};
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = { text }; }
  }
  return { status: response.status, body: record(parsed) };
}

async function main(): Promise<void> {
  const announces = announceFiles.map(fileName => ({
    ...JSON.parse(readFileSync(join(evidenceRoot, fileName), 'utf8')) as JsonRecord,
    announce_file: fileName,
  }));
  const multiaddrs = Object.fromEntries(announces.map(announce => {
    const config = serverConfigs[String(announce.service) as keyof typeof serverConfigs];
    if (!config || typeof announce.multiaddr !== 'string') throw new Error(`Invalid Profile F bridge announcement: ${announce.announce_file}`);
    return [config.name, announce.multiaddr];
  }));
  const agent = await ucans.EdKeypair.create({ exportable: true });
  const multi = createMultiServerConnector(agent.did(), { libp2p: multiaddrs });
  const p2pConnections = await multi.connectAll();
  const services: JsonRecord[] = [];

  for (const announce of announces) {
    const service = String(announce.service);
    const config = serverConfigs[service as keyof typeof serverConfigs];
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    const http = new MCPPPServerConnector({ ...config, transport: 'http', clientDID: agent.did() });
    const p2p = multi.getConnector(config.name);
    const fixture = `profile-f-${service}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let error: string | null = null;
    let httpConnection: { success?: boolean; profiles?: string[] } | null = null;
    let p2pConnected = false;
    let results: JsonRecord = {};

    try {
      httpConnection = await http.connect();
      const p2pConnection = p2pConnections.get(config.name);
      p2pConnected = p2pConnection?.success === true && p2p.transportKind === 'libp2p';
      if (!p2pConnected) throw new Error('MCP+p2p session did not connect.');

      const root = await http.appendDAGEvent({
        event_type: 'invocation',
        timestamp: '1970-01-01T00:00:00.000Z',
        parents: [],
        payload: { conformance_fixture: fixture, transport: 'http' },
      });
      const child = await p2p.appendDAGEvent({
        event_type: 'result',
        timestamp: '1970-01-01T00:00:01.000Z',
        parents: [root.event_cid],
        payload: { conformance_fixture: fixture, transport: 'libp2p' },
      });
      const restAppend = await rest('POST', `${baseUrl}/mcp/dag/append`, {
        event: {
          event_type: 'receipt',
          timestamp: '1970-01-01T00:00:02.000Z',
          parents: [child.event_cid],
          payload: { conformance_fixture: fixture, transport: 'rest' },
        },
      });
      const restEventCid = typeof restAppend.body.event_cid === 'string' ? restAppend.body.event_cid : null;
      const p2pHistory = await p2p.getDAGHistory(200);
      const p2pProvenance = await p2p.traceProvenance(child.event_cid);
      const restFrontier = await rest('GET', `${baseUrl}/mcp/dag/frontier`);
      const restHistory = await rest('GET', `${baseUrl}/mcp/dag/history?limit=200`);
      const restProvenance = await rest('GET', `${baseUrl}/mcp/dag/provenance/${encodeURIComponent(child.event_cid)}`);
      const compact = await p2p.compactEventDAG({ max_events: 3, retain_recent: 0 });
      const compacted = strings(compact?.compacted_cids);
      const certificate = record(compact?.certificate);
      const certificateCid = typeof certificate.certificate_cid === 'string' ? certificate.certificate_cid : null;
      const archiveCid = typeof compact?.archive_cid === 'string' ? compact.archive_cid : null;
      const p2pArchives = await p2p.listDAGArchives();
      const p2pCertificate = certificateCid ? await p2p.getDAGCertificate(certificateCid) : null;
      const p2pVerification = certificateCid ? await p2p.verifyDAGCertificate(certificateCid) : { valid: false };
      const inclusionCid = compacted[0] ?? null;
      const p2pInclusion = inclusionCid ? await p2p.getDAGInclusion(inclusionCid) : null;
      const restCompact = await rest('POST', `${baseUrl}/mcp/dag/compact`, { max_events: 1, retain_recent: 999999 });
      const restArchive = await rest('POST', `${baseUrl}/mcp/dag/archive`, { max_events: 1, retain_recent: 999999 });
      const restArchives = await rest('GET', `${baseUrl}/mcp/dag/archives`);
      const restCertificate = certificateCid
        ? await rest('GET', `${baseUrl}/mcp/dag/certificates/${encodeURIComponent(certificateCid)}`)
        : { status: 0, body: {} };
      const restVerification = certificateCid
        ? await rest('POST', `${baseUrl}/mcp/dag/certificates/verify`, { certificate_cid: certificateCid })
        : { status: 0, body: {} };
      const restInclusion = inclusionCid
        ? await rest('GET', `${baseUrl}/mcp/dag/inclusion/${encodeURIComponent(inclusionCid)}`)
        : { status: 0, body: {} };

      results = {
        root_event_cid: root.event_cid,
        child_event_cid: child.event_cid,
        rest_event_cid: restEventCid,
        p2p_history_contains_fixture: [root.event_cid, child.event_cid, restEventCid].every(cid =>
          typeof cid === 'string' && p2pHistory.some(event => event?.event_cid === cid),
        ),
        p2p_provenance_contains_parent: p2pProvenance.some(event => event?.event_cid === root.event_cid),
        rest_statuses: {
          append: restAppend.status,
          frontier: restFrontier.status,
          history: restHistory.status,
          provenance: restProvenance.status,
          compact: restCompact.status,
          archive: restArchive.status,
          archives: restArchives.status,
          certificate: restCertificate.status,
          certificate_verify: restVerification.status,
          inclusion: restInclusion.status,
        },
        compacted: compact?.compacted === true,
        compacted_cids: compacted,
        archive_cid: archiveCid,
        certificate: p2pCertificate,
        p2p_certificate_valid: p2pVerification.valid === true,
        p2p_inclusion: p2pInclusion,
        rest_certificate_valid: restVerification.body.valid === true,
        rest_inclusion: restInclusion.body,
        p2p_archive_present: archiveCid ? p2pArchives.some(archive => archive.archive_cid === archiveCid) : false,
      };
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      await Promise.allSettled([http.disconnect(), p2p.disconnect()]);
    }

    const certificate = record(results.certificate);
    const restStatuses = record(results.rest_statuses);
    const compactedCids = strings(results.compacted_cids);
    const expectedRest = ['append', 'frontier', 'history', 'provenance', 'compact', 'archive', 'archives', 'certificate', 'certificate_verify', 'inclusion'];
    const restAvailable = expectedRest.every(name => restStatuses[name] === 200);
    const resultValid = error === null
      && httpConnection?.success === true
      && httpConnection?.profiles?.includes('mcp++/event-dag') === true
      && p2pConnected
      && results.p2p_history_contains_fixture === true
      && results.p2p_provenance_contains_parent === true
      && results.compacted === true
      && typeof results.archive_cid === 'string'
      && typeof certificate.certificate_cid === 'string'
      && certificate.profile_name === profileName
      && certificate.proof_system === 'hash-commitment-v1'
      && certificate.zero_knowledge === false
      && results.p2p_certificate_valid === true
      && results.rest_certificate_valid === true
      && record(results.p2p_inclusion).event_cid === compactedCids[0]
      && record(results.rest_inclusion).event_cid === compactedCids[0]
      && results.p2p_archive_present === true
      && restAvailable;

    services.push({
      service,
      endpoint: `${baseUrl}/mcp`,
      multiaddr: announce.multiaddr,
      http_connected: httpConnection?.success === true,
      libp2p_connected: p2pConnected,
      profile_f_negotiated_http: httpConnection?.profiles?.includes('mcp++/event-dag') === true,
      profile_f_negotiated_libp2p: p2pConnections.get(config.name)?.profiles?.includes('mcp++/event-dag') === true,
      rest_available: restAvailable,
      valid: resultValid,
      error,
      results,
    });
  }

  await Promise.allSettled(announces.map(announce => multi.getConnector(serverConfigs[String(announce.service) as keyof typeof serverConfigs].name)?.disconnect()));
  const passed = services.length === 3 && services.every(service => service.valid === true);
  const evidence = {
    schema: 'swissknife.profile_f_http_libp2p_lifecycle.v1',
    generated_at: new Date().toISOString(),
    decision: passed ? 'go' : 'no_go',
    service_count: services.length,
    profile_name: profileName,
    proof_expectation: 'hash-commitment certificates are integrity proofs and correctly report zero_knowledge=false',
    services,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({
    decision: evidence.decision,
    service_count: evidence.service_count,
    output: outputPath,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch(error => {
  const evidence = {
    schema: 'swissknife.profile_f_http_libp2p_lifecycle.v1',
    generated_at: new Date().toISOString(),
    decision: 'no_go',
    service_count: 0,
    profile_name: profileName,
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    services: [],
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.error(evidence.error);
  process.exitCode = 1;
});
