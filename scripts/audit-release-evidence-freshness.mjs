#!/usr/bin/env node
/**
 * SWR-029: Release evidence freshness gate.
 *
 * The release-readiness gate re-runs cheap, deterministic checks on every
 * candidate (services:audit, module-boundary audit, typecheck:browser,
 * test:browser-compat, build:web + bundle budget/host-leakage audit). It does
 * NOT re-run the expensive, real-browser Playwright evidence captured by
 * SWR-028 (`npm run test:e2e:libp2p-browser`) on every release candidate,
 * because that suite drives a real Chromium engine against a real Vite dev
 * server and is orders of magnitude slower than the rest of the gate.
 *
 * Instead, this script records a content fingerprint of the source files an
 * evidence artifact depends on at the moment the evidence was captured, and
 * on every subsequent release candidate recomputes that fingerprint and
 * compares it against the recorded one. If any dependency source changed
 * since the evidence was last captured, the evidence is "stale" and the
 * release candidate fails until the evidence is regenerated (see the
 * `--update` mode and the `evidence:libp2p-browser` / `bundle:audit:web`
 * npm scripts that call it). SWR-103 also tracks the generated virtual
 * desktop app matrix release evidence so the release gate cannot pass on a
 * stale desktop/backend/ORB catalog projection.
 *
 * This closes the SWR-029 acceptance gap: "stale browser/libp2p evidence"
 * must fail a release candidate, not just a missing/never-captured file.
 *
 * Usage:
 *   node scripts/audit-release-evidence-freshness.mjs [options]
 *
 * Options:
 *   --update <id|all>   Recompute and persist the fingerprint for one evidence
 *                        group (or all groups) instead of only checking it.
 *                        Use this immediately after regenerating the
 *                        corresponding evidence (e.g. after a Playwright run).
 *   --fail-on-stale      Exit non-zero when any evidence group is missing or
 *                        stale in the selected scope (default: on).
 *   --no-fail-on-stale    Record status without failing the process.
 *   --scope <active|all|id>
 *                        Select active release groups (default), every group,
 *                        or one evidence group for failure evaluation.
 *   --json <path>        Write a machine-readable freshness report.
 *   --report <path>      Write a human-readable Markdown freshness report.
 *   --help, -h            Show this help text.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

/**
 * Each entry describes one piece of release evidence that is expensive (or
 * impossible in a headless CI runner without extra setup) to regenerate on
 * every release candidate, the concrete artifact files that constitute the
 * evidence, the source files/directories the evidence is derived from, and
 * where the recorded fingerprint receipt is stored.
 */
