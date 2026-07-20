#!/usr/bin/env node

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(repoRoot, '..');
const evidenceRoot = path.join(repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const todoPath = path.join(
  workspaceRoot,
  'implementation_plan',
  'docs',
  '38-swissknife-repository-refactoring-plan-2026-07-08.todo.md',
);
const docsJsonPath = path.join(repoRoot, 'docs', 'refactor-main-reconciliation.json');
const docsMarkdownPath = path.join(repoRoot, 'docs', 'refactor-main-reconciliation.md');
const evidenceJsonPath = path.join(evidenceRoot, 'refactor-main-reconciliation.json');

const REQUIRED_COMPLETED_TASKS = ['SWR-160', 'SWR-161'];
const CURRENT_TASK = 'SWR-162';
const CANDIDATE_REF_PATTERN = /\b(?:attempt|recovery|rescue|diagnostic|auto-heal)\b/i;

function runGit(args, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync('git', args, {
        cwd: options.cwd ?? repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
      stderr: '',
      status: 0,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString().trim() ?? '',
      stderr: error.stderr?.toString().trim() ?? error.message,
      status: error.status ?? 1,
    };
  }
}

function splitLines(value) {
  return String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function gitOutput(args, fallback = null) {
  const result = runGit(args);
  return result.ok ? result.stdout : fallback;
}

function isAncestor(ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  return runGit(['merge-base', '--is-ancestor', ancestor, descendant]).ok;
}

function branchContains(ref, commit) {
  if (!ref || !commit) return false;
  return runGit(['merge-base', '--is-ancestor', commit, ref]).ok;
}

function currentBranch() {
  const branch = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return branch.ok ? branch.stdout : null;
}

function parseTodoStatuses() {
  if (!fs.existsSync(todoPath)) {
    return {
      path: path.relative(workspaceRoot, todoPath),
      present: false,
      tasks: {},
    };
  }

  const text = fs.readFileSync(todoPath, 'utf8');
  const tasks = {};
  const headingPattern = /^##\s+(SWR-\d+)\s+(.+)$/gm;
  const matches = Array.from(text.matchAll(headingPattern));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const body = text.slice(match.index + match[0].length, next?.index ?? text.length);
    const status = body.match(/^- Status:\s*(.+)$/m)?.[1]?.trim() ?? null;
    const validation = body.match(/^- Validation:\s*(.+)$/m)?.[1]?.trim() ?? null;
    tasks[match[1]] = {
      title: match[2].trim(),
      status,
      validation,
    };
  }

  return {
    path: path.relative(workspaceRoot, todoPath),
    present: true,
    tasks,
  };
}

function listCandidateRefs() {
  const result = runGit([
    'for-each-ref',
    '--format=%(refname:short)%00%(objectname)%00%(committerdate:iso8601)%00%(subject)',
    'refs/heads',
    'refs/remotes',
  ]);
  if (!result.ok) return [];

  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const [ref, sha, committedAt, subject] = line.split('\0');
    return { ref, sha, committedAt, subject };
  }).filter((entry) => CANDIDATE_REF_PATTERN.test(entry.ref));
}

function listCommits(range) {
  if (!range) return [];
  const result = runGit([
    'log',
    '--reverse',
    '--date=iso-strict',
    '--format=%H%x00%P%x00%aI%x00%s',
    range,
  ]);
  if (!result.ok || !result.stdout) return [];

  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const [sha, parents, authoredAt, subject] = line.split('\0');
    const changedFiles = splitLines(gitOutput(['diff-tree', '--no-commit-id', '--name-status', '-r', sha], ''));
    return {
      sha,
      parents: splitLines(parents.replace(/ /g, '\n')),
      authored_at: authoredAt,
      subject,
      changed_files: changedFiles,
    };
  });
}

function firstExistingRef(refs) {
  return refs.find((ref) => runGit(['rev-parse', '--verify', '--quiet', ref]).ok) ?? null;
}

