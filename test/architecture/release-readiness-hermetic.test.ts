/** @vitest-environment node */
/**
 * SVD-131: cold-start, one-pass regression test for the release-readiness
 * evidence producer orchestration.
 *
 * This imports the *exact* production wiring from
 * `scripts/lib/release-readiness-evidence-producers.mjs` -- the same module
 * `scripts/release-readiness-gate.mjs` imports -- so the assertions below
 * cannot pass by re-implementing (or simulating) a looser parallel copy of
 * the orchestration logic. Only the command executor (`runProducer`) is
 * stubbed, so this test never pays for a full browser/Playwright run; the
 * real producers are exercised end-to-end by the separate, real
 * `npm run release:readiness` invocation (see the SVD-131 validation
 * commands), which this test complements rather than replaces.
 *
 * Every isolated evidence/repo root used below is a fresh `mkdtempSync`
 * directory unique to this test run, so nothing here ever touches, reuses,
 * or races with the real `test-results/virtual-desktop-ipfs-mcp-orb`
 * evidence root or another concurrent supervisor validation.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RELEASE_REPRODUCTION_SCHEMA,
  buildReleaseReproductionAttestation,
  renderReleaseReproductionAttestationMarkdown,
} from '../../scripts/lib/release-reproduction-attestation.mjs';
import { ALL_APP_LIVE_TOOL_BINDINGS } from '../../src/services/apps/all-app-live-tool-bindings';
import {
  INDEPENDENT_REPLAY_EVIDENCE_FILE,
  RELEASE_READINESS_ENTRYPOINT_OWNERSHIP,
  RELEASE_EVIDENCE_PRODUCER_GATES,
  createReleaseEvidenceProducerGateEntries,
  producerEvidenceAbsolutePaths,
  producerEvidenceDirectories,
  releaseReadinessEvidenceAbsolutePaths,
  resetReleaseEvidenceProducers,
  resetReleaseReadinessEvidence,
  runReleaseEvidenceProducers,
  runSingleProducerGate,
  validateReleaseReadinessManifest,
  verifyProducerEvidence,
} from '../../scripts/lib/release-readiness-evidence-producers.mjs';
import { findOwnedPort } from '../../scripts/lib/pick-free-port.mjs';

interface IsolatedRoot {
  repoRoot: string;
  evidenceRoot: string;
  cleanup: () => void;
}

function createIsolatedRoot(): IsolatedRoot {
  const repoRoot = mkdtempSync(join(tmpdir(), 'svd131-release-readiness-'));
  const evidenceRoot = join(repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
  mkdirSync(evidenceRoot, { recursive: true });
  return {
    repoRoot,
    evidenceRoot,
    cleanup: () => rmSync(repoRoot, { recursive: true, force: true }),
  };
}

/**
 * A `runProducer` stub that actually writes every evidence file/directory
 * `producer` declares (with distinguishable, per-invocation content), the
 * same way the real `npm run evidence:*` scripts write real receipts. Every
 * call is recorded in `calls` so tests can assert ordering.
 */
function createWritingProducerStub(evidenceRoot: string, calls: string[]) {
  return (producer: (typeof RELEASE_EVIDENCE_PRODUCER_GATES)[number]) => {
    calls.push(producer.id);
    for (const verification of producer.evidenceVerification.files ?? []) {
      const evidence = fixtureReceiptFromManifestChecks(producer, verification);
      writeFileSync(join(evidenceRoot, verification.file), `${JSON.stringify(evidence, null, 2)}\n`);
    }
    for (const dir of producer.evidenceDirs ?? []) {
      const absoluteDir = join(evidenceRoot, dir);
      mkdirSync(absoluteDir, { recursive: true });
      writeFileSync(join(absoluteDir, `${producer.id}.png`), 'fixture-screenshot-bytes');
    }
    return { ok: true, status: 0, durationMs: 1, tail: [] };
  };
}

function fixtureReceiptFromManifestChecks(
  producer: (typeof RELEASE_EVIDENCE_PRODUCER_GATES)[number],
  verification: (typeof RELEASE_EVIDENCE_PRODUCER_GATES)[number]['evidenceVerification']['files'][number],
) {
  const receipt: Record<string, unknown> = {
    schema: producer.schema,
    task_id: producer.taskId,
    generated_at: '2026-07-19T00:00:00.000Z',
    producedBy: producer.id,
  };
  for (const check of verification.checks ?? []) {
    const value = Object.prototype.hasOwnProperty.call(check, 'equals')
      ? check.equals
      : Array.isArray(check.oneOf)
        ? check.oneOf[0]
        : Number.isInteger(check.arrayMinLength)
          ? Array.from({ length: check.arrayMinLength }, (_, index) => ({ fixture: index + 1 }))
          : Number.isInteger(check.arrayMaxLength)
            ? []
          : check.truthy
            ? true
            : 'fixture-value';
    assignJsonPath(receipt, check.path, value);
  }
  return receipt;
}

