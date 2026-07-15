/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_APP_EXECUTABLE_BACKEND_CONTRACT } from '../../src/services/apps/all-app-executable-backend-contract';
import { EventDAG, verifyEventDAGInclusionProof } from '../../src/services/mcp/mcp-event-dag';
import { evaluateProfileDExecution } from '../../src/services/mcp/profile-d-policy';
import {
  ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA,
  MCPPLUSPLUS_PROFILE_EVIDENCE,
  buildAllAppMCPPlusPlusProfileInteroperabilityReport,
  type AllToolsPeerEvidence,
  type ProfileFCompactionEvidence,
} from '../../src/services/mcp/all-app-mcpplusplus-profile-interoperability';

const EVIDENCE_ROOT = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const PEER_EVIDENCE_PATH = join(EVIDENCE_ROOT, 'swissknife-all-tools-peer-evidence.json');
const REPORT_PATH = join(EVIDENCE_ROOT, 'all-app-mcpplusplus-profile-interoperability.json');
const GENERATED_AT = '2026-07-15T12:00:00.000Z';

function buildCompactionEvidence(): ProfileFCompactionEvidence {
  const dag = new EventDAG({ hotEventMax: 2, epochSize: 2 });
  const root = dag.appendEvent({
    intent_cid: 'sha256:intent' + '0'.repeat(57),
    interface_cid: 'sha256:interface' + '0'.repeat(54),
    proofs: [], outputs: [], parents: [], timestamp: '2026-07-15T00:00:00.000Z',
    correlation_id: 'svd-109-compaction', operation: 'desktop-path-proof',
  });
  const child = dag.appendEvent({
    intent_cid: 'sha256:child-intent' + '0'.repeat(51),
    interface_cid: 'sha256:interface' + '0'.repeat(54),
    proofs: [], outputs: [], parents: [root], timestamp: '2026-07-15T00:00:01.000Z',
    correlation_id: 'svd-109-compaction', operation: 'receipt-persisted',
  });
  dag.appendEvent({
    intent_cid: 'sha256:tip-intent' + '0'.repeat(53),
    interface_cid: 'sha256:interface' + '0'.repeat(54),
    proofs: [], outputs: [], parents: [child], timestamp: '2026-07-15T00:00:02.000Z',
    correlation_id: 'svd-109-compaction', operation: 'archive-checkpoint',
  });
  const archive = dag.listArchives()[0];
  const witness = dag.getInclusionProof(root);
  const bounded = dag.traverseBounded(root);
  if (!archive || !witness) throw new Error('Expected deterministic Profile F compaction evidence.');
  return {
    event_cid: root,
    archive_cid: archive.archive_cid,
    certificate_cid: archive.certificate.certificate_cid,
    merkle_root: archive.certificate.merkle_root,
    event_count: archive.certificate.event_count,
    certificate_verified: dag.verifyCertificate(archive.certificate.certificate_cid),
    inclusion_verified: verifyEventDAGInclusionProof(root, witness.proof, witness.merkle_root),
    bounded_history_compacted: bounded.events.length === 0
      && bounded.archive_boundaries.some(boundary => boundary.event_cid === root),
  };
}

function buildReport() {
  const peerEvidence = JSON.parse(readFileSync(PEER_EVIDENCE_PATH, 'utf8')) as AllToolsPeerEvidence;
  const policyEvidence = evaluateProfileDExecution({
    actor: 'did:key:svd-109-desktop',
    action: 'mcp.desktop.invoke',
    resource: 'virtual-desktop/*',
    evaluated_at: '2026-07-15T00:00:00.000Z',
    policy: { clauses: [{ clause_type: 'permission', actor: 'did:key:svd-109-desktop', action: 'mcp.desktop.invoke', resource: 'virtual-desktop/*' }] },
    request_zkp_certificate: true,
  });
  return buildAllAppMCPPlusPlusProfileInteroperabilityReport({
    generatedAt: GENERATED_AT,
    peerEvidence,
    policyEvidence,
    compactionEvidence: buildCompactionEvidence(),
  });
}