function classifyRefDisposition(entry, headSha, integrationBase) {
  const headContainsTip = branchContains('HEAD', entry.sha);
  const tipContainsHead = branchContains(entry.ref, headSha);
  const ancestorOfBase = integrationBase ? isAncestor(entry.sha, integrationBase) : false;
  const category = entry.ref.includes('/recovery/') || entry.ref.includes('/rescue/')
    ? 'recovery'
    : entry.ref.includes('/auto-heal/')
      ? 'diagnostic'
      : 'attempt';

  if (headContainsTip) {
    return {
      ...entry,
      category,
      relationship_to_head: ancestorOfBase ? 'ancestor_of_integration_base' : 'ancestor_of_candidate_head',
      decision: 'preserved_already_integrated',
      reason: 'tip is already reachable from the candidate; no branch replay or merge was needed',
    };
  }

  if (tipContainsHead) {
    return {
      ...entry,
      category,
      relationship_to_head: 'descendant_of_candidate_head',
      decision: 'rejected_preserved',
      reason: 'candidate branch contains additional history beyond the validated mainline and was not merged wholesale',
    };
  }

  return {
    ...entry,
    category,
    relationship_to_head: 'diverged_from_candidate_head',
    decision: 'rejected_preserved',
    reason: category === 'attempt'
      ? 'superseded task-attempt branch diverges from current validated mainline'
      : `${category} branch is preserved for audit/recovery but is not accepted as release source`,
  };
}

function conflictMarkerPaths() {
  const tracked = splitLines(gitOutput(['ls-files'], ''));
  const paths = [];
  const marker = /^(?:<{7,}|>{7,})(?:\s.*)?$/m;
  for (const file of tracked) {
    if (file.startsWith('node_modules/') || file.startsWith('dist/')) continue;
    const absolute = path.join(repoRoot, file);
    if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) continue;
    let text;
    try {
      text = fs.readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    if (marker.test(text)) paths.push(file);
  }
  return paths;
}

