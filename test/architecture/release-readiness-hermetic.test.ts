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

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  INDEPENDENT_REPLAY_EVIDENCE_FILE,
  RELEASE_EVIDENCE_PRODUCER_GATES,
  producerEvidenceAbsolutePaths,
  producerEvidenceDirectories,
  resetReleaseEvidenceProducers,
  runReleaseEvidenceProducers,
  runSingleProducerGate,
  verifyProducerEvidence,
} from '../../scripts/lib/release-readiness-evidence-producers.mjs';

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
    for (const file of producer.evidenceFiles ?? []) {
      writeFileSync(
        join(evidenceRoot, file),
        JSON.stringify({ schema: producer.schema ?? null, task_id: producer.taskId ?? null, producedBy: producer.id, generated_at: new Date().toISOString() }),
      );
    }
    for (const dir of producer.evidenceDirs ?? []) {
      const absoluteDir = join(evidenceRoot, dir);
      mkdirSync(absoluteDir, { recursive: true });
      writeFileSync(join(absoluteDir, `${producer.id}.png`), 'fixture-screenshot-bytes');
    }
    return { ok: true, status: 0, durationMs: 1, tail: [] };
  };
}

describe('release readiness hermetic cold-start orchestration (SVD-131)', () => {
  it('declares one producer for every SVD-131 evidence class in the required order', () => {
    const ids = RELEASE_EVIDENCE_PRODUCER_GATES.map((producer) => producer.id);
    expect(ids).toEqual([
      'application-live-behavior-proof',
      'application-gateway-evidence',
      'mcpplusplus-profile-interoperability',
      'meta-device-simulator-replay',
      'dispatch-artifact-persistence',
      'submodule-merge-reconciliation',
    ]);
    // The profile-interoperability producer reads the JSON the gateway
    // producer writes, so the manifest must enforce that it cannot run (or
    // be considered satisfied) before the gateway producer has completed.
    const profileProducer = RELEASE_EVIDENCE_PRODUCER_GATES.find((producer) => producer.id === 'mcpplusplus-profile-interoperability');
    expect(profileProducer?.dependsOn).toEqual(['application-gateway-evidence']);
    expect(ids.indexOf('application-gateway-evidence')).toBeLessThan(ids.indexOf('mcpplusplus-profile-interoperability'));
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
        if (filePath.endsWith(INDEPENDENT_REPLAY_EVIDENCE_FILE)) continue; // owned by a later, separate closeout gate
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
      expect(calls).toEqual(['application-live-behavior-proof', 'application-gateway-evidence']);
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
      mkdirSync(unrelatedDir, { recursive: true });
      writeFileSync(unrelatedFile, JSON.stringify({ owned_by: 'a different, earlier SVD/SWR task' }));
      writeFileSync(join(unrelatedDir, 'kept.png'), 'kept-bytes');

      const cleared = resetReleaseEvidenceProducers({ evidenceRoot: isolated.evidenceRoot, repoRoot: isolated.repoRoot });

      expect(cleared.some((entry) => entry.includes('release-evidence.json'))).toBe(false);
      expect(existsSync(unrelatedFile)).toBe(true);
      expect(existsSync(join(unrelatedDir, 'kept.png'))).toBe(true);
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
});