function assignJsonPath(target: Record<string, unknown>, dottedPath: string, value: unknown): void {
  const segments = dottedPath.split('.');
  let cursor: Record<string, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

function listenOnLoopback(): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      server.off('error', reject);
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createSWR141AttestationFixture(statusOverrides: {
  gitStatus?: string[];
  detached?: boolean;
  branch?: string;
  parentMatches?: boolean;
  freshnessStatus?: string;
  readinessDecision?: string;
  aggregateDecision?: string;
} = {}): IsolatedRoot {
  const isolated = createIsolatedRoot();
  mkdirSync(join(isolated.repoRoot, 'docs'), { recursive: true });
  mkdirSync(join(isolated.repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb'), { recursive: true });
  mkdirSync(join(isolated.repoRoot, 'test-results', 'browser-proof-runtime'), { recursive: true });
  mkdirSync(join(isolated.repoRoot, 'node_modules', '@playwright', 'test'), { recursive: true });
  mkdirSync(join(isolated.repoRoot, 'node_modules', '@vitest', 'browser'), { recursive: true });

  writeFileSync(join(isolated.repoRoot, 'package-lock.json'), '{"lockfileVersion":3}\n');
  writeFileSync(join(isolated.repoRoot, 'docs', 'browser-libp2p-evidence.md'), '# libp2p\n');
  writeJson(join(isolated.repoRoot, 'docs', 'release-readiness-report.json'), {
    schemaVersion: 2,
    releaseDecision: statusOverrides.readinessDecision ?? 'GO',
  });
  writeJson(join(isolated.repoRoot, 'docs', 'release-evidence-freshness.json'), {
    schemaVersion: 1,
    generatedAt: '2026-07-19T00:00:00.000Z',
    results: [{
      id: 'virtual-desktop-release-evidence',
      status: statusOverrides.freshnessStatus ?? 'fresh',
      releaseBlocking: true,
      recordedFingerprint: 'a'.repeat(64),
      currentFingerprint: 'a'.repeat(64),
      recordedEvidenceHashes: {},
      currentEvidenceHashes: {},
    }],
  });
  writeJson(join(isolated.repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb', 'release-evidence.json'), {
    schema: 'swissknife.virtual-desktop-release-evidence.v2',
    task_id: 'SVD-114',
    generated_at: '2026-07-19T00:00:00.000Z',
    decision: {
      status: statusOverrides.aggregateDecision ?? 'GO',
      blocker_count: 0,
      blocker_task_ids: [],
    },
    artifacts: {},
  });
  writeJson(join(isolated.repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb', 'all-app-mcpplusplus-profile-interoperability.json'), {
    schema: 'swissknife.all-app-mcpplusplus-profile-interoperability.v2',
    task_id: 'SVD-127',
    generated_at: '2026-07-19T00:00:00.000Z',
    decision: 'GO',
    live_network_claimed: true,
    profiles: [{ profile: 'E', capability: 'mcp++/p2p-transport' }],
    desktop_paths: [{
      path_id: 'desktop:test',
      app_id: 'test',
      owner: 'ipfs_kit_py',
      operation: 'retrieve_content',
      transports: {
        parity_verified: true,
        http: { transport: 'http', receipt_cid: 'baf-http', event_cid: 'baf-event-http' },
        libp2p: { transport: 'libp2p', receipt_cid: 'baf-libp2p', event_cid: 'baf-event-libp2p' },
      },
    }],
  });
  writeJson(join(isolated.repoRoot, 'docs', 'browser-proof-runtime-evidence.json'), {
    schema: 'swissknife.browser-proof-runtime-evidence-contract.v1',
    task_id: 'SWR-139',
    required_engines: ['chromium', 'firefox', 'webkit'],
    theorem_runtime: { default_backend: { id: 'typescript-truth-table' }, fixture: { id: 'modus-ponens-tautology' } },
    zkp_runtime: {
      default_backend: { id: 'browser-schnorr-wasm', proof_system: 'schnorr-fiat-shamir', wasm_helper_sha256: 'b'.repeat(64) },
      deterministic_proof_fixture: { id: 'browser-schnorr-audited-policy-proof' },
    },
  });
  writeJson(join(isolated.repoRoot, 'test-results', 'browser-proof-runtime', 'observed-three-engine-runtime.json'), {
    schema: 'swissknife.browser-proof-runtime-observed-result.v1',
    command: 'npm run test:browser-proof-runtime',
    outcome: 'passed',
    generated_at: '2026-07-19T00:00:00.000Z',
    assertion_count: 81,
    assertions_per_engine: 27,
    engines: ['chromium', 'firefox', 'webkit'].map((name) => ({ name, outcome: 'passed', assertion_count: 27 })),
    source_fingerprints: {},
  });

  spawnSync('git', ['init'], { cwd: isolated.repoRoot });
  spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: isolated.repoRoot });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: isolated.repoRoot });
  spawnSync('git', ['add', '.'], { cwd: isolated.repoRoot });
  spawnSync('git', ['commit', '-m', 'fixture'], { cwd: isolated.repoRoot });
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: isolated.repoRoot, encoding: 'utf8' }).stdout.trim();

  (isolated as IsolatedRoot & { preRunGitState: Record<string, unknown> }).preRunGitState = {
    captured_at: '2026-07-19T00:00:00.000Z',
    swissknife_head: head,
    swissknife_branch: statusOverrides.detached === false ? (statusOverrides.branch ?? 'main') : null,
    swissknife_detached: statusOverrides.detached ?? true,
    swissknife_status_entries: statusOverrides.gitStatus ?? [],
    parent_head: 'c'.repeat(40),
    parent_gitlink_sha: statusOverrides.parentMatches === false ? 'd'.repeat(40) : head,
    parent_gitlink_matches_head: statusOverrides.parentMatches ?? true,
    parent_status_entries: [],
  };

  return isolated;
}

