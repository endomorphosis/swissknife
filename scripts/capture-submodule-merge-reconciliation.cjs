#!/usr/bin/env node

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputPath = path.join(
  projectRoot,
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
  'submodule-merge-reconciliation.json',
);
const HISTORICAL_DIAGNOSTICS_PATH = path.join(
  workspaceRoot,
  'tmp',
  'swissknife_all_tools_supervisor',
  'state',
  'submodule-merge-diagnostics.json',
);

const RECONCILIATION_REPOSITORIES = [
  { id: 'workspace', path: workspaceRoot },
  { id: 'swissknife', path: projectRoot },
  { id: 'ipfs_datasets_py', path: path.join(workspaceRoot, 'external', 'ipfs_datasets') },
  { id: 'ipfs_kit_py', path: path.join(workspaceRoot, 'external', 'ipfs_kit') },
  { id: 'ipfs_accelerate_py', path: path.join(workspaceRoot, 'external', 'ipfs_accelerate') },
];

function git(repoPath, args) {
  try {
    return {
      ok: true,
      stdout: execFileSync('git', ['-C', repoPath, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
      stderr: '',
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString().trim() ?? '',
      stderr: error.stderr?.toString().trim() ?? error.message,
    };
  }
}

function repositoryObservation(repository) {
  const available = fs.existsSync(repository.path);
  if (!available) {
    return {
      id: repository.id,
      path: path.relative(workspaceRoot, repository.path),
      available: false,
      head: null,
      unmerged_paths: [],
      working_tree_dirty: null,
      error: 'repository path is unavailable',
    };
  }
  const head = git(repository.path, ['rev-parse', 'HEAD']);
  const unmerged = git(repository.path, ['diff', '--name-only', '--diff-filter=U']);
  const status = git(repository.path, ['status', '--porcelain=v1']);
  return {
    id: repository.id,
    path: path.relative(workspaceRoot, repository.path),
    available: head.ok && unmerged.ok && status.ok,
    head: head.ok ? head.stdout : null,
    unmerged_paths: unmerged.ok ? unmerged.stdout.split(/\r?\n/).filter(Boolean) : [],
    working_tree_dirty: status.ok ? status.stdout.length > 0 : null,
    error: head.ok && unmerged.ok && status.ok ? null : [head, unmerged, status]
      .filter(result => !result.ok)
      .map(result => result.stderr)
      .filter(Boolean)
      .join('; ') || 'git inspection failed',
  };
}

function historicalDiagnostics() {
  if (!fs.existsSync(HISTORICAL_DIAGNOSTICS_PATH)) {
    return { present: false, path: path.relative(workspaceRoot, HISTORICAL_DIAGNOSTICS_PATH), latest_timestamp: null };
  }
  try {
    const diagnostics = JSON.parse(fs.readFileSync(HISTORICAL_DIAGNOSTICS_PATH, 'utf8'));
    const timestamps = (diagnostics.attempts ?? [])
      .map(attempt => attempt.timestamp)
      .filter(value => typeof value === 'string')
      .sort();
    return {
      present: true,
      path: path.relative(workspaceRoot, HISTORICAL_DIAGNOSTICS_PATH),
      latest_timestamp: timestamps.at(-1) ?? null,
    };
  } catch (error) {
    return {
      present: true,
      path: path.relative(workspaceRoot, HISTORICAL_DIAGNOSTICS_PATH),
      latest_timestamp: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const repositories = RECONCILIATION_REPOSITORIES.map(repositoryObservation);
const unresolved = repositories.flatMap(repository => repository.unmerged_paths.map(file => ({ repository: repository.id, path: file })));
const unavailable = repositories.filter(repository => !repository.available).map(repository => repository.id);
const report = {
  schema: 'swissknife.submodule-merge-reconciliation-evidence.v1',
  task_id: 'SVD-116',
  generated_at: new Date().toISOString(),
  scope: 'current git conflict and submodule reconciliation state',
  historical_diagnostics: historicalDiagnostics(),
  repositories,
  reconciliation: {
    repositories_checked: repositories.length,
    unavailable_repositories: unavailable,
    unmerged_paths: unresolved,
    unresolved_conflicts_absent: unavailable.length === 0 && unresolved.length === 0,
    working_tree_dirty_repository_ids: repositories
      .filter(repository => repository.working_tree_dirty === true)
      .map(repository => repository.id),
    statement: 'This receipt proves current conflict reconciliation only. Working-tree changes are reported separately and are never rewritten by this capture.',
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  task_id: report.task_id,
  unresolved_conflicts_absent: report.reconciliation.unresolved_conflicts_absent,
  dirty_repositories: report.reconciliation.working_tree_dirty_repository_ids,
  output: path.relative(projectRoot, outputPath),
}, null, 2));