describe('SVD-109 all-app MCP++ Profile A–H interoperability', () => {
  it('proves every applicable desktop binding has independent HTTP/libp2p execution evidence', () => {
    const report = buildReport();
    const expectedBindingIds = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps
      .flatMap(app => app.backend_bindings)
      .filter(binding => binding.transport_policy.allowed_transports.includes('http')
        && binding.transport_policy.allowed_transports.includes('libp2p'))
      .map(binding => binding.binding_id)
      .sort();

    expect(report).toMatchObject({
      schema: ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA,
      task_id: 'SVD-109',
      generated_at: GENERATED_AT,
      decision: 'GO',
      live_network_claimed: false,
    });
    expect(report.desktop_paths.map(path => path.binding_id).sort()).toEqual(expectedBindingIds);
    expect(report.desktop_paths.every(path => path.transports.parity_verified)).toBe(true);
    expect(report.desktop_paths.every(path => path.transports.http === 'executed'
      && path.transports.libp2p === 'executed')).toBe(true);
  });

  it('carries descriptor, receipt, UCAN, policy, and event-DAG evidence for Profiles A through F', () => {
    const report = buildReport();
    for (const path of [...report.desktop_paths, report.supervisor_console]) {
      expect(path.profiles.map(profile => profile.profile)).toEqual(MCPPLUSPLUS_PROFILE_EVIDENCE.map(([profile]) => profile));
      for (const profile of path.profiles.filter(profile => ['A', 'B', 'C', 'D', 'E', 'F'].includes(profile.profile))) {
        expect(profile.outcome).toBe('executed');
      }
      const a = path.profiles.find(profile => profile.profile === 'A')!;
      const b = path.profiles.find(profile => profile.profile === 'B')!;
      const c = path.profiles.find(profile => profile.profile === 'C')!;
      const d = path.profiles.find(profile => profile.profile === 'D')!;
      const f = path.profiles.find(profile => profile.profile === 'F')!;
      expect(a.evidence.http_descriptor_cid).toEqual(expect.any(String));
      expect(b.evidence.http_receipt_cid).toEqual(expect.any(String));
      expect(c.evidence.remote_did).toMatch(/^did:key:/);
      expect(c.evidence.delegation_proof_cid).toEqual(expect.any(String));
      expect(d.evidence.policy_cid).toMatch(/^baguq[a-z2-7]+$/);
      expect(f.evidence).toMatchObject({ certificate_verified: true, inclusion_verified: true, bounded_history_compacted: true });
    }
  });

  it('keeps Supervisor scheduling/delegation distinct and payment policy honest', () => {
    const report = buildReport();
    const supervisorG = report.supervisor_console.profiles.find(profile => profile.profile === 'G');
    const supervisorH = report.supervisor_console.profiles.find(profile => profile.profile === 'H');
    expect(supervisorG).toMatchObject({ outcome: 'executed', evidence: { scheduling_surface: 'agent-supervisor', capability_aware_delegation: true } });
    expect(supervisorH).toMatchObject({ outcome: 'unsupported', evidence: { payment_enabled: false, settlement_attempted: false } });
    expect(report.desktop_paths.filter(path => path.app_id !== 'agent-supervisor')
      .every(path => path.profiles.find(profile => profile.profile === 'G')?.outcome === 'unsupported')).toBe(true);
    expect(report.coverage.payment_enabled).toBe(false);
  });

  it('retains explicit denied, unsupported, and unreachable paths rather than collapsing them', () => {
    const report = buildReport();
    expect(report.outcome_probes.map(probe => probe.outcome).sort()).toEqual(['denied', 'unreachable', 'unsupported']);
    expect(report.coverage.profile_outcome_counts.denied).toBeGreaterThan(0);
    expect(report.coverage.profile_outcome_counts.unsupported).toBeGreaterThan(0);
    expect(report.coverage.profile_outcome_counts.unreachable).toBeGreaterThan(0);
  });

  it('fails closed when independently executed libp2p evidence is absent', () => {
    const peerEvidence = JSON.parse(readFileSync(PEER_EVIDENCE_PATH, 'utf8')) as AllToolsPeerEvidence;
    const withoutLibp2p = structuredClone(peerEvidence);
    const kit = withoutLibp2p.services?.find(service => service.service === 'ipfs_kit_py');
    if (kit?.transports?.libp2p?.fixture) kit.transports.libp2p.fixture.status = 'unsupported';
    const policyEvidence = evaluateProfileDExecution({
      actor: 'did:key:svd-109-desktop', action: 'mcp.desktop.invoke', resource: 'virtual-desktop/*',
      evaluated_at: '2026-07-15T00:00:00.000Z',
      policy: { clauses: [{ clause_type: 'permission', actor: 'did:key:svd-109-desktop', action: 'mcp.desktop.invoke', resource: 'virtual-desktop/*' }] },
    });
    expect(() => buildAllAppMCPPlusPlusProfileInteroperabilityReport({
      generatedAt: GENERATED_AT, peerEvidence: withoutLibp2p, policyEvidence, compactionEvidence: buildCompactionEvidence(),
    })).toThrow(/independently executed HTTP and libp2p fixtures/i);
  });

  it('keeps a reviewed evidence snapshot without treating dynamic peer CIDs as immutable fixtures', () => {
    const artifact = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as ReturnType<typeof buildReport>;
    expect(artifact).toMatchObject({
      schema: ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA,
      task_id: 'SVD-109',
      decision: 'GO',
      live_network_claimed: false,
      coverage: { applicable_desktop_path_count: 22, all_profiles_represented: true, payment_enabled: false },
    });
    expect(artifact.desktop_paths.every(path => path.profiles.some(profile => profile.profile === 'A'
      && profile.outcome === 'executed'))).toBe(true);
    expect(artifact.supervisor_console.profiles.find(profile => profile.profile === 'G')?.outcome).toBe('executed');
  });
});
