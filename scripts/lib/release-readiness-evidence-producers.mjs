#!/usr/bin/env node
/**
 * SVD-131: canonical, single source of truth for the release-readiness
 * evidence producers that must run once, for real, from an empty evidence
 * root before the release-readiness gate is allowed to aggregate to a `GO`
 * decision.
 *
 * Both `scripts/release-readiness-gate.mjs` (the real orchestration) and
 * `test/architecture/release-readiness-hermetic.test.ts` (the cold-start
 * regression test) import this module so the wiring under test is the exact
 * same wiring that runs in production -- the test cannot pass by
 * re-implementing or simulating a parallel copy of the orchestration logic.
 *
 * Every entry below corresponds to one of the evidence classes named in the
 * SVD-131 acceptance criteria:
 *   - "current real app behavior"            -> application-live-behavior-proof
 *   - "application-originated gateway"        -> application-gateway-evidence
 *   - "Profiles A-H"                          -> mcpplusplus-profile-interoperability
 *   - "Meta simulator"                        -> meta-device-simulator-replay
 *   - "dispatch-artifact"                     -> dispatch-artifact-persistence
 *   - "merge-reconciliation"                  -> submodule-merge-reconciliation
 * ("freshness" and "independent closeout receipts" are already-wired gates
 * elsewhere in `release-readiness-gate.mjs`; they run immediately after
 * these producers and after the aggregator.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '..', '..');
export const evidenceRoot = path.join(repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');

/**
 * Ordered producer gates. Order matters: `mcpplusplus-profile-interoperability`
 * reads the JSON written by `application-gateway-evidence`
 * (`all-app-live-gateway-executions.json`) as its own input, so it must run
 * strictly after it.
 */
export const RELEASE_EVIDENCE_PRODUCER_GATES = [
  {
    id: 'application-live-behavior-proof',
    label: 'Current real application behavior proof (SVD-106)',
    npmScript: 'evidence:live-behavior-proof',
    evidenceFiles: ['all-app-live-behavior-proof.json'],
    evidenceDirs: ['app-screenshots/live-behavior-proof'],
    schema: 'swissknife.all-app-live-behavior-proof.v1',
    taskId: 'SVD-106',
  },
  {
    id: 'application-gateway-evidence',
    label: 'Application-originated browser gateway calls (SVD-126)',
    npmScript: 'evidence:live-gateway',
    evidenceFiles: ['all-app-live-gateway-executions.json'],
  },
  {
    id: 'mcpplusplus-profile-interoperability',
    label: 'Profiles A-H HTTP/browser-libp2p transport matrix (SVD-127)',
    npmScript: 'evidence:profile-interoperability',
    evidenceFiles: ['all-app-mcpplusplus-profile-interoperability.json'],
    dependsOn: ['application-gateway-evidence'],
    schema: 'swissknife.all-app-mcpplusplus-profile-interoperability.v2',
    taskId: 'SVD-127',
  },
  {
    id: 'meta-device-simulator-replay',
    label: 'Hardware-free Meta glasses device simulator replay (SVD-099/SVD-111)',
    npmScript: 'evidence:meta-simulator',
    evidenceFiles: ['all-app-meta-device-simulator.json', 'all-app-meta-device-simulator-proof.json'],
    evidenceDirs: ['app-screenshots/meta-device-simulator', 'app-screenshots/meta-device-simulator-proof'],
    schema: 'swissknife.all-app-meta-device-simulator-proof.v1',
    taskId: 'SVD-111',
  },
  {
    id: 'dispatch-artifact-persistence',
    label: 'Supervisor dispatch artifact CID/event-DAG persistence (SVD-113)',
    npmScript: 'evidence:dispatch-artifact',
    evidenceFiles: ['supervisor-dispatch-artifact-store.json'],
    schema: 'swissknife.supervisor-dispatch-artifact-store-evidence.v1',
    taskId: 'SVD-113',
  },
  {
    id: 'submodule-merge-reconciliation',
    label: 'Submodule/workspace merge reconciliation (SVD-116)',
    npmScript: 'evidence:submodule-reconciliation',
    evidenceFiles: ['submodule-merge-reconciliation.json'],
    schema: 'swissknife.submodule-merge-reconciliation-evidence.v1',
    taskId: 'SVD-116',
  },
];