const EVIDENCE_GROUPS = [
  {
    id: 'libp2p-browser-playwright',
    label: 'Browser libp2p interoperability evidence (SWR-138)',
    releaseBlocking: false,
    // Only `docs/browser-libp2p-evidence.md` is tracked in git (the raw
    // `test-results/libp2p-browser/*` Playwright output — screenshots,
    // traces, per-run JSON captures — is intentionally gitignored and
    // uploaded as a CI artifact instead, see `.gitignore` and the
    // `browser-libp2p-evidence-freshness` CI job). The fingerprint receipt
    // must therefore also live under `docs/` so it survives a fresh clone;
    // anchoring this gate on a gitignored path would make every fresh CI
    // checkout report "never-certified" even when nothing is actually stale.
    evidenceFiles: ['docs/browser-libp2p-evidence.md'],
    sourcePaths: [
      'src/services/mcp/libp2p-browser-runtime.ts',
      'src/services/mcp/mcp-p2p-session.ts',
      'src/services/mcp/mcp-discovery.ts',
      'test/e2e/libp2p-browser.spec.ts',
      'test/e2e/fixtures/libp2p-browser-harness',
      'test/e2e/fixtures/libp2p-browser-harness/relay-server.mjs',
      'build-tools/configs/playwright.libp2p-browser.config.ts',
      'build-tools/configs/vite.libp2p-browser-harness.config.ts',
    ],
    fingerprintFile: 'docs/browser-libp2p-evidence.fingerprint.json',
    regenerateHint: 'npm run evidence:libp2p-browser',
  },
  {
    id: 'browser-bundle-budget',
    label: 'Browser bundle budget evidence (SWR-016)',
    releaseBlocking: false,
    evidenceFiles: ['docs/browser-bundle-budget.md', 'docs/browser-bundle-budget.json'],
    sourcePaths: [
      'vite.web.config.ts',
      'scripts/audit-web-bundle.mjs',
      'src/module-ownership.json',
      'package.json',
    ],
    fingerprintFile: 'docs/browser-bundle-budget.fingerprint.json',
    regenerateHint: 'npm run build:web',
  },
  {
    id: 'module-boundary-audit',
    label: 'Module-boundary / service-boundary audit evidence (SWR-024)',
    releaseBlocking: false,
    evidenceFiles: ['docs/service-boundary-audit.json'],
    sourcePaths: ['src/module-ownership.json', 'scripts/audit-source-modules.mjs'],
    fingerprintFile: 'docs/service-boundary-audit.fingerprint.json',
    regenerateHint: 'npm run services:audit',
  },
  {
    id: 'virtual-desktop-release-evidence',
    label: 'Supervisor-managed virtual desktop all-app release evidence (SVD-066)',
    releaseBlocking: true,
    allowMissingSourceRoots: true,
    evidenceFiles: [
      'test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/all-tools-release-evidence.md',
      'docs/refactor-final-signoff.md',
      '../data/swissknife_virtual_desktop/discovery/all-tools-no-new-unknowns.md',
    ],
    sourcePaths: [
      'scripts/build-virtual-desktop-release-evidence.cjs',
      'scripts/build-agent-supervisor-expanded-io-release-inputs.ts',
      'scripts/audit-release-evidence-freshness.mjs',
      'test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-expanded-meta-io.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-tool-bindings.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-expanded-io-handoff.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/all-app-orb-idl-action-handoff.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/meta-glasses-device-simulator-validation.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-three-backend-runtime.json',
      'test/e2e/agent-supervisor-expanded-meta-io.spec.ts',
      'test/e2e/meta-glasses-expanded-io-simulator-validation.spec.ts',
      'test/mcp-plus-plus/agent-supervisor-expanded-io-handoff.test.ts',
      'test/mcp-plus-plus/all-app-orb-idl-action-handoff.test.ts',
      'src/services/apps/virtual-desktop-app-manifest.ts',
      'src/services/apps/all-app-live-tool-bindings.ts',
      'src/services/apps/agent-supervisor-expanded-io-envelopes.ts',
      'src/services/glasses/agent-supervisor-expanded-io-handoff.ts',
      'src/services/glasses/meta-glasses-expanded-io-simulator-validation.ts',
      'src/services/glasses/desktop-orb-idl-contract.ts',
      'src/services/mcp/agent-supervisor-console-gateway.ts',
      'web/js/apps/agent-supervisor.js',
    ],
    fingerprintFile: 'docs/virtual-desktop-release-evidence.fingerprint.json',
    regenerateHint: 'node scripts/build-virtual-desktop-release-evidence.cjs',
  },
];

const FINGERPRINT_SCHEMA = 'swr_029_evidence_freshness_receipt_v1';

