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
    id: 'release-baseline-catalogs',
    label: 'Current peer, executable binding, disposition, and gap catalogues (SVD-100/SVD-102/SVD-104/SVD-105)',
    npmScript: 'evidence:release-baseline',
    evidenceFiles: [
      'swissknife-all-tools-peer-evidence.json',
      'all-app-live-tool-bindings.json',
      'all-tools-disposition-catalog.json',
      'all-app-live-binding-gap-ledger.json',
    ],
    schema: 'swissknife.all-app-live-binding-gap-ledger.v1',
    taskId: 'SVD-102',
  },
  {
    id: 'application-live-behavior-proof',
    label: 'Current real application behavior proof (SVD-106)',
    npmScript: 'evidence:live-behavior-proof',
    evidenceFiles: ['all-app-live-behavior-proof.json'],
    evidenceDirs: ['app-screenshots/live-behavior-proof'],
    schema: 'swissknife.all-app-live-behavior-proof.v1',
    taskId: 'SVD-106',
    dependsOn: ['release-baseline-catalogs'],
  },
  {
    id: 'application-gateway-evidence',
    label: 'Application-originated browser gateway calls (SVD-126)',
    npmScript: 'evidence:live-gateway',
    evidenceFiles: ['all-app-live-gateway-executions.json'],
    dependsOn: ['release-baseline-catalogs'],
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
    id: 'all-app-improvement-release-evidence',
    label: 'All-app primary workflow, UI/UX, K/D/A, and live MCP++ evidence (SVD-133/SVD-180/SVD-181)',
    npmScript: 'evidence:app-improvement-release',
    evidenceFiles: [
      'app-improvement/index.json',
      'app-improvement/screenshot-index.json',
      'app-improvement/ui-ux-accessibility.json',
      'app-improvement/all-app-tool-matrix.json',
      'app-improvement/http-libp2p-kda-receipt-catalog.json',
    ],
    evidenceDirs: ['app-improvement/screenshots'],
    dependsOn: ['release-baseline-catalogs', 'application-gateway-evidence', 'meta-device-simulator-replay'],
    schema: 'swissknife.virtual-desktop-all-app-improvement.v1',
    taskId: 'SVD-182',
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
 * SWR-160 / release-readiness surface ownership: every executable entrypoint
 * that participates in the release-readiness producer boundary must appear
 * here exactly once. `scripts/audit-source-modules.mjs` and
 * `docs/release-readiness-ownership.md` treat this export as the source of
 * truth for ownership classification.
 */
// Plain array literal required: scripts/audit-source-modules.mjs parses this
// export statically via `export const NAME = [ ... ]` (no Object.freeze wrap).
export const RELEASE_READINESS_ENTRYPOINT_OWNERSHIP = [
  {
    path: 'scripts/lib/release-readiness-evidence-producers.mjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'Authoritative producer manifest for ownership, dependencies, artifact paths, default enablement, and evidence verification. No second executable producer list is permitted.',
  },
  {
    path: 'scripts/release-readiness-gate.mjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'Production gate imports the manifest, cold-resets only manifest-owned artifacts, enforces dependencies, runs each default-enabled producer, and reports missing or invalid producer evidence.',
  },
  {
    path: 'scripts/lib/release-reproduction-attestation.mjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'SWR-141 provenance helper that captures clean-checkout reproduction, source/evidence fingerprints, tool versions, and GO/NO_GO blockers.',
  },
  {
    path: 'scripts/capture-refactor-main-reconciliation.cjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'SWR-162 merge receipt producer. Records accepted integration ranges and preserves rejected stale refs without merging them wholesale.',
  },
  {
    path: 'scripts/lib/pick-free-port.mjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'Endpoint lease helper. Proves this process can bind a candidate port and returns explicit lease ownership metadata; never reuses or kills a foreign listener.',
  },
  {
    path: 'scripts/run-with-owned-port.mjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'Wrapper exports the leased port to one child command. If the preferred port is occupied, the foreign listener is left untouched and a private verified-free port is used.',
  },
  {
    path: 'build-tools/configs/playwright.live-behavior-proof.config.ts',
    owner: 'release-readiness',
    runtime: 'browser-playwright',
    auditDecision: 'Dedicated current-behavior proof config. The spec owns its in-process fixture on an ephemeral port and writes real browser evidence and screenshots.',
  },
  {
    path: 'build-tools/configs/playwright.live-gateway.config.ts',
    owner: 'release-readiness',
    runtime: 'browser-playwright',
    auditDecision: 'Dedicated application-originated gateway config. Uses reuseExistingServer: false, a strict leased port, and never attaches to an existing foreign dev server.',
  },
  {
    path: 'test/architecture/release-readiness-hermetic.test.ts',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'Hermetic regression coverage imports the production manifest and owned-port helper instead of a task-local producer list.',
  },
];

/**
 * Validate producer + ownership manifests for internal consistency.
 * Returns an array of human-readable violation strings (empty when valid).
 */
export function validateReleaseReadinessManifest({
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  ownership = RELEASE_READINESS_ENTRYPOINT_OWNERSHIP,
  requiredEntrypoints = RELEASE_READINESS_ENTRYPOINT_OWNERSHIP.map((entry) => entry.path),
} = {}) {
  const violations = [];
  const ownershipPaths = new Set();

  for (const entry of ownership) {
    if (!entry?.path) {
      violations.push('ownership record is missing path');
      continue;
    }
    if (ownershipPaths.has(entry.path)) {
      violations.push(`duplicate ownership path: ${entry.path}`);
    }
    ownershipPaths.add(entry.path);
    if (entry.owner !== 'release-readiness') {
      violations.push(`ownership owner for ${entry.path} must be release-readiness`);
    }
    if (!entry.runtime || typeof entry.runtime !== 'string') {
      violations.push(`ownership runtime missing for ${entry.path}`);
    }
    if (!entry.auditDecision || !String(entry.auditDecision).trim()) {
      violations.push(`ownership auditDecision missing for ${entry.path}`);
    }
  }

  for (const required of requiredEntrypoints) {
    if (!ownershipPaths.has(required)) {
      violations.push(`required entrypoint missing from ownership export: ${required}`);
    }
  }

  const ids = new Set();
  const claimedFiles = new Map();
  for (const producer of producers) {
    if (!producer?.id) {
      violations.push('producer is missing id');
      continue;
    }
    if (ids.has(producer.id)) {
      violations.push(`duplicate producer id: ${producer.id}`);
    }
    ids.add(producer.id);

    for (const file of producer.evidenceFiles ?? []) {
      if (claimedFiles.has(file)) {
        violations.push(
          `duplicate evidence file ownership: ${file} claimed by ${claimedFiles.get(file)} and ${producer.id}`,
        );
      } else {
        claimedFiles.set(file, producer.id);
      }
    }

    for (const dep of producer.dependsOn ?? []) {
      if (!ids.has(dep) && !producers.some((item) => item.id === dep)) {
        // Dependency may appear later in the list; final pass below.
      }
    }
  }

  for (const producer of producers) {
    for (const dep of producer.dependsOn ?? []) {
      if (!ids.has(dep)) {
        violations.push(`producer ${producer.id} depends on unknown producer ${dep}`);
        continue;
      }
      const producerIndex = producers.findIndex((item) => item.id === producer.id);
      const depIndex = producers.findIndex((item) => item.id === dep);
      if (depIndex > producerIndex) {
        violations.push(
          `producer ${producer.id} depends on ${dep} which is declared later in the manifest order`,
        );
      }
    }
  }

  return violations;
}

/**
 * Expand the producer manifest into gate entries for `release-readiness-gate.mjs`.
 * This is the only supported release-gate producer expansion boundary.
 *
 * `runProducer(producer)` must return `{ ok, status, durationMs, tail }` the
 * same shape `runSingleProducerGate` expects.
 */
export function createReleaseEvidenceProducerGateEntries({
  runProducer,
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRoot: evidenceRootDir = evidenceRoot,
  repoRoot: repoRootDir = repoRoot,
} = {}) {
  if (typeof runProducer !== 'function') {
    throw new Error('createReleaseEvidenceProducerGateEntries requires runProducer(producer)');
  }

  return producers.map((producer) => ({
    id: producer.id,
    label: producer.label,
    defaultEnabled: producer.defaultEnabled !== false,
    run: () =>
      runSingleProducerGate(producer, {
        runProducer: () => runProducer(producer),
        evidenceRoot: evidenceRootDir,
        repoRoot: repoRootDir,
      }),
  }));
}

/**
 * Absolute paths for every evidence artifact the release-readiness surface owns
 * (producer evidence + independent replay receipt).
 */
export function releaseReadinessEvidenceAbsolutePaths(
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRootDir = evidenceRoot,
) {
  return producerEvidenceAbsolutePaths(producers, evidenceRootDir);
}

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
