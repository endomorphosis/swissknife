import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const RELEASE_REPRODUCTION_ATTESTATION_JSON = 'docs/release-reproduction-attestation.json';
export const RELEASE_REPRODUCTION_ATTESTATION_MD = 'docs/release-reproduction-attestation.md';
export const RELEASE_REPRODUCTION_SCHEMA = 'swissknife.release-reproduction-attestation.v1';

const EXPECTED_OUTPUTS = [
  RELEASE_REPRODUCTION_ATTESTATION_JSON,
  RELEASE_REPRODUCTION_ATTESTATION_MD,
  'docs/release-readiness-report.json',
  'docs/release-evidence-freshness.json',
];

const RELEASE_COMMANDS = [
  'npm ci',
  'npm run release:readiness',
];

const REQUIRED_BROWSER_PROJECTS = ['chromium', 'firefox', 'webkit'];
const CLEAN_REPRODUCTION_CHILD_ENV = 'SWISSKNIFE_RELEASE_REPRODUCTION_CHILD';
const CLEAN_REPRODUCTION_KEEP_ENV = 'SWISSKNIFE_KEEP_RELEASE_REPRODUCTION';
const CLEAN_REPRODUCTION_PARENT_HEAD_ENV = 'SWISSKNIFE_RELEASE_PARENT_HEAD';
const CLEAN_REPRODUCTION_PARENT_GITLINK_ENV = 'SWISSKNIFE_RELEASE_PARENT_GITLINK_SHA';
const CLEAN_REPRODUCTION_PARENT_STATUS_ENV = 'SWISSKNIFE_RELEASE_PARENT_STATUS_JSON';
const RELEASE_BRANCH_PATTERN = /^(main|automation\/swissknife-refactor-integration|implementation\/swr-162(?:-|$).*)$/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(absolutePath) {
  return fs.existsSync(absolutePath) ? sha256(fs.readFileSync(absolutePath)) : 'MISSING';
}

function writeFileIfChanged(absolutePath, contents) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  if (fs.existsSync(absolutePath) && fs.readFileSync(absolutePath, 'utf8') === contents) return;
  fs.writeFileSync(absolutePath, contents, 'utf8');
}

function readJsonIfExists(absolutePath) {
  if (!fs.existsSync(absolutePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch {
    return null;
  }
}

function tailLines(text, limit = 80) {
  return String(text ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(-limit);
}

function run(command, args, cwd, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: options.env ?? process.env,
  });
  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal ?? null,
    duration_ms: Date.now() - started,
    stdout,
    stderr,
    tail: tailLines(`${stdout}\n${stderr}`),
    error: result.error ? String(result.error.message ?? result.error) : null,
  };
}

function git(cwd, args) {
  return run('git', args, cwd);
}

function packageVersion(repoRoot, packageName) {
  const packageJson = readJsonIfExists(path.join(repoRoot, 'node_modules', packageName, 'package.json'));
  return packageJson?.version ?? null;
}

function binaryVersion(repoRoot, command, args) {
  const result = run(command, args, repoRoot);
  if (!result.ok) return null;
  return result.stdout.split('\n').find((line) => line.trim())?.trim() ?? null;
}