describe('release readiness hermetic cold-start orchestration (SVD-131)', () => {
  it('declares one producer for every SVD-131 evidence class in the required order', () => {
    const ids = RELEASE_EVIDENCE_PRODUCER_GATES.map((producer) => producer.id);
    expect(ids).toEqual([
      'all-tools-peer-interoperability',
      'application-live-tool-bindings',
      'all-tools-disposition-catalog',
      'application-live-binding-gap-ledger',
      'application-live-behavior-proof',
      'application-gateway-evidence',
      'mcpplusplus-profile-interoperability',
      'meta-device-simulator-replay',
      'dispatch-artifact-persistence',
      'application-ui-ux-accessibility',
      'submodule-merge-reconciliation',
      'refactor-main-reconciliation',
    ]);
    // The profile-interoperability producer reads the JSON the gateway
    // producer writes, so the manifest must enforce that it cannot run (or
    // be considered satisfied) before the gateway producer has completed.
    const profileProducer = RELEASE_EVIDENCE_PRODUCER_GATES.find((producer) => producer.id === 'mcpplusplus-profile-interoperability');
    expect(profileProducer?.dependsOn).toEqual(['application-gateway-evidence']);
    expect(ids.indexOf('application-gateway-evidence')).toBeLessThan(ids.indexOf('mcpplusplus-profile-interoperability'));
    const dispositionProducer = RELEASE_EVIDENCE_PRODUCER_GATES.find((producer) => producer.id === 'all-tools-disposition-catalog');
    expect(dispositionProducer?.dependsOn).toEqual(['all-tools-peer-interoperability']);
    expect(ids.indexOf('all-tools-peer-interoperability')).toBeLessThan(ids.indexOf('all-tools-disposition-catalog'));
    const accessibilityProducer = RELEASE_EVIDENCE_PRODUCER_GATES.find((producer) => producer.id === 'application-ui-ux-accessibility');
    expect(accessibilityProducer?.dependsOn).toEqual(['meta-device-simulator-replay']);
    expect(ids.indexOf('meta-device-simulator-replay')).toBeLessThan(ids.indexOf('application-ui-ux-accessibility'));
  });

  it('keeps producer ownership, default enablement, artifact paths, and verification rules in the manifest', () => {
    expect(validateReleaseReadinessManifest()).toEqual([]);

    const seenEvidenceFiles = new Set<string>();
    for (const producer of RELEASE_EVIDENCE_PRODUCER_GATES) {
      expect(producer.defaultEnabled).toBe(true);
      expect(producer.ownership.owner).toBe('release-readiness');
      expect(producer.ownership.auditDecision).toMatch(/\S/);
      expect(['host-release', 'browser-playwright', 'browser-libp2p', 'universal-helper']).toContain(producer.ownership.runtime);
      expect(producer.schema).toMatch(/^swissknife\./);
      expect(producer.taskId).toMatch(/^S(?:VD|WR)-\d+$/);
      expect(producer.evidenceVerification.mode).toBe('json-content-and-artifact-presence');
      expect(producer.evidenceVerification.files.map((entry) => entry.file).sort()).toEqual([...producer.evidenceFiles].sort());
      for (const file of producer.evidenceFiles) {
        expect(seenEvidenceFiles.has(file)).toBe(false);
        seenEvidenceFiles.add(file);
      }
      for (const verification of producer.evidenceVerification.files) {
        const schemaCheck = verification.checks.find((check) => check.path === 'schema');
        expect(verification.json).toBe(true);
        expect(verification.generatedAt).toBe(true);
        expect(schemaCheck?.equals).toMatch(/^swissknife\./);
        expect(verification.checks.some((check) => check.path === 'task_id')).toBe(true);
        expect(verification.checks.length).toBeGreaterThan(2);
      }
    }
  });

  it('rejects duplicate artifact ownership and dependency order drift in the manifest validator', () => {
    const isolated = createIsolatedRoot();
    try {
      const [firstProducer, secondProducer, thirdProducer] = RELEASE_EVIDENCE_PRODUCER_GATES;
      const duplicateArtifactProducers = [
        firstProducer,
        { ...secondProducer, evidenceFiles: [firstProducer.evidenceFiles[0]] },
      ];
      const dependencyOrderProducers = [
        thirdProducer,
        firstProducer,
        secondProducer,
      ];

      expect(validateReleaseReadinessManifest({
        producers: duplicateArtifactProducers,
        entrypoints: RELEASE_READINESS_ENTRYPOINT_OWNERSHIP,
        repoRoot: process.cwd(),
      }).join('\n')).toContain(`evidence file ${firstProducer.evidenceFiles[0]} already owned by ${firstProducer.id}`);

      expect(validateReleaseReadinessManifest({
        producers: dependencyOrderProducers,
        entrypoints: [],
        repoRoot: isolated.repoRoot,
      }).join('\n')).toContain(`${thirdProducer.id}: dependency ${thirdProducer.dependsOn![0]} must appear earlier in manifest order`);
    } finally {
      isolated.cleanup();
    }
  });

  it('documents ownership and audit decisions for every SVD-131 entrypoint', () => {
    const ownershipDocs = readFileSync(join(process.cwd(), 'docs', 'release-readiness-ownership.md'), 'utf8');

    expect(RELEASE_READINESS_ENTRYPOINT_OWNERSHIP.map((entry) => entry.path)).toEqual([
      'scripts/lib/release-readiness-evidence-producers.mjs',
      'scripts/release-readiness-gate.mjs',
      'scripts/lib/release-reproduction-attestation.mjs',
      'scripts/capture-refactor-main-reconciliation.cjs',
      'scripts/lib/pick-free-port.mjs',
      'scripts/run-with-owned-port.mjs',
      'build-tools/configs/playwright.live-behavior-proof.config.ts',
      'build-tools/configs/playwright.live-gateway.config.ts',
      'test/architecture/release-readiness-hermetic.test.ts',
    ]);

    for (const entrypoint of RELEASE_READINESS_ENTRYPOINT_OWNERSHIP) {
      expect(entrypoint.owner).toBe('release-readiness');
      expect(entrypoint.auditDecision).toMatch(/\S/);
      expect(ownershipDocs).toContain(`\`${entrypoint.path}\``);
    }
    expect(ownershipDocs).toContain('No second executable producer list is permitted');
    expect(ownershipDocs).toContain('never reuses, inspects, kills, or masquerades as a foreign listener');
  });

  it('builds the production release producer gates from the manifest helper', () => {
    const isolated = createIsolatedRoot();
    try {
      const releaseGate = readFileSync(join(process.cwd(), 'scripts', 'release-readiness-gate.mjs'), 'utf8');
      expect(releaseGate).toContain('createReleaseEvidenceProducerGateEntries');
      expect(releaseGate).not.toContain('completedProducerIds');

      const calls: string[] = [];
      const entries = createReleaseEvidenceProducerGateEntries({
        evidenceRoot: isolated.evidenceRoot,
        repoRoot: isolated.repoRoot,
        runProducer: createWritingProducerStub(isolated.evidenceRoot, calls),
      });

      expect(entries.map((entry) => entry.id)).toEqual(
        RELEASE_EVIDENCE_PRODUCER_GATES.filter((producer) => producer.defaultEnabled).map((producer) => producer.id),
      );
      for (const entry of entries) {
        expect(entry.producer.id).toBe(entry.id);
        expect(entry.run().ok).toBe(true);
      }
      expect(calls).toEqual(RELEASE_EVIDENCE_PRODUCER_GATES.map((producer) => producer.id));
    } finally {
      isolated.cleanup();
    }
  });

  it('binds live tool binding evidence to the executable backend source contract schema', () => {
    expect(ALL_APP_LIVE_TOOL_BINDINGS.source_contract.schema).toBe(
      'swissknife.all-app-executable-backend-contract.v1',
    );
    expect(ALL_APP_LIVE_TOOL_BINDINGS.source_contract.contract_id).toBe(
      'org.hallucinate.swissknife.all-app-executable-backend-contract',
    );
  });

  it('keeps the browser Playwright entrypoints owned, real, and foreign-server safe', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    const liveGatewayConfig = readFileSync(
      join(process.cwd(), 'build-tools', 'configs', 'playwright.live-gateway.config.ts'),
      'utf8',
    );
    const liveBehaviorConfig = readFileSync(
      join(process.cwd(), 'build-tools', 'configs', 'playwright.live-behavior-proof.config.ts'),
      'utf8',
    );

    expect(packageJson.scripts['test:e2e:live-gateway']).toContain('scripts/run-with-owned-port.mjs');
    expect(packageJson.scripts['test:e2e:live-gateway']).toContain('SWISSKNIFE_LIVE_GATEWAY_E2E_PORT');
    expect(liveGatewayConfig).toContain('reuseExistingServer: false');
    expect(liveGatewayConfig).toContain('--strictPort');
    expect(liveGatewayConfig).toContain('SWISSKNIFE_LIVE_GATEWAY_E2E_PORT');
    expect(liveBehaviorConfig).not.toMatch(/\bwebServer\s*:/);
    for (const source of [liveGatewayConfig, liveBehaviorConfig]) {
      const executableSource = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(executableSource).not.toMatch(/\bpython(?:3)?\b/i);
      expect(executableSource).not.toMatch(/\breuseExistingServer:\s*true\b/);
    }
  });

  it('starts from a genuinely empty isolated evidence root and produces every required receipt in one pass', () => {
    const isolated = createIsolatedRoot();
    try {
      // Prove the root really is empty before the orchestration runs.
      expect(readdirSync(isolated.evidenceRoot)).toEqual([]);

      const calls: string[] = [];
      const result = runReleaseEvidenceProducers({
        evidenceRoot: isolated.evidenceRoot,
        repoRoot: isolated.repoRoot,
        runProducer: createWritingProducerStub(isolated.evidenceRoot, calls),
      });

      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(RELEASE_EVIDENCE_PRODUCER_GATES.length);
      expect(result.results.every((entry) => entry.ok)).toBe(true);
      // One invocation, one call per producer, in manifest order -- no
      // producer is skipped, retried, or reordered.
      expect(calls).toEqual(RELEASE_EVIDENCE_PRODUCER_GATES.map((producer) => producer.id));

      for (const filePath of producerEvidenceAbsolutePaths(RELEASE_EVIDENCE_PRODUCER_GATES, isolated.evidenceRoot)) {
        expect(existsSync(filePath)).toBe(true);
      }
      for (const dirPath of producerEvidenceDirectories(RELEASE_EVIDENCE_PRODUCER_GATES, isolated.evidenceRoot)) {
        expect(existsSync(dirPath)).toBe(true);
        expect(readdirSync(dirPath).length).toBeGreaterThan(0);
      }
    } finally {
      isolated.cleanup();
    }
  });

  it('deletes pre-existing stale/copied receipts before running producers, so a prior run cannot make it pass', () => {
    const isolated = createIsolatedRoot();
    try {
      const gatewayProducer = RELEASE_EVIDENCE_PRODUCER_GATES.find((producer) => producer.id === 'application-gateway-evidence')!;
      const staleFile = join(isolated.evidenceRoot, gatewayProducer.evidenceFiles![0]);
      const staleScreenshotDir = join(isolated.evidenceRoot, 'app-screenshots', 'live-behavior-proof');
      mkdirSync(staleScreenshotDir, { recursive: true });
      writeFileSync(staleFile, 'STALE-COPIED-RECEIPT-FROM-A-PRIOR-RUN');
      writeFileSync(join(staleScreenshotDir, 'stale-screenshot.png'), 'stale-bytes');

      const observedAtProducerStart: Record<string, string | null> = {};
      const runProducer = (producer: (typeof RELEASE_EVIDENCE_PRODUCER_GATES)[number]) => {
        // Record what the gateway producer's declared file contains at the
        // moment its own producer command runs -- it must already be gone,
        // proving the cold-start reset ran before any producer executed,
        // not just before the whole batch was scheduled.
        if (producer.id === gatewayProducer.id) {
          observedAtProducerStart[producer.id] = existsSync(staleFile) ? readFileSync(staleFile, 'utf8') : null;
        }
        return createWritingProducerStub(isolated.evidenceRoot, [])(producer);
      };

      const result = runReleaseEvidenceProducers({
        evidenceRoot: isolated.evidenceRoot,
        repoRoot: isolated.repoRoot,
        runProducer,
      });

      expect(result.ok).toBe(true);
      expect(result.cleared.some((entry) => entry.includes(gatewayProducer.evidenceFiles![0]))).toBe(true);
      expect(observedAtProducerStart[gatewayProducer.id]).toBeNull();
      expect(readFileSync(staleFile, 'utf8')).not.toContain('STALE-COPIED-RECEIPT-FROM-A-PRIOR-RUN');
      expect(readdirSync(staleScreenshotDir)).not.toContain('stale-screenshot.png');
    } finally {
      isolated.cleanup();
    }
  });

  it('fails a producer gate when its command exits 0 but does not actually write its declared evidence', () => {
    const isolated = createIsolatedRoot();
    try {
      const producer = RELEASE_EVIDENCE_PRODUCER_GATES[0];
      const noOpRunProducer = () => ({ ok: true, status: 0, durationMs: 1, tail: [] });

      const gateOutcome = runSingleProducerGate(producer, {
        runProducer: noOpRunProducer,
        evidenceRoot: isolated.evidenceRoot,
        repoRoot: isolated.repoRoot,
      });

      expect(gateOutcome.ok).toBe(false);
      expect(gateOutcome.missingFiles.length + gateOutcome.missingDirs.length).toBeGreaterThan(0);
      expect(gateOutcome.tail.join('\n')).toContain('did not produce its declared evidence');
      expect(gateOutcome.tail.join('\n')).toContain('not permitted to fall back to a stale or previously-copied receipt');
    } finally {
      isolated.cleanup();
    }
  });

  it('rejects timestamp-only receipts even when the expected evidence file exists', () => {
    const isolated = createIsolatedRoot();
    try {
      const producer = RELEASE_EVIDENCE_PRODUCER_GATES[0];
      const timestampOnlyRunProducer = () => {
        writeFileSync(
          join(isolated.evidenceRoot, producer.evidenceFiles[0]),
          JSON.stringify({
            schema: producer.schema,
            task_id: producer.taskId,
            generated_at: '2026-07-19T00:00:00.000Z',
          }),
        );
        for (const dir of producer.evidenceDirs ?? []) {
          const absoluteDir = join(isolated.evidenceRoot, dir);
          mkdirSync(absoluteDir, { recursive: true });
          writeFileSync(join(absoluteDir, 'screenshot.png'), 'fixture-screenshot-bytes');
        }
        return { ok: true, status: 0, durationMs: 1, tail: [] };
      };

      const gateOutcome = runSingleProducerGate(producer, {
        runProducer: timestampOnlyRunProducer,
        evidenceRoot: isolated.evidenceRoot,
        repoRoot: isolated.repoRoot,
      });

      expect(gateOutcome.ok).toBe(false);
      expect(gateOutcome.invalidFiles.length).toBeGreaterThan(0);
      expect(gateOutcome.tail.join('\n')).toContain('invalid evidence content');
    } finally {
      isolated.cleanup();
    }
  });

  it('stops at the first failing producer and never runs downstream producers out of order', () => {
    const isolated = createIsolatedRoot();
    try {
      const calls: string[] = [];
      const failingProducerId = 'application-gateway-evidence';
      const runProducer = (producer: (typeof RELEASE_EVIDENCE_PRODUCER_GATES)[number]) => {
        calls.push(producer.id);
        if (producer.id === failingProducerId) {
          return { ok: false, status: 1, durationMs: 1, tail: ['synthetic failure for regression coverage'] };
        }
        return createWritingProducerStub(isolated.evidenceRoot, [])(producer);
      };

      const result = runReleaseEvidenceProducers({
        evidenceRoot: isolated.evidenceRoot,
        repoRoot: isolated.repoRoot,
        runProducer,
      });

      expect(result.ok).toBe(false);
      expect(calls).toEqual(
        RELEASE_EVIDENCE_PRODUCER_GATES
          .slice(0, RELEASE_EVIDENCE_PRODUCER_GATES.findIndex((producer) => producer.id === failingProducerId) + 1)
          .map((producer) => producer.id),
      );
      const failingResult = result.results.find((entry) => entry.id === failingProducerId);
      expect(failingResult?.ok).toBe(false);
      // The dependent profile-interoperability producer must never have run.
      expect(calls).not.toContain('mcpplusplus-profile-interoperability');
    } finally {
      isolated.cleanup();
    }
  });

  it('blocks a producer whose declared dependency has not completed, without invoking its command', () => {
    const isolated = createIsolatedRoot();
    try {
      const calls: string[] = [];
      const skipGatewayEvidence = (producer: (typeof RELEASE_EVIDENCE_PRODUCER_GATES)[number]) => {
        calls.push(producer.id);
        if (producer.id === 'application-gateway-evidence') {
          // Report success, but deliberately do NOT write the declared file,
          // so `runSingleProducerGate`'s independent verification fails it
          // instead of trusting the exit code.
          return { ok: true, status: 0, durationMs: 1, tail: [] };
        }
        return createWritingProducerStub(isolated.evidenceRoot, [])(producer);
      };

      const result = runReleaseEvidenceProducers({
        evidenceRoot: isolated.evidenceRoot,
        repoRoot: isolated.repoRoot,
        runProducer: skipGatewayEvidence,
      });

      expect(result.ok).toBe(false);
      // The profile-interoperability producer depends on the gateway
      // evidence producer; since that producer failed verification, the
      // dependent producer must never even be invoked.
      expect(calls).not.toContain('mcpplusplus-profile-interoperability');
    } finally {
      isolated.cleanup();
    }
  });

  it('only clears evidence this manifest owns and leaves unrelated files in the evidence root untouched', () => {
    const isolated = createIsolatedRoot();
    try {
      const unrelatedFile = join(isolated.evidenceRoot, 'release-evidence.json');
      const unrelatedDir = join(isolated.evidenceRoot, 'app-screenshots', 'agent-supervisor');
      const downstreamReplayFile = join(isolated.evidenceRoot, INDEPENDENT_REPLAY_EVIDENCE_FILE);
      mkdirSync(unrelatedDir, { recursive: true });
      writeFileSync(unrelatedFile, JSON.stringify({ owned_by: 'a different, earlier SVD/SWR task' }));
      writeFileSync(join(unrelatedDir, 'kept.png'), 'kept-bytes');
      writeFileSync(downstreamReplayFile, JSON.stringify({ owned_by: 'post-producer-closeout-gate' }));

      const cleared = resetReleaseEvidenceProducers({ evidenceRoot: isolated.evidenceRoot, repoRoot: isolated.repoRoot });

      expect(cleared.some((entry) => entry.includes('release-evidence.json'))).toBe(false);
      expect(cleared.some((entry) => entry.includes(INDEPENDENT_REPLAY_EVIDENCE_FILE))).toBe(false);
      expect(existsSync(unrelatedFile)).toBe(true);
      expect(existsSync(join(unrelatedDir, 'kept.png'))).toBe(true);
      expect(existsSync(downstreamReplayFile)).toBe(true);
    } finally {
      isolated.cleanup();
    }
  });

  it('clears downstream release receipts only through the explicit full release reset boundary', () => {
    const isolated = createIsolatedRoot();
    try {
      const downstreamReplayFile = join(isolated.evidenceRoot, INDEPENDENT_REPLAY_EVIDENCE_FILE);
      writeFileSync(downstreamReplayFile, JSON.stringify({ stale: true }));

      expect(producerEvidenceAbsolutePaths(RELEASE_EVIDENCE_PRODUCER_GATES, isolated.evidenceRoot)).not.toContain(downstreamReplayFile);
      expect(releaseReadinessEvidenceAbsolutePaths(RELEASE_EVIDENCE_PRODUCER_GATES, isolated.evidenceRoot)).toContain(downstreamReplayFile);

      const cleared = resetReleaseReadinessEvidence({ evidenceRoot: isolated.evidenceRoot, repoRoot: isolated.repoRoot });

      expect(cleared.some((entry) => entry.includes(INDEPENDENT_REPLAY_EVIDENCE_FILE))).toBe(true);
      expect(existsSync(downstreamReplayFile)).toBe(false);
    } finally {
      isolated.cleanup();
    }
  });

  it('verifyProducerEvidence reports every missing file/directory for a producer without running anything', () => {
    const isolated = createIsolatedRoot();
    try {
      const producer = RELEASE_EVIDENCE_PRODUCER_GATES.find((entry) => (entry.evidenceDirs ?? []).length > 0)!;
      const verification = verifyProducerEvidence(producer, isolated.evidenceRoot, isolated.repoRoot);
      expect(verification.ok).toBe(false);
      expect(verification.missingFiles.length).toBe((producer.evidenceFiles ?? []).length);
      expect(verification.missingDirs.length).toBe((producer.evidenceDirs ?? []).length);
    } finally {
      isolated.cleanup();
    }
  });

  it('leases around a foreign listener without reusing, killing, or masquerading as it', async () => {
    const { server, port: foreignPort } = await listenOnLoopback();
    try {
      const lease = await findOwnedPort({ host: '127.0.0.1', preferredPort: foreignPort, fallbackRange: 4 });

      expect(lease.port).not.toBe(foreignPort);
      expect(lease.leasedFromPreferred).toBe(false);
      expect(lease.owner).toBe('current-process-exclusive-bind-probe');
      expect(lease.foreignListenerAction).toBe('left-untouched');
      expect(server.listening).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it('passes only the owned leased port to the wrapped child command', async () => {
    const { server, port: foreignPort } = await listenOnLoopback();
    try {
      const result = spawnSync(
        process.execPath,
        [
          'scripts/run-with-owned-port.mjs',
          '--env-var',
          'SVD131_TEST_PORT',
          '--preferred',
          String(foreignPort),
          '--',
          process.execPath,
          '-e',
          'process.stdout.write(String(process.env.SVD131_TEST_PORT));',
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      const leasedPort = Number(result.stdout.trim().split(/\s+/).at(-1));
      expect(Number.isInteger(leasedPort)).toBe(true);
      expect(leasedPort).not.toBe(foreignPort);
      expect(server.listening).toBe(true);
    } finally {
      await closeServer(server);
    }
  });
});

describe('release reproduction attestation (SWR-141)', () => {
  it('binds commit, lockfile, tool versions, browser projects, transport receipts, proof receipts, freshness, and outputs', () => {
    const isolated = createSWR141AttestationFixture();
    try {
      const preRunGitState = (isolated as IsolatedRoot & { preRunGitState: Record<string, unknown> }).preRunGitState;
      const attestation = buildReleaseReproductionAttestation({
        repoRoot: isolated.repoRoot,
        preRunGitState,
        releaseReadinessReport: { releaseDecision: 'GO' },
        generatedAt: '2026-07-19T00:00:00.000Z',
      });

      expect(attestation.schema).toBe(RELEASE_REPRODUCTION_SCHEMA);
      expect(attestation.task_id).toBe('SWR-141');
      expect(attestation.release_decision).toBe('GO');
      expect(attestation.candidate.commit).toBe(preRunGitState.swissknife_head);
      expect(attestation.candidate.lockfile.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(attestation.tool_versions.node).toMatch(/^v/);
      expect(attestation.browser_projects.libp2p_playwright.projects).toEqual(['chromium', 'firefox', 'webkit']);
      expect(attestation.browser_projects.browser_proof_runtime.instances).toEqual(['chromium', 'firefox', 'webkit']);
      expect(attestation.libp2p_transport_receipts.profile_interoperability.receipts[0].libp2p.receipt_cid).toBe('baf-libp2p');
      expect(attestation.proof_receipts.observed_execution.assertion_count).toBe(81);
      expect(attestation.evidence_freshness.results[0].status).toBe('fresh');
      expect(attestation.output_hashes['docs/release-readiness-report.json'].sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(attestation.canonical_payload_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(sha256Text(JSON.stringify({
        ...attestation,
        canonical_payload_sha256: null,
        output_hashes: {
          ...attestation.output_hashes,
          'docs/release-reproduction-attestation.json': {
            ...attestation.output_hashes['docs/release-reproduction-attestation.json'],
            sha256: null,
            hash_kind: 'canonical-json-payload-with-self-hash-null',
          },
        },
      }))).toBe(attestation.canonical_payload_sha256);

      const markdown = renderReleaseReproductionAttestationMarkdown(attestation);
      expect(markdown).toContain('Release decision: **GO**');
      expect(markdown).toContain('libp2p desktop paths: 1');
    } finally {
      isolated.cleanup();
    }
  });

  it('accepts a clean attached release branch for SWR-162 integration validation', () => {
    const isolated = createSWR141AttestationFixture({
      detached: false,
      branch: 'automation/swissknife-refactor-integration',
    });
    try {
      const preRunGitState = (isolated as IsolatedRoot & { preRunGitState: Record<string, unknown> }).preRunGitState;
      const attestation = buildReleaseReproductionAttestation({
        repoRoot: isolated.repoRoot,
        preRunGitState,
        releaseReadinessReport: { releaseDecision: 'GO' },
        generatedAt: '2026-07-19T00:00:00.000Z',
      });

      expect(attestation.release_decision).toBe('GO');
      expect(attestation.candidate.checkout_policy).toMatchObject({
        accepted: true,
        mode: 'attached-release-branch',
      });
    } finally {
      isolated.cleanup();
    }
  });

  it('makes non-release attached checkout, local uncommitted files, stale reports, and parent gitlink drift NO_GO blockers', () => {
    const isolated = createSWR141AttestationFixture({
      detached: false,
      branch: 'feature/stale-refactor-replay',
      gitStatus: [' M src/services/example.ts'],
      parentMatches: false,
      freshnessStatus: 'stale',
    });
    try {
      const preRunGitState = (isolated as IsolatedRoot & { preRunGitState: Record<string, unknown> }).preRunGitState;
      const attestation = buildReleaseReproductionAttestation({
        repoRoot: isolated.repoRoot,
        preRunGitState,
        releaseReadinessReport: { releaseDecision: 'GO' },
        generatedAt: '2026-07-19T00:00:00.000Z',
      });
      const blockerIds = attestation.no_go_findings.map((finding) => finding.id);

      expect(attestation.release_decision).toBe('NO_GO');
      expect(blockerIds).toContain('not-detached-checkout');
      expect(blockerIds).toContain('local-uncommitted-files');
      expect(blockerIds).toContain('parent-gitlink-mismatch');
      expect(blockerIds).toContain('stale-release-evidence');
    } finally {
      isolated.cleanup();
    }
  });
});