export const INDEPENDENT_REPLAY_EVIDENCE_FILE = 'independent-all-app-release-replay.json';

/**
 * Absolute paths to every evidence file `producers` owns, resolved against
 * `evidenceRootDir`. Both arguments default to the real production manifest
 * and evidence root so existing callers do not need to change, but the
 * SVD-131 cold-start regression test overrides both with an isolated,
 * throwaway directory so it never touches (or races with) the real
 * `test-results/virtual-desktop-ipfs-mcp-orb` evidence root.
 */
export function producerEvidenceAbsolutePaths(
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRootDir = evidenceRoot,
) {
  const files = new Set();
  for (const gate of producers) {
    for (const file of gate.evidenceFiles ?? []) files.add(path.join(evidenceRootDir, file));
  }
  files.add(path.join(evidenceRootDir, INDEPENDENT_REPLAY_EVIDENCE_FILE));
  return [...files];
}

/** Absolute paths to every evidence directory (e.g. screenshot corpora) `producers` owns. */
export function producerEvidenceDirectories(
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRootDir = evidenceRoot,
) {
  const dirs = new Set();
  for (const gate of producers) {
    for (const dir of gate.evidenceDirs ?? []) dirs.add(path.join(evidenceRootDir, dir));
  }
  return [...dirs];
}

/**
 * Deletes every evidence file/directory this producer manifest owns if
 * present. This is the "cold start" guarantee: a candidate cannot pass by
 * coincidentally finding these gitignored receipts already sitting in the
 * working tree from a prior run -- they are removed before the producers run
 * again, so their presence afterward proves this invocation regenerated
 * them.
 *
 * Only files this manifest explicitly owns are ever touched; every other
 * evidence artifact (including git-tracked catalogues owned by earlier
 * SVD/SWR tasks) is left completely untouched.
 */
export function resetReleaseEvidenceProducers({
  log,
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRoot: evidenceRootDir = evidenceRoot,
  repoRoot: repoRootDir = repoRoot,
} = {}) {
  const cleared = [];
  for (const filePath of producerEvidenceAbsolutePaths(producers, evidenceRootDir)) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      cleared.push(path.relative(repoRootDir, filePath));
    }
  }
  for (const dirPath of producerEvidenceDirectories(producers, evidenceRootDir)) {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      cleared.push(`${path.relative(repoRootDir, dirPath)}/`);
    }
  }
  if (cleared.length > 0 && typeof log === 'function') log(cleared);
  return cleared;
}

/**
 * Checks whether `producer`'s declared evidence files/directories actually
 * exist under `evidenceRootDir` (non-empty for directories). This is the
 * "no stale/copy fallback" guarantee: it is called *after* a producer's
 * command reports success, independently of that exit code, so a producer
 * cannot pass by leaving a previously-existing receipt untouched (it was
 * already deleted by `resetReleaseEvidenceProducers`) or by exiting 0
 * without actually writing what it claims to produce.
 */
export function verifyProducerEvidence(producer, evidenceRootDir = evidenceRoot, repoRootDir = repoRoot) {
  const missingFiles = (producer.evidenceFiles ?? [])
    .map((file) => path.join(evidenceRootDir, file))
    .filter((filePath) => !fs.existsSync(filePath));
  const missingDirs = (producer.evidenceDirs ?? [])
    .map((dir) => path.join(evidenceRootDir, dir))
    .filter((dirPath) => !fs.existsSync(dirPath) || fs.readdirSync(dirPath).length === 0);
  return {
    ok: missingFiles.length === 0 && missingDirs.length === 0,
    missingFiles: missingFiles.map((filePath) => path.relative(repoRootDir, filePath)),
    missingDirs: missingDirs.map((dirPath) => path.relative(repoRootDir, dirPath)),
  };
}