function abs(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function rel(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function ensureParentDir(relativePath) {
  fs.mkdirSync(path.dirname(abs(relativePath)), { recursive: true });
}

function readJsonIfExists(relativePath) {
  const filePath = abs(relativePath);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Recursively collects file paths under a file or directory, deterministically sorted. */
function collectFiles(relativePath) {
  const target = abs(relativePath);
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [relativePath];

  const acc = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile()) {
        acc.push(rel(entryPath));
      }
    }
  };
  walk(target);
  return acc.sort();
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Computes a deterministic fingerprint over the resolved set of source files
 * for an evidence group: sha256 of each file's content, then a top-level
 * sha256 over the sorted `path:hash` pairs so file additions/removals and
 * content edits are both detected.
 */
function computeSourceFingerprint(sourcePaths) {
  const files = [];
  for (const sourcePath of sourcePaths) {
    const collected = collectFiles(sourcePath);
    if (collected.length === 0 && !fs.existsSync(abs(sourcePath))) {
      files.push(sourcePath);
      continue;
    }
    for (const filePath of collected) {
      files.push(filePath);
    }
  }
  const uniqueSortedFiles = Array.from(new Set(files)).sort();

  const perFile = uniqueSortedFiles.map((filePath) => {
    const fullPath = abs(filePath);
    const exists = fs.existsSync(fullPath);
    const hash = exists ? sha256(fs.readFileSync(fullPath)) : 'MISSING';
    return { path: filePath, sha256: hash, exists };
  });

  const combined = sha256(perFile.map((file) => `${file.path}:${file.sha256}`).join('\n'));

  return { combinedSha256: combined, files: perFile };
}

function loadFingerprintReceipt(fingerprintFile) {
  return readJsonIfExists(fingerprintFile);
}

function computeEvidenceHashes(evidenceFiles) {
  return Object.fromEntries(evidenceFiles.map((file) => [
    file,
    fs.existsSync(abs(file)) ? sha256(fs.readFileSync(abs(file))) : 'MISSING',
  ]));
}

function writeFingerprintReceipt(group, fingerprint, evidenceHashes) {
  ensureParentDir(group.fingerprintFile);
  const receipt = {
    schema: FINGERPRINT_SCHEMA,
    id: group.id,
    label: group.label,
    generatedAt: new Date().toISOString(),
    evidenceFiles: group.evidenceFiles,
    evidenceHashes,
    sourceFingerprint: fingerprint.combinedSha256,
    sourceFiles: fingerprint.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
  };
  fs.writeFileSync(abs(group.fingerprintFile), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}

function evaluateGroup(group, { update }) {
  const missingEvidenceFiles = group.evidenceFiles.filter((file) => !fs.existsSync(abs(file)));
  const currentEvidenceHashes = computeEvidenceHashes(group.evidenceFiles);
  const currentFingerprint = computeSourceFingerprint(group.sourcePaths);
  const missingSourceFiles = currentFingerprint.files.filter((file) => !file.exists).map((file) => file.path);

  if (update) {
    const receipt = writeFingerprintReceipt(group, currentFingerprint, currentEvidenceHashes);
    return {
      id: group.id,
      label: group.label,
      status: missingEvidenceFiles.length > 0
        ? 'missing-evidence'
        : missingSourceFiles.length > 0 && !group.allowMissingSourceRoots
          ? 'missing-source'
          : 'fresh',
      updated: true,
      releaseBlocking: group.releaseBlocking !== false,
      missingEvidenceFiles,
      missingSourceFiles,
      recordedEvidenceHashes: receipt.evidenceHashes,
      currentEvidenceHashes,
      recordedFingerprint: receipt.sourceFingerprint,
      currentFingerprint: currentFingerprint.combinedSha256,
      recordedAt: receipt.generatedAt,
      regenerateHint: group.regenerateHint,
    };
  }

  const previousReceipt = loadFingerprintReceipt(group.fingerprintFile);
  const validPreviousReceipt = previousReceipt
    && previousReceipt.schema === FINGERPRINT_SCHEMA
    && previousReceipt.id === group.id
    && typeof previousReceipt.sourceFingerprint === 'string'
    && previousReceipt.evidenceHashes
    && typeof previousReceipt.evidenceHashes === 'object';
  const evidenceHashesMatch = validPreviousReceipt
    && JSON.stringify(previousReceipt.evidenceHashes) === JSON.stringify(currentEvidenceHashes);

  let status;
  if (missingEvidenceFiles.length > 0) {
    status = 'missing-evidence';
  } else if (missingSourceFiles.length > 0 && !group.allowMissingSourceRoots) {
    status = 'missing-source';
  } else if (previousReceipt && !validPreviousReceipt) {
    status = 'invalid-receipt';
  } else if (!previousReceipt) {
    status = 'never-certified';
  } else if (!evidenceHashesMatch) {
    status = 'evidence-modified';
  } else if (previousReceipt.sourceFingerprint !== currentFingerprint.combinedSha256) {
    status = 'stale';
  } else {
    status = 'fresh';
  }

  return {
    id: group.id,
    label: group.label,
    status,
    updated: false,
    releaseBlocking: group.releaseBlocking !== false,
    missingEvidenceFiles,
    missingSourceFiles,
    recordedEvidenceHashes: previousReceipt?.evidenceHashes ?? null,
    currentEvidenceHashes,
    recordedFingerprint: previousReceipt?.sourceFingerprint ?? null,
    currentFingerprint: currentFingerprint.combinedSha256,
    recordedAt: previousReceipt?.generatedAt ?? null,
    regenerateHint: group.regenerateHint,
  };
}

function parseArgs(argv) {
  const args = {
    update: null,
    scope: 'active',
    failOnStale: true,
    json: null,
    report: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--update') {
      args.update = argv[++i];
      if (!args.update) throw new Error('--update requires an evidence group id or "all"');
    } else if (arg === '--fail-on-stale') {
      args.failOnStale = true;
    } else if (arg === '--no-fail-on-stale') {
      args.failOnStale = false;
    } else if (arg === '--scope') {
      args.scope = argv[++i];
      if (!args.scope) throw new Error('--scope requires "active", "all", or an evidence group id');
    } else if (arg === '--json') {
      args.json = argv[++i];
      if (!args.json) throw new Error('--json requires a path');
    } else if (arg === '--report') {
      args.report = argv[++i];
      if (!args.report) throw new Error('--report requires a path');
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    'Usage: node scripts/audit-release-evidence-freshness.mjs [options]',
    '',
    'Options:',
    '  --update <id|all>     Recompute and persist the fingerprint receipt for one',
    '                        evidence group (or all groups) instead of only checking it.',
    '  --fail-on-stale       Exit non-zero when evidence is missing/stale (default).',
    '  --no-fail-on-stale    Record status without failing the process.',
    '  --scope <active|all|id>',
    '                        Evaluate active release groups (default), all groups,',
    '                        or one group when deciding the exit status.',
    '  --json <path>         Write a machine-readable freshness report.',
    '  --report <path>       Write a human-readable Markdown freshness report.',
    '  --help, -h            Show this help text.',
    '',
    'Evidence groups:',
    ...EVIDENCE_GROUPS.map((group) => `  - ${group.id}: ${group.label}`),
  ].join('\n');
}

function renderMarkdown(results) {
  const rows = results.map((result) => {
    const icon = { fresh: '✅', stale: '❌', 'evidence-modified': '❌', 'missing-evidence': '❌', 'missing-source': '❌', 'invalid-receipt': '❌', 'never-certified': '⚠️' }[result.status];
    return `| ${result.label} | ${result.releaseBlocking ? 'active' : 'historical'} | ${icon} ${result.status} | ${result.recordedAt ?? 'never'} | ${result.regenerateHint} |`;
  });

  return [
    '# Release Evidence Freshness Report',
    '',
    'Generated by `scripts/audit-release-evidence-freshness.mjs` (SWR-029). Tracks',
    'whether expensive, non-re-run-every-time browser/libp2p evidence (Playwright',
    'runs, bundle budget snapshots, module-boundary audit snapshots) and the',
    'virtual-desktop app matrix release evidence are still derived from the',
    'current state of the source they depend on. Historical SWR groups remain',
    'visible and can be checked or updated explicitly; the SVD-066 aggregate',
    'is the active default release-blocking group for the SVD-066 supervisor-managed closeout.',
    '',
    '| Evidence | Default scope | Status | Last certified | Regenerate with |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    ...results
      .filter((result) => result.status !== 'fresh')
      .flatMap((result) => [
        `## ${result.label}`,
        '',
        `- Status: **${result.status}**`,
        result.missingEvidenceFiles.length > 0
          ? `- Missing evidence file(s): ${result.missingEvidenceFiles.join(', ')}`
          : `- Recorded fingerprint: \`${result.recordedFingerprint ?? 'none'}\``,
        result.missingEvidenceFiles.length > 0 ? '' : `- Current fingerprint: \`${result.currentFingerprint}\``,
        `- Regenerate with: \`${result.regenerateHint}\``,
        '',
      ]),
  ].join('\n');
}

function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }

  const groupsToUpdate = new Set();
  if (args.update === 'all') {
    for (const group of EVIDENCE_GROUPS) groupsToUpdate.add(group.id);
  } else if (args.update) {
    if (!EVIDENCE_GROUPS.some((group) => group.id === args.update)) {
      throw new Error(
        `Unknown evidence group "${args.update}". Known groups: ${EVIDENCE_GROUPS.map((group) => group.id).join(', ')}`,
      );
    }
    groupsToUpdate.add(args.update);
  }

  if (args.scope !== 'active' && args.scope !== 'all'
    && !EVIDENCE_GROUPS.some((group) => group.id === args.scope)) {
    throw new Error(`Unknown --scope "${args.scope}". Use active, all, or one of: ${EVIDENCE_GROUPS.map((group) => group.id).join(', ')}`);
  }

  // Scope controls which groups can cause a non-zero exit code. Certifying a
  // single evidence group (`--update <id>`) is meant to be run as a narrow
  // step embedded in that group's own regeneration command (e.g.
  // `services:audit` re-certifying `module-boundary-audit`); it must not fail
  // that unrelated command just because some *other* group's evidence is
  // stale. `--update all` considers every group. The default check-only mode
  // fails on active release-blocking groups; superseded historical groups
  // remain visible in the report and can still be selected explicitly.
  const scope = args.update === 'all' || (!args.update && args.scope === 'all')
    ? new Set(EVIDENCE_GROUPS.map((group) => group.id))
    : args.update
      ? new Set([args.update])
      : args.scope !== 'active'
        ? new Set([args.scope])
        : new Set(EVIDENCE_GROUPS.filter((group) => group.releaseBlocking !== false).map((group) => group.id));

  const results = EVIDENCE_GROUPS.map((group) =>
    evaluateGroup(group, { update: groupsToUpdate.has(group.id) }),
  );

  if (args.json) {
    ensureParentDir(args.json);
    fs.writeFileSync(
      abs(args.json),
      `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
      'utf8',
    );
  }

  if (args.report) {
    ensureParentDir(args.report);
    fs.writeFileSync(abs(args.report), `${renderMarkdown(results)}\n`, 'utf8');
  }

  console.log('Release evidence freshness:');
  for (const result of results) {
    console.log(
      `  - ${result.label}: ${result.status}${result.updated ? ' (fingerprint updated)' : ''}${result.releaseBlocking ? '' : ' (historical; non-blocking in active scope)'}`,
    );
    if (result.missingEvidenceFiles.length > 0) {
      console.log(`      missing evidence file(s): ${result.missingEvidenceFiles.join(', ')}`);
    }
    if (result.missingSourceFiles.length > 0) {
      console.log(`      warning: missing source file(s): ${result.missingSourceFiles.join(', ')}`);
    }
  }

  const failing = results.filter(
    (result) =>
      scope.has(result.id) &&
      ['stale', 'evidence-modified', 'missing-evidence', 'missing-source', 'invalid-receipt', 'never-certified'].includes(result.status),
  );
  if (failing.length > 0 && args.failOnStale) {
    console.error('');
    for (const result of failing) {
      console.error(
        `FAIL: ${result.label} is ${result.status}. Regenerate with \`${result.regenerateHint}\` then re-run with --update ${result.id}.`,
      );
    }
    return 1;
  }

  return 0;
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