export function capturePreRunGitState(repoRoot) {
  const parentRoot = path.resolve(repoRoot, '..');
  const swissknifeHead = git(repoRoot, ['rev-parse', 'HEAD']).stdout || null;
  const swissknifeBranch = git(repoRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const swissknifeStatus = git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  const parentHeadResult = git(parentRoot, ['rev-parse', 'HEAD']);
  const parentHeadGitlinkRowResult = git(parentRoot, ['ls-tree', 'HEAD', 'swissknife']);
  const parentIndexGitlinkRowResult = git(parentRoot, ['ls-files', '-s', 'swissknife']);
  const parentStatusResult = git(parentRoot, ['status', '--porcelain=v1', '--', 'swissknife']);
  const parentHead = parentHeadResult.stdout || process.env[CLEAN_REPRODUCTION_PARENT_HEAD_ENV] || null;
  const parentHeadGitlinkRow = parentHeadGitlinkRowResult.stdout || '';
  const parentIndexGitlinkRow = parentIndexGitlinkRowResult.stdout || '';
  const parentHeadGitlinkSha = parentHeadGitlinkRow.match(/\bcommit\s+([0-9a-f]{40})\b/)?.[1] ?? null;
  const parentIndexGitlinkSha = parentIndexGitlinkRow.match(/^160000\s+([0-9a-f]{40})\s+\d+\s+swissknife$/)?.[1] ?? null;
  const parentEnvGitlinkSha = process.env[CLEAN_REPRODUCTION_PARENT_GITLINK_ENV] || null;
  const parentGitlinkSha = parentIndexGitlinkSha ?? parentHeadGitlinkSha ?? parentEnvGitlinkSha;
  const parentGitlinkSource = parentIndexGitlinkSha
    ? 'index'
    : parentHeadGitlinkSha
      ? 'HEAD'
      : parentEnvGitlinkSha
        ? 'environment'
        : null;
  let parentStatusEntries = parentStatusResult.stdout ? parentStatusResult.stdout.split('\n').filter(Boolean) : [];
  if (parentStatusEntries.length === 0 && process.env[CLEAN_REPRODUCTION_PARENT_STATUS_ENV]) {
    try {
      const parsed = JSON.parse(process.env[CLEAN_REPRODUCTION_PARENT_STATUS_ENV]);
      parentStatusEntries = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      parentStatusEntries = [];
    }
  }

  return {
    captured_at: new Date().toISOString(),
    swissknife_head: swissknifeHead,
    swissknife_branch: swissknifeBranch.ok ? swissknifeBranch.stdout : null,
    swissknife_detached: !swissknifeBranch.ok,
    swissknife_status_entries: swissknifeStatus.stdout ? swissknifeStatus.stdout.split('\n').filter(Boolean) : [],
    parent_head: parentHead,
    parent_gitlink_sha: parentGitlinkSha,
    parent_gitlink_source: parentGitlinkSource,
    parent_head_gitlink_sha: parentHeadGitlinkSha,
    parent_index_gitlink_sha: parentIndexGitlinkSha,
    parent_gitlink_matches_head: Boolean(parentGitlinkSha && swissknifeHead && parentGitlinkSha === swissknifeHead),
    parent_status_entries: parentStatusEntries,
  };
}

function trackedTreeFingerprint(repoRoot) {
  const tree = git(repoRoot, ['rev-parse', 'HEAD^{tree}']).stdout || null;
  const filesResult = git(repoRoot, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']);
  if (!filesResult.ok) {
    return { git_tree_sha: tree, tracked_file_count: null, tracked_content_sha256: null };
  }
  const entries = filesResult.stdout
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(\d+)\s+(\S+)\s+([0-9a-f]{40,64})\t(.+)$/);
      return match
        ? { mode: match[1], type: match[2], object: match[3], path: match[4] }
        : { mode: null, type: null, object: 'UNPARSEABLE', path: entry };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const rows = entries.map((entry) => `${entry.path}:${entry.mode}:${entry.type}:${entry.object}`);
  return {
    git_tree_sha: tree,
    tracked_file_count: entries.length,
    tracked_content_sha256: sha256(rows.join('\n')),
  };
}

function outputHashes(repoRoot, extraOutputs = []) {
  const outputs = Array.from(new Set([...EXPECTED_OUTPUTS, ...extraOutputs])).sort();
  return Object.fromEntries(outputs.map((file) => [
    file,
    {
      sha256: sha256File(path.join(repoRoot, file)),
      exists: fs.existsSync(path.join(repoRoot, file)),
    },
  ]));
}

function canonicalPayloadForHash(attestation, jsonPath = RELEASE_REPRODUCTION_ATTESTATION_JSON) {
  const output_hashes = { ...(attestation.output_hashes ?? {}) };
  if (output_hashes[jsonPath]) {
    output_hashes[jsonPath] = {
      ...output_hashes[jsonPath],
      sha256: null,
      hash_kind: 'canonical-json-payload-with-self-hash-null',
    };
  }
  return {
    ...attestation,
    canonical_payload_sha256: null,
    output_hashes,
  };
}

function canonicalAttestationHash(attestation, jsonPath = RELEASE_REPRODUCTION_ATTESTATION_JSON) {
  return sha256(JSON.stringify(canonicalPayloadForHash(attestation, jsonPath)));
}

function releaseEvidenceSummary(repoRoot) {
  const releaseEvidencePath = path.join(repoRoot, 'test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json');
  const releaseEvidence = readJsonIfExists(releaseEvidencePath);
  const artifacts = releaseEvidence?.artifacts && typeof releaseEvidence.artifacts === 'object'
    ? Object.fromEntries(Object.entries(releaseEvidence.artifacts).map(([id, artifact]) => [
        id,
        {
          task_id: artifact?.task_id ?? null,
          path: artifact?.path ?? null,
          status: artifact?.status ?? null,
          freshness: artifact?.freshness ?? null,
          sha256: artifact?.sha256 ?? null,
        },
      ]))
    : {};

  return {
    path: 'test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json',
    schema: releaseEvidence?.schema ?? null,
    task_id: releaseEvidence?.task_id ?? null,
    generated_at: releaseEvidence?.generated_at ?? null,
    decision: releaseEvidence?.decision?.status ?? null,
    blocker_count: releaseEvidence?.decision?.blocker_count ?? null,
    artifacts,
  };
}

function freshnessSummary(repoRoot) {
  const freshness = readJsonIfExists(path.join(repoRoot, 'docs/release-evidence-freshness.json'));
  const results = Array.isArray(freshness?.results) ? freshness.results : [];
  return {
    path: 'docs/release-evidence-freshness.json',
    generated_at: freshness?.generatedAt ?? null,
    results: results.map((result) => ({
      id: result.id,
      status: result.status,
      release_blocking: result.releaseBlocking !== false,
      recorded_fingerprint: result.recordedFingerprint ?? null,
      current_fingerprint: result.currentFingerprint ?? null,
      recorded_evidence_hashes: result.recordedEvidenceHashes ?? null,
      current_evidence_hashes: result.currentEvidenceHashes ?? null,
    })),
  };
}

function libp2pTransportReceipts(repoRoot) {
  const profilePath = 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-mcpplusplus-profile-interoperability.json';
  const profile = readJsonIfExists(path.join(repoRoot, profilePath));
  const desktopPaths = Array.isArray(profile?.desktop_paths) ? profile.desktop_paths : [];
  const receipts = desktopPaths.map((entry) => ({
    path_id: entry.path_id ?? null,
    app_id: entry.app_id ?? null,
    owner: entry.owner ?? null,
    operation: entry.operation ?? null,
    parity_verified: entry.transports?.parity_verified ?? null,
    http: receiptView(entry.transports?.http),
    libp2p: receiptView(entry.transports?.libp2p),
  }));

  return {
    browser_interop_contract: {
      path: 'docs/browser-libp2p-evidence.md',
      fingerprint_path: 'docs/browser-libp2p-evidence.fingerprint.json',
      evidence_sha256: sha256File(path.join(repoRoot, 'docs/browser-libp2p-evidence.md')),
    },
    profile_interoperability: {
      path: profilePath,
      schema: profile?.schema ?? null,
      task_id: profile?.task_id ?? null,
      generated_at: profile?.generated_at ?? null,
      decision: profile?.decision ?? null,
      live_network_claimed: profile?.live_network_claimed ?? null,
      profile_count: Array.isArray(profile?.profiles) ? profile.profiles.length : 0,
      desktop_path_count: receipts.length,
      receipts,
    },
  };
}

function receiptView(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  return {
    transport: receipt.transport ?? null,
    application_originated: receipt.application_originated ?? null,
    selected_tool_id: receipt.selected_tool_id ?? null,
    correlation_id: receipt.correlation_id ?? null,
    descriptor_cid: receipt.descriptor_cid ?? null,
    receipt_cid: receipt.receipt_cid ?? null,
    event_cid: receipt.event_cid ?? null,
    ucan_did_verified: receipt.ucan_did_verified ?? null,
    remote_did: receipt.remote_did ?? null,
    identity_proof_cid: receipt.identity_proof_cid ?? null,
    policy_outcome: receipt.policy_outcome ?? null,
    persistence_verified: receipt.persistence_verified ?? null,
  };
}

function proofReceipts(repoRoot) {
  const contractPath = 'docs/browser-proof-runtime-evidence.json';
  const observedPath = 'test-results/browser-proof-runtime/observed-three-engine-runtime.json';
  const contract = readJsonIfExists(path.join(repoRoot, contractPath));
  const observed = readJsonIfExists(path.join(repoRoot, observedPath));
  return {
    contract: {
      path: contractPath,
      sha256: sha256File(path.join(repoRoot, contractPath)),
      schema: contract?.schema ?? null,
      task_id: contract?.task_id ?? null,
      required_engines: contract?.required_engines ?? [],
      theorem_runtime: {
        default_backend: contract?.theorem_runtime?.default_backend?.id ?? null,
        fixture_id: contract?.theorem_runtime?.fixture?.id ?? null,
      },
      zkp_runtime: {
        default_backend: contract?.zkp_runtime?.default_backend?.id ?? null,
        proof_system: contract?.zkp_runtime?.default_backend?.proof_system ?? null,
        wasm_helper_sha256: contract?.zkp_runtime?.default_backend?.wasm_helper_sha256 ?? null,
        fixture_id: contract?.zkp_runtime?.deterministic_proof_fixture?.id ?? null,
      },
    },
    observed_execution: {
      path: observedPath,
      sha256: sha256File(path.join(repoRoot, observedPath)),
      schema: observed?.schema ?? null,
      command: observed?.command ?? null,
      outcome: observed?.outcome ?? null,
      generated_at: observed?.generated_at ?? null,
      assertion_count: observed?.assertion_count ?? null,
      assertions_per_engine: observed?.assertions_per_engine ?? null,
      engines: observed?.engines ?? [],
      source_fingerprints: observed?.source_fingerprints ?? null,
    },
  };
}

function toolVersions(repoRoot) {
  return {
    node: process.version,
    npm: binaryVersion(repoRoot, 'npm', ['--version']),
    git: binaryVersion(repoRoot, 'git', ['--version']),
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    package_versions: {
      '@playwright/test': packageVersion(repoRoot, '@playwright/test'),
      '@vitest/browser': packageVersion(repoRoot, '@vitest/browser'),
      'vitest': packageVersion(repoRoot, 'vitest'),
      'vite': packageVersion(repoRoot, 'vite'),
      'typescript': packageVersion(repoRoot, 'typescript'),
      'libp2p': packageVersion(repoRoot, 'libp2p'),
    },
  };
}

function browserProjects() {
  return {
    libp2p_playwright: {
      config: 'build-tools/configs/playwright.libp2p-browser.config.ts',
      projects: REQUIRED_BROWSER_PROJECTS,
    },
    browser_proof_runtime: {
      config: 'build-tools/configs/vitest.browser-proof-runtime.config.ts',
      provider: 'playwright',
      instances: REQUIRED_BROWSER_PROJECTS,
    },
  };
}

function isGoDecision(value) {
  return typeof value === 'string' && value.toUpperCase() === 'GO';
}

function releaseCheckoutPolicy(preRunGitState) {
  if (preRunGitState?.swissknife_detached === true) {
    return {
      accepted: true,
      mode: 'detached',
      reason: 'detached checkout is accepted for clean release reproduction',
    };
  }

  const branch = preRunGitState?.swissknife_branch ?? null;
  const accepted = typeof branch === 'string' && RELEASE_BRANCH_PATTERN.test(branch);
  return {
    accepted,
    mode: accepted ? 'attached-release-branch' : 'attached-non-release-branch',
    reason: accepted
      ? `attached release branch ${branch} is accepted for SWR-162 mainline integration validation`
      : `attached branch ${branch ?? 'unknown'} is not an approved release integration branch`,
  };
}

function noGoFindings({
  preRunGitState,
  freshness,
  releaseReadinessReport,
  releaseEvidence,
  cleanCheckoutReproduction,
}) {
  const findings = [];
  const checkoutPolicy = releaseCheckoutPolicy(preRunGitState);

  if (!checkoutPolicy.accepted) {
    findings.push({
      id: 'not-detached-checkout',
      severity: 'blocking',
      message: 'release reproduction must run from a detached checkout or an approved release integration branch',
      detail: checkoutPolicy.reason,
    });
  }

  if ((preRunGitState?.swissknife_status_entries ?? []).length > 0) {
    findings.push({
      id: 'local-uncommitted-files',
      severity: 'blocking',
      message: 'SwissKnife worktree had local uncommitted files before release evidence generation',
      detail: (preRunGitState.swissknife_status_entries ?? []).slice(0, 50).join(' | '),
    });
  }

  if (!preRunGitState?.parent_gitlink_matches_head) {
    findings.push({
      id: 'parent-gitlink-mismatch',
      severity: 'blocking',
      message: 'parent repository gitlink does not match the SwissKnife source revision',
      detail: `parent_gitlink=${preRunGitState?.parent_gitlink_sha ?? 'missing'}; swissknife_head=${preRunGitState?.swissknife_head ?? 'missing'}`,
    });
  }

  const freshnessFailures = (freshness.results ?? []).filter((result) =>
    result.release_blocking && result.status !== 'fresh',
  );
  if (freshnessFailures.length > 0) {
    findings.push({
      id: 'stale-release-evidence',
      severity: 'blocking',
      message: 'release-blocking evidence freshness report contains stale, missing, or modified evidence',
      detail: freshnessFailures.map((result) => `${result.id}:${result.status}`).join(', '),
    });
  }

  if (!isGoDecision(releaseReadinessReport?.releaseDecision)) {
    findings.push({
      id: 'release-readiness-no-go',
      severity: 'blocking',
      message: 'release readiness report did not produce a GO decision',
      detail: `decision=${releaseReadinessReport?.releaseDecision ?? 'missing'}`,
    });
  }

  if (!isGoDecision(releaseEvidence?.decision)) {
    findings.push({
      id: 'aggregate-release-evidence-no-go',
      severity: 'blocking',
      message: 'virtual desktop release evidence did not produce a GO decision',
      detail: `decision=${releaseEvidence?.decision ?? 'missing'}`,
    });
  }

  if (cleanCheckoutReproduction && cleanCheckoutReproduction.required !== false) {
    if (cleanCheckoutReproduction.status !== 'passed') {
      findings.push({
        id: 'clean-checkout-reproduction-failed',
        severity: 'blocking',
        message: 'clean detached checkout reproduction did not complete successfully',
        detail: cleanCheckoutReproduction.failure_reason ?? cleanCheckoutReproduction.reason ?? cleanCheckoutReproduction.status,
      });
    }

    const comparisons = cleanCheckoutReproduction.comparisons ?? {};
    for (const [id, comparison] of Object.entries(comparisons)) {
      if (comparison && comparison.matches === false) {
        findings.push({
          id: `clean-checkout-${id.replace(/_/g, '-')}-mismatch`,
          severity: 'blocking',
          message: `clean detached checkout reproduction ${id.replace(/_/g, ' ')} did not match the candidate`,
          detail: `candidate=${comparison.candidate ?? 'missing'}; reproduction=${comparison.reproduction ?? 'missing'}`,
        });
      }
    }
  }

  return findings;
}

function clonePreRunGitState({ cloneRoot, referencePreRunGitState }) {
  const cloneHead = git(cloneRoot, ['rev-parse', 'HEAD']).stdout || null;
  const cloneStatus = git(cloneRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  return {
    captured_at: new Date().toISOString(),
    swissknife_head: cloneHead,
    swissknife_branch: null,
    swissknife_detached: true,
    swissknife_status_entries: cloneStatus.stdout ? cloneStatus.stdout.split('\n').filter(Boolean) : [],
    parent_head: referencePreRunGitState?.parent_head ?? null,
    parent_gitlink_sha: referencePreRunGitState?.parent_gitlink_sha ?? null,
    parent_gitlink_matches_head: Boolean(
      referencePreRunGitState?.parent_gitlink_sha &&
      cloneHead &&
      referencePreRunGitState.parent_gitlink_sha === cloneHead
    ),
    parent_status_entries: referencePreRunGitState?.parent_status_entries ?? [],
  };
}

function commandReceipt(command, args, result) {
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    signal: result.signal,
    ok: result.ok,
    duration_ms: result.duration_ms,
    tail: result.tail,
    error: result.error,
  };
}

function reproductionOutputHashSummary(repoRoot) {
  return outputHashes(repoRoot);
}

function compareValue(candidate, reproduction) {
  return {
    candidate,
    reproduction,
    matches: Boolean(candidate && reproduction && candidate === reproduction),
  };
}

function sortedObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function evidenceFreshnessFingerprint(freshness) {
  const results = Array.isArray(freshness?.results) ? freshness.results : [];
  const normalized = results
    .map((result) => ({
      id: result.id,
      release_blocking: result.release_blocking !== false,
      status: result.status,
      recorded_fingerprint: result.recorded_fingerprint ?? null,
      current_fingerprint: result.current_fingerprint ?? null,
      recorded_evidence_hashes: sortedObject(result.recorded_evidence_hashes ?? null),
      current_evidence_hashes: sortedObject(result.current_evidence_hashes ?? null),
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return normalized.length > 0 ? sha256(JSON.stringify(normalized)) : null;
}

export function runCleanCheckoutReleaseReproduction({
  repoRoot,
  preRunGitState,
  referenceSourceFingerprint,
  referenceLockfileSha256,
  referenceEvidenceFreshness,
  generatedAt = new Date().toISOString(),
  keepWorktree = process.env[CLEAN_REPRODUCTION_KEEP_ENV] === '1',
} = {}) {
  if (!repoRoot) throw new Error('runCleanCheckoutReleaseReproduction requires repoRoot');

  if (process.env[CLEAN_REPRODUCTION_CHILD_ENV] === '1') {
    return {
      required: false,
      status: 'skipped',
      reason: `${CLEAN_REPRODUCTION_CHILD_ENV}=1; nested release reproduction is disabled inside the clean checkout child`,
      generated_at: generatedAt,
    };
  }

  const commit = git(repoRoot, ['rev-parse', 'HEAD']).stdout || null;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'swissknife-release-reproduction-'));
  const cloneRoot = path.join(tempRoot, 'swissknife');
  const commands = [];
  const finish = (payload) => {
    const result = {
      required: true,
      schema: 'swissknife.clean-checkout-release-reproduction.v1',
      generated_at: generatedAt,
      commit,
      temp_root: keepWorktree ? tempRoot : null,
      checkout_path: keepWorktree ? cloneRoot : null,
      ...payload,
      commands,
    };
    if (!keepWorktree) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    return result;
  };

  const runAndRecord = (command, args, cwd, options = {}) => {
    const result = run(command, args, cwd, options);
    commands.push(commandReceipt(command, args, result));
    return result;
  };

  try {
    const clone = runAndRecord('git', ['clone', '--no-hardlinks', '--no-checkout', repoRoot, cloneRoot], path.dirname(tempRoot));
    if (!clone.ok) {
      return finish({
        status: 'failed',
        failure_reason: 'git clone failed',
      });
    }

    const checkout = runAndRecord('git', ['checkout', '--detach', commit], cloneRoot);
    if (!checkout.ok) {
      return finish({
        status: 'failed',
        failure_reason: 'git checkout --detach failed',
      });
    }

    const clean = runAndRecord('git', ['clean', '-ffdX'], cloneRoot);
    if (!clean.ok) {
      return finish({
        status: 'failed',
        failure_reason: 'git clean failed',
      });
    }

    const npmCi = runAndRecord('npm', ['ci'], cloneRoot, {
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
      },
    });
    if (!npmCi.ok) {
      return finish({
        status: 'failed',
        failure_reason: 'npm ci failed in clean checkout',
      });
    }

    const clonePreRun = clonePreRunGitState({ cloneRoot, referencePreRunGitState: preRunGitState });
    const readiness = runAndRecord('npm', ['run', 'release:readiness'], cloneRoot, {
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
        [CLEAN_REPRODUCTION_CHILD_ENV]: '1',
        [CLEAN_REPRODUCTION_PARENT_HEAD_ENV]: preRunGitState?.parent_head ?? '',
        [CLEAN_REPRODUCTION_PARENT_GITLINK_ENV]: preRunGitState?.parent_gitlink_sha ?? '',
        [CLEAN_REPRODUCTION_PARENT_STATUS_ENV]: JSON.stringify(preRunGitState?.parent_status_entries ?? []),
      },
    });
    if (!readiness.ok) {
      return finish({
        status: 'failed',
        failure_reason: 'npm run release:readiness failed in clean checkout',
        clone_pre_run_git_state: clonePreRun,
      });
    }

    const childReport = readJsonIfExists(path.join(cloneRoot, 'docs', 'release-readiness-report.json'));
    const childAttestation = buildReleaseReproductionAttestation({
      repoRoot: cloneRoot,
      preRunGitState: clonePreRun,
      releaseReadinessReport: childReport ?? { releaseDecision: 'NO_GO' },
      generatedAt,
      extraOutputs: [],
    });
    const childMarkdown = renderReleaseReproductionAttestationMarkdown(childAttestation)
      .split('\n')
      .map((line) => line.replace(/[\t ]+$/g, ''))
      .join('\n')
      .replace(/\n+$/, '');
    writeFileIfChanged(path.join(cloneRoot, RELEASE_REPRODUCTION_ATTESTATION_MD), `${childMarkdown}\n`);
    const finalChildAttestation = {
      ...childAttestation,
      output_hashes: reproductionOutputHashSummary(cloneRoot),
    };
    finalChildAttestation.output_hashes[RELEASE_REPRODUCTION_ATTESTATION_JSON] = {
      exists: true,
      sha256: null,
      hash_kind: 'canonical-json-payload-with-self-hash-null',
    };
    finalChildAttestation.canonical_payload_sha256 = canonicalAttestationHash(finalChildAttestation);
    finalChildAttestation.output_hashes[RELEASE_REPRODUCTION_ATTESTATION_JSON].sha256 =
      finalChildAttestation.canonical_payload_sha256;
    writeFileIfChanged(
      path.join(cloneRoot, RELEASE_REPRODUCTION_ATTESTATION_JSON),
      `${JSON.stringify(finalChildAttestation, null, 2)}\n`,
    );

    const reproductionSourceFingerprint = trackedTreeFingerprint(cloneRoot);
    const reproductionLockfileSha256 = sha256File(path.join(cloneRoot, 'package-lock.json'));
    const freshness = freshnessSummary(cloneRoot);
    const referenceEvidenceFreshnessContract = evidenceFreshnessContractFingerprint(referenceEvidenceFreshness);
    const reproductionEvidenceFreshnessContract = evidenceFreshnessContractFingerprint(freshness);
    const blockingFreshnessFailures = (freshness.results ?? []).filter((result) =>
      result.release_blocking && result.status !== 'fresh',
    );
    const comparisons = {
      source_fingerprint: compareValue(
        referenceSourceFingerprint?.tracked_content_sha256 ?? null,
        reproductionSourceFingerprint.tracked_content_sha256,
      ),
      git_tree: compareValue(
        referenceSourceFingerprint?.git_tree_sha ?? null,
        reproductionSourceFingerprint.git_tree_sha,
      ),
      lockfile_hash: compareValue(referenceLockfileSha256 ?? null, reproductionLockfileSha256),
      evidence_freshness_contract: compareValue(
        referenceEvidenceFreshnessContract,
        reproductionEvidenceFreshnessContract,
      ),
    };
    const comparisonFailures = Object.values(comparisons).filter((comparison) => comparison.matches === false);
    const childDecision = childReport?.releaseDecision ?? childReport?.goNoGo ?? null;
    const outputHashesAfterRun = reproductionOutputHashSummary(cloneRoot);
    const missingOutputs = Object.entries(outputHashesAfterRun)
      .filter(([, info]) => !info.exists)
      .map(([file]) => file);
    const status = (
      isGoDecision(childDecision) &&
      finalChildAttestation.release_decision === 'GO' &&
      blockingFreshnessFailures.length === 0 &&
      comparisonFailures.length === 0 &&
      missingOutputs.length === 0
    ) ? 'passed' : 'failed';

    return finish({
      status,
      failure_reason: status === 'passed'
        ? null
        : [
            !isGoDecision(childDecision) ? `child release decision ${childDecision ?? 'missing'}` : null,
            finalChildAttestation.release_decision !== 'GO' ? `child attestation decision ${finalChildAttestation.release_decision}` : null,
            blockingFreshnessFailures.length > 0
              ? `stale release-blocking evidence: ${blockingFreshnessFailures.map((entry) => `${entry.id}:${entry.status}`).join(', ')}`
              : null,
            comparisonFailures.length > 0 ? 'candidate/reproduction fingerprint mismatch' : null,
            missingOutputs.length > 0 ? `missing outputs: ${missingOutputs.join(', ')}` : null,
          ].filter(Boolean).join('; '),
      clone_pre_run_git_state: clonePreRun,
      child_release_readiness_report: {
        path: 'docs/release-readiness-report.json',
        decision: childDecision,
        overall_status: childReport?.overallStatus ?? null,
        gate_count: Array.isArray(childReport?.gates) ? childReport.gates.length : null,
        failed_gate_ids: Array.isArray(childReport?.gates)
          ? childReport.gates.filter((gate) => gate.status === 'failed').map((gate) => gate.id)
          : [],
      },
      child_attestation: {
        path: RELEASE_REPRODUCTION_ATTESTATION_JSON,
        decision: finalChildAttestation.release_decision,
        canonical_payload_sha256: finalChildAttestation.canonical_payload_sha256,
        blocker_ids: finalChildAttestation.no_go_findings.map((finding) => finding.id),
      },
      source_fingerprint: reproductionSourceFingerprint,
      lockfile: {
        path: 'package-lock.json',
        sha256: reproductionLockfileSha256,
      },
      evidence_freshness: freshness,
      output_hashes: outputHashesAfterRun,
      comparisons,
    });
  } catch (error) {
    return finish({
      status: 'failed',
      failure_reason: `unexpected reproduction error: ${error?.message ?? String(error)}`,
    });
  }
}