/**
 * Runs a single producer gate: invokes `runProducer(producer)` (an
 * injectable command executor returning `{ ok, status, durationMs, tail }`,
 * the same shape `runNpmScript`/`runCommand` in `release-readiness-gate.mjs`
 * return) and then independently verifies the producer's declared evidence
 * now exists. Exported so both the real gate script and the hermetic
 * regression test exercise the exact same pass/fail semantics -- the test
 * cannot pass by re-implementing a looser check than production uses.
 */
export function runSingleProducerGate(
  producer,
  { runProducer, evidenceRoot: evidenceRootDir = evidenceRoot, repoRoot: repoRootDir = repoRoot } = {},
) {
  if (typeof runProducer !== 'function') {
    throw new Error('runSingleProducerGate requires a runProducer(producer) function');
  }
  const outcome = runProducer(producer);
  if (!outcome.ok) {
    return {
      ok: false,
      status: outcome.status ?? 1,
      durationMs: outcome.durationMs ?? 0,
      tail: outcome.tail ?? [],
      missingFiles: [],
      missingDirs: [],
    };
  }

  const verification = verifyProducerEvidence(producer, evidenceRootDir, repoRootDir);
  if (!verification.ok) {
    const detail = [
      ...verification.missingFiles.map((file) => `missing evidence file: ${file}`),
      ...verification.missingDirs.map((dir) => `missing or empty evidence directory: ${dir}`),
    ];
    return {
      ok: false,
      status: 1,
      durationMs: outcome.durationMs ?? 0,
      tail: [
        ...(outcome.tail ?? []),
        `${producer.id}: npm script "${producer.npmScript}" exited successfully but did not produce its declared evidence.`,
        'This is not permitted to fall back to a stale or previously-copied receipt.',
        ...detail,
      ],
      missingFiles: verification.missingFiles,
      missingDirs: verification.missingDirs,
    };
  }

  return {
    ok: true,
    status: 0,
    durationMs: outcome.durationMs ?? 0,
    tail: [],
    missingFiles: [],
    missingDirs: [],
  };
}

/**
 * Runs every producer gate, in manifest order, starting from a cold-start
 * reset of the evidence root. Stops at the first failed or dependency-blocked
 * gate, mirroring the real gate script's fail-fast behavior. This is the
 * single function that proves "one invocation produces every required
 * receipt starting from an empty evidence root": both the real orchestration
 * (via individual per-producer gate entries built with `runSingleProducerGate`
 * in `release-readiness-gate.mjs`) and the SVD-131 hermetic regression test
 * (via this batch entry point, with an isolated `evidenceRoot`/`repoRoot` and
 * a stub `runProducer`) exercise identical reset -> run -> verify wiring.
 */
export function runReleaseEvidenceProducers({
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRoot: evidenceRootDir = evidenceRoot,
  repoRoot: repoRootDir = repoRoot,
  runProducer,
  log,
} = {}) {
  const cleared = resetReleaseEvidenceProducers({
    producers,
    evidenceRoot: evidenceRootDir,
    repoRoot: repoRootDir,
    log,
  });

  const completed = new Set();
  const results = [];
  for (const producer of producers) {
    const unmetDependencies = (producer.dependsOn ?? []).filter((dependencyId) => !completed.has(dependencyId));
    if (unmetDependencies.length > 0) {
      results.push({
        id: producer.id,
        label: producer.label,
        ok: false,
        status: 'blocked',
        durationMs: 0,
        tail: [`${producer.id} is blocked: unmet dependencies ${unmetDependencies.join(', ')}`],
        missingFiles: [],
        missingDirs: [],
        unmetDependencies,
      });
      break;
    }

    const outcome = runSingleProducerGate(producer, { runProducer, evidenceRoot: evidenceRootDir, repoRoot: repoRootDir });
    results.push({ id: producer.id, label: producer.label, unmetDependencies: [], ...outcome });
    if (!outcome.ok) break;
    completed.add(producer.id);
  }

  return {
    ok: results.length === producers.length && results.every((result) => result.ok),
    cleared,
    results,
  };
}