function renderMarkdown(report) {
  const integratedRows = report.integration.integrated_commits.length > 0
    ? report.integration.integrated_commits.map((commit) =>
        `| \`${commit.sha.slice(0, 12)}\` | ${commit.subject.replace(/\|/g, '\\|')} | ${commit.changed_files.length} |`,
      )
    : ['| none | no new commits relative to selected mainline base | 0 |'];
  const rejectedRows = report.integration.rejected_stale_or_recovery_branches.length > 0
    ? report.integration.rejected_stale_or_recovery_branches.map((entry) =>
        `| \`${entry.ref}\` | \`${entry.sha.slice(0, 12)}\` | ${entry.category} | ${entry.reason.replace(/\|/g, '\\|')} |`,
      )
    : ['| none | none | none | no stale/recovery branch candidates were present |'];
  const preservedRows = report.integration.preserved_already_integrated_refs.length > 0
    ? report.integration.preserved_already_integrated_refs.map((entry) =>
        `| \`${entry.ref}\` | \`${entry.sha.slice(0, 12)}\` | ${entry.relationship_to_head} |`,
      )
    : ['| none | none | none |'];

  return [
    '# Refactor Main Reconciliation Receipt',
    '',
    `Generated: ${report.generated_at}`,
    `Task: ${report.task_id}`,
    `Decision: **${report.decision}**`,
    '',
    '## Checkout',
    '',
    `Head: \`${report.checkout.head}\``,
    `Branch: \`${report.checkout.branch ?? 'detached'}\``,
    `Selected upstream: \`${report.checkout.selected_upstream_ref ?? 'none'}\``,
    `Integration base: \`${report.integration.base_sha ?? 'none'}\``,
    `Working tree status entries: ${report.checkout.status_entries.length}`,
    `Unmerged paths: ${report.checkout.unmerged_paths.length}`,
    `Conflict marker paths: ${report.checkout.conflict_marker_paths.length}`,
    '',
    '## Integrated Commits',
    '',
    '| Commit | Subject | Changed paths |',
    '| --- | --- | ---: |',
    ...integratedRows,
    '',
    '## Preserved Integrated Attempt Refs',
    '',
    '| Ref | Tip | Relationship |',
    '| --- | --- | --- |',
    ...preservedRows,
    '',
    '## Rejected Stale Or Recovery Branches',
    '',
    '| Ref | Tip | Category | Reason |',
    '| --- | --- | --- | --- |',
    ...rejectedRows,
    '',
    '## Task Status Evidence',
    '',
    ...REQUIRED_COMPLETED_TASKS.map((taskId) =>
      `- ${taskId}: ${report.task_status.tasks[taskId]?.status ?? 'missing'}`,
    ),
    `- ${CURRENT_TASK}: ${report.task_status.tasks[CURRENT_TASK]?.status ?? 'missing'}`,
    '',
    '## Blockers',
    '',
    ...(report.blockers.length === 0 ? ['No blockers.'] : report.blockers.map((blocker) => `- ${blocker}`)),
    '',
  ].join('\n');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main() {
  const headSha = gitOutput(['rev-parse', 'HEAD']);
  const branch = currentBranch();
  const selectedUpstream = firstExistingRef(['origin/main', 'main']);
  const baseSha = selectedUpstream ? gitOutput(['merge-base', 'HEAD', selectedUpstream]) : null;
  const integratedCommits = listCommits(baseSha && baseSha !== headSha ? `${baseSha}..HEAD` : null);
  const candidateRefs = listCandidateRefs();
  const dispositions = candidateRefs.map((entry) => classifyRefDisposition(entry, headSha, baseSha));
  const rejected = dispositions.filter((entry) => entry.decision === 'rejected_preserved');
  const preservedIntegrated = dispositions.filter((entry) => entry.decision === 'preserved_already_integrated');
  const todo = parseTodoStatuses();
  const statusEntries = splitLines(gitOutput(['status', '--porcelain=v1', '--untracked-files=all'], ''));
  const unmergedPaths = splitLines(gitOutput(['diff', '--name-only', '--diff-filter=U'], ''));
  const markerPaths = conflictMarkerPaths();
  const diffCheck = runGit(['diff', '--check']);
  const integratedRecoveryOrDiagnosticRefs = dispositions.filter((entry) =>
    entry.decision === 'preserved_already_integrated' && ['recovery', 'diagnostic'].includes(entry.category) && !isAncestor(entry.sha, baseSha),
  );

  const blockers = [];
  if (!todo.present) blockers.push(`task board is missing at ${todo.path}`);
  for (const taskId of REQUIRED_COMPLETED_TASKS) {
    if (todo.tasks[taskId]?.status !== 'completed') {
      blockers.push(`${taskId} status is ${todo.tasks[taskId]?.status ?? 'missing'}, expected completed`);
    }
  }
  if (!headSha) blockers.push('cannot resolve SwissKnife HEAD');
  if (!selectedUpstream) blockers.push('cannot resolve origin/main or main as reconciliation base');
  if (unmergedPaths.length > 0) blockers.push(`unmerged paths remain: ${unmergedPaths.join(', ')}`);
  if (markerPaths.length > 0) blockers.push(`conflict markers remain: ${markerPaths.join(', ')}`);
  if (!diffCheck.ok) blockers.push(`git diff --check failed: ${diffCheck.stderr || diffCheck.stdout}`);
  if (integratedRecoveryOrDiagnosticRefs.length > 0) {
    blockers.push(`recovery/diagnostic refs are reachable from candidate head: ${integratedRecoveryOrDiagnosticRefs.map((entry) => entry.ref).join(', ')}`);
  }

  const report = {
    schema: 'swissknife.refactor-main-reconciliation.v1',
    task_id: CURRENT_TASK,
    generated_at: new Date().toISOString(),
    decision: blockers.length === 0 ? 'GO' : 'NO_GO',
    blockers,
    checkout: {
      head: headSha,
      branch,
      selected_upstream_ref: selectedUpstream,
      selected_upstream_sha: selectedUpstream ? gitOutput(['rev-parse', selectedUpstream]) : null,
      status_entries: statusEntries,
      unmerged_paths: unmergedPaths,
      conflict_marker_paths: markerPaths,
      diff_check: {
        ok: diffCheck.ok,
        stdout: diffCheck.stdout,
        stderr: diffCheck.stderr,
      },
    },
    task_status: todo,
    integration: {
      base_sha: baseSha,
      integrated_commit_count: integratedCommits.length,
      integrated_commits: integratedCommits,
      candidate_ref_count: dispositions.length,
      preserved_already_integrated_refs: preservedIntegrated,
      rejected_stale_or_recovery_branches: rejected,
      ref_dispositions: dispositions,
      policy: 'Only refs whose commits are already reachable from the validated candidate are accepted; stale attempt, diagnostic, rescue, and recovery refs are preserved but not merged wholesale.',
    },
  };

  writeJson(docsJsonPath, report);
  writeJson(evidenceJsonPath, report);
  fs.writeFileSync(docsMarkdownPath, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(JSON.stringify({
    schema: report.schema,
    task_id: report.task_id,
    decision: report.decision,
    integrated_commit_count: report.integration.integrated_commit_count,
    rejected_stale_or_recovery_branch_count: rejected.length,
    blockers: report.blockers,
    docs_json: path.relative(repoRoot, docsJsonPath),
    evidence_json: path.relative(repoRoot, evidenceJsonPath),
  }, null, 2));

  if (report.decision !== 'GO') process.exit(1);
}

main();