function evidenceFreshnessContractFingerprint(freshness) {
  const contract = (freshness?.results ?? [])
    .map((result) => ({
      id: result.id ?? null,
      release_blocking: result.release_blocking === true,
      status: result.status ?? null,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return evidenceFreshnessFingerprint({ results: contract });
}

export function buildReleaseReproductionAttestation({
  repoRoot,
  preRunGitState,
  releaseReadinessReport,
  generatedAt = new Date().toISOString(),
  extraOutputs = [],
  cleanCheckoutReproduction = null,
} = {}) {
  if (!repoRoot) throw new Error('buildReleaseReproductionAttestation requires repoRoot');

  const freshness = freshnessSummary(repoRoot);
  const releaseEvidence = releaseEvidenceSummary(repoRoot);
  const findings = noGoFindings({
    preRunGitState,
    freshness,
    releaseReadinessReport,
    releaseEvidence,
    cleanCheckoutReproduction,
  });
  const lockfilePath = path.join(repoRoot, 'package-lock.json');
  const sourceFingerprint = trackedTreeFingerprint(repoRoot);
  const attestation = {
    schema: RELEASE_REPRODUCTION_SCHEMA,
    task_id: 'SWR-141',
    generated_at: generatedAt,
    reproduction_mode: 'clean-detached-checkout-release-reproduction',
    commands: RELEASE_COMMANDS,
    release_decision: findings.length === 0 ? 'GO' : 'NO_GO',
    no_go_findings: findings,
    candidate: {
      commit: preRunGitState?.swissknife_head ?? null,
      detached: preRunGitState?.swissknife_detached ?? null,
      checkout_policy: releaseCheckoutPolicy(preRunGitState),
      pre_run_status_entries: preRunGitState?.swissknife_status_entries ?? [],
      parent_repository_commit: preRunGitState?.parent_head ?? null,
      parent_gitlink_sha: preRunGitState?.parent_gitlink_sha ?? null,
      parent_gitlink_source: preRunGitState?.parent_gitlink_source ?? null,
      parent_head_gitlink_sha: preRunGitState?.parent_head_gitlink_sha ?? null,
      parent_index_gitlink_sha: preRunGitState?.parent_index_gitlink_sha ?? null,
      parent_gitlink_matches_head: preRunGitState?.parent_gitlink_matches_head ?? null,
      parent_status_entries: preRunGitState?.parent_status_entries ?? [],
      lockfile: {
        path: 'package-lock.json',
        sha256: sha256File(lockfilePath),
      },
      source_fingerprint: sourceFingerprint,
    },
    tool_versions: toolVersions(repoRoot),
    browser_projects: browserProjects(),
    libp2p_transport_receipts: libp2pTransportReceipts(repoRoot),
    proof_receipts: proofReceipts(repoRoot),
    evidence_freshness: freshness,
    release_evidence: releaseEvidence,
    clean_checkout_reproduction: cleanCheckoutReproduction,
    output_hashes: outputHashes(repoRoot, extraOutputs),
  };

  attestation.canonical_payload_sha256 = canonicalAttestationHash(attestation);
  return attestation;
}

export function renderReleaseReproductionAttestationMarkdown(attestation) {
  const findings = attestation.no_go_findings ?? [];
  const freshnessRows = (attestation.evidence_freshness?.results ?? []).map((result) =>
    `| ${result.id} | ${result.release_blocking ? 'yes' : 'no'} | ${result.status} | \`${result.current_fingerprint ?? 'missing'}\` |`,
  );
  const outputRows = Object.entries(attestation.output_hashes ?? {})
    .filter(([file]) => file !== RELEASE_REPRODUCTION_ATTESTATION_JSON && file !== RELEASE_REPRODUCTION_ATTESTATION_MD)
    .map(([file, info]) =>
      `| \`${file}\` | ${info.exists ? 'present' : 'missing'} | \`${info.sha256}\` |`,
    );
  const libp2p = attestation.libp2p_transport_receipts?.profile_interoperability ?? {};
  const proof = attestation.proof_receipts?.observed_execution ?? {};
  const cleanReproduction = attestation.clean_checkout_reproduction ?? {};

  return [
    '# Release Reproduction Attestation',
    '',
    `Generated: ${attestation.generated_at}`,
    `Task: ${attestation.task_id}`,
    `Commit: \`${attestation.candidate?.commit ?? 'unknown'}\``,
    `Lockfile SHA-256: \`${attestation.candidate?.lockfile?.sha256 ?? 'missing'}\``,
    `Release decision: **${attestation.release_decision}**`,
    '',
    '## Provenance',
    '',
    `Parent repository commit: \`${attestation.candidate?.parent_repository_commit ?? 'unknown'}\``,
    `Parent gitlink SHA: \`${attestation.candidate?.parent_gitlink_sha ?? 'missing'}\``,
    `Parent gitlink source: ${attestation.candidate?.parent_gitlink_source ?? 'unknown'}`,
    `Parent gitlink matches checkout: ${attestation.candidate?.parent_gitlink_matches_head === true ? 'yes' : 'no'}`,
    `Detached checkout: ${attestation.candidate?.detached === true ? 'yes' : 'no'}`,
    `Checkout policy: ${attestation.candidate?.checkout_policy?.mode ?? 'unknown'} (${attestation.candidate?.checkout_policy?.reason ?? 'unknown'})`,
    `Pre-run local status entries: ${(attestation.candidate?.pre_run_status_entries ?? []).length}`,
    `Source tree SHA: \`${attestation.candidate?.source_fingerprint?.git_tree_sha ?? 'unknown'}\``,
    `Tracked content fingerprint: \`${attestation.candidate?.source_fingerprint?.tracked_content_sha256 ?? 'unknown'}\``,
    '',
    '## Tool Versions',
    '',
    `Node: \`${attestation.tool_versions?.node ?? 'unknown'}\``,
    `npm: \`${attestation.tool_versions?.npm ?? 'unknown'}\``,
    `Git: \`${attestation.tool_versions?.git ?? 'unknown'}\``,
    `Platform: \`${attestation.tool_versions?.platform ?? 'unknown'}\``,
    '',
    '## Browser Evidence',
    '',
    `Browser projects: ${(attestation.browser_projects?.libp2p_playwright?.projects ?? []).join(', ')}`,
    `libp2p profile receipt decision: \`${libp2p.decision ?? 'unknown'}\``,
    `libp2p desktop paths: ${libp2p.desktop_path_count ?? 0}`,
    `Proof runtime outcome: \`${proof.outcome ?? 'unknown'}\``,
    `Proof runtime assertions: ${proof.assertion_count ?? 'unknown'}`,
    '',
    '## Clean Checkout Reproduction',
    '',
    `Status: \`${cleanReproduction.status ?? 'not-run'}\``,
    `Commit: \`${cleanReproduction.commit ?? attestation.candidate?.commit ?? 'unknown'}\``,
    `Failure reason: ${cleanReproduction.failure_reason ?? cleanReproduction.reason ?? 'none'}`,
    `Commands: ${(cleanReproduction.commands ?? []).map((entry) => `${entry.command}=${entry.ok ? 'ok' : 'failed'}`).join(', ') || 'none'}`,
    '',
    '## Freshness',
    '',
    '| Evidence group | Blocking | Status | Current fingerprint |',
    '| --- | --- | --- | --- |',
    ...freshnessRows,
    '',
    '## Output Hashes',
    '',
    '| Output | Status | SHA-256 |',
    '| --- | --- | --- |',
    ...outputRows,
    '',
    `Attestation JSON canonical payload SHA-256: \`${attestation.canonical_payload_sha256}\``,
    'The attestation JSON self-hash is computed with its own output hash and canonical hash fields set to null.',
    '',
    '## Decision Findings',
    '',
    ...(findings.length === 0
      ? ['No blocking findings.']
      : findings.map((finding) => `- ${finding.id}: ${finding.message}${finding.detail ? ` (${finding.detail})` : ''}`)),
    '',
  ].join('\n');
}

export function writeReleaseReproductionAttestation({
  repoRoot,
  preRunGitState,
  releaseReadinessReport,
  jsonPath = RELEASE_REPRODUCTION_ATTESTATION_JSON,
  markdownPath = RELEASE_REPRODUCTION_ATTESTATION_MD,
  extraOutputs = [],
  cleanCheckoutReproduction = null,
} = {}) {
  const attestation = buildReleaseReproductionAttestation({
    repoRoot,
    preRunGitState,
    releaseReadinessReport,
    extraOutputs: [markdownPath, ...extraOutputs],
    cleanCheckoutReproduction,
  });
  const markdown = renderReleaseReproductionAttestationMarkdown(attestation)
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join('\n')
    .replace(/\n+$/, '');

  writeFileIfChanged(path.join(repoRoot, markdownPath), `${markdown}\n`);

  const finalAttestation = {
    ...attestation,
    output_hashes: outputHashes(repoRoot, [markdownPath, ...extraOutputs]),
  };
  finalAttestation.canonical_payload_sha256 = sha256(JSON.stringify({
    ...finalAttestation,
    canonical_payload_sha256: null,
  }));
  finalAttestation.output_hashes[jsonPath] = {
    exists: true,
    sha256: null,
    hash_kind: 'canonical-json-payload-with-self-hash-null',
  };
  finalAttestation.canonical_payload_sha256 = canonicalAttestationHash(finalAttestation, jsonPath);
  finalAttestation.output_hashes[jsonPath].sha256 = finalAttestation.canonical_payload_sha256;

  writeFileIfChanged(path.join(repoRoot, jsonPath), `${JSON.stringify(finalAttestation, null, 2)}\n`);
  return finalAttestation;
}
