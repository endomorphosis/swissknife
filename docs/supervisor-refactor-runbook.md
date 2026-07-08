# SwissKnife Refactor Supervisor Runbook

This runbook defines the safe supervisor workflow for
`implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md`.
It is scoped to `SWR-*` refactor tasks and the dedicated state directory
`tmp/swissknife_refactor_supervisor/state`.

## Bounded Parse Check

Run this command from the repository root to verify that the SWR task board can
be parsed and supervised once without launching implementation agents:

```bash
python -m ipfs_accelerate_py.agent_supervisor.todo_daemon.implementation_supervisor \
  --once \
  --todo-path implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md \
  --state-dir tmp/swissknife_refactor_supervisor/state \
  --task-prefix '## SWR-' \
  --state-prefix swissknife_refactor \
  --no-implement \
  --no-ephemeral-worktree \
  --no-worktree-reconciliation \
  --no-retry-budget-guardrail \
  --no-dependency-guardrail \
  --no-reconciliation-guardrail
```

Required invariants:

- `--once` bounds the supervisor to one pass.
- `--no-implement` prevents implementation agent launch and autonomous code
  edits.
- `--todo-path` points at the SWR refactor plan, not another backlog.
- `--task-prefix '## SWR-'` matches the Markdown task headings.
- `--state-prefix swissknife_refactor` keeps generated state names distinct
  from other supervisor backlogs.
- `--state-dir tmp/swissknife_refactor_supervisor/state` isolates generated
  state from durable documentation and source files.
- `--no-ephemeral-worktree` avoids creating extra worktrees during the bounded
  check.
- The three disabled guardrails keep the bounded check focused on parsing and
  status refresh rather than retry, dependency, or reconciliation enforcement.

## State Directory

The bounded check may create or refresh files under
`tmp/swissknife_refactor_supervisor/state`. These files are supervisor runtime
state and evidence, not source-of-truth task metadata. The source of truth for
task status remains the SWR task board in the implementation plan.

Expected state files:

| Path | Purpose |
| --- | --- |
| `swissknife_refactor_task_state.json` | Current backlog counts, active task metadata, completed/ready/waiting task IDs, and heartbeat. |
| `swissknife_refactor_strategy.json` | Supervisor strategy and prioritization state. |
| `task_queue.json` | Persistent selection queue, attempt counts, cooldowns, and task scheduling metadata. |
| `swissknife_refactor_events.jsonl` | Implementation daemon event stream. |
| `swissknife_refactor_supervisor_events.jsonl` | Supervisor watchdog and health-check event stream. |
| `swissknife_refactor_supervisor_status.json` | Managed daemon PID, status paths, log path, restart policy, and heartbeat settings. |
| `swissknife_refactor_managed_daemon.pid` | PID for a managed implementation daemon when a long-running supervisor is active. |
| `implementation.lock` and `swissknife_refactor_supervisor.lock` | Lock files used to prevent conflicting supervisor or implementation activity. |
| `implementation_logs/` | Per-task implementation logs from implementation-mode runs. The bounded check should not add new implementation attempts. |
| `gc_state.json` | Timestamp and counters for supervisor-managed Git garbage collection. |

Do not hand-edit state JSON to force task completion. If state is stale or
points at a dead process, first inspect the PID and event logs, then rerun the
bounded parse check. Delete or rewrite state only as an explicit recovery action
after confirming no matching supervisor process is alive.

## Implementation Mode

Use implementation mode only after the bounded parse check succeeds and the
operator intentionally wants autonomous task execution. Keep the same
`--todo-path`, `--task-prefix`, `--state-prefix`, and `--state-dir` values so
the implementation daemon uses the same task namespace and state history.

Recommended implementation guardrails for this backlog:

- Keep `--no-ephemeral-worktree` when the current SwissKnife checkout is the
  intended integration target.
- Keep `--no-worktree-reconciliation` unless reconciling stale implementation
  worktrees is the specific maintenance objective.
- Use bounded restart and timeout settings for unattended runs.
- Stop or wait for an active `--implement` supervisor before running a bounded
  check against the same state directory unless the check is being used only to
  observe current state.

## Known Git GC Behavior

The supervisor imports `GitGarbageCollector` from
`ipfs_accelerate_py.agent_supervisor.git_gc` for long-running repositories. The
collector uses `gc_state.json` to throttle maintenance.

Standard GC behavior:

- Defaults to a four-hour interval
  (`IPFS_ACCELERATE_AGENT_GC_INTERVAL_SECONDS`, default `14400`).
- Runs `git worktree prune`.
- Expires reflogs older than seven days
  (`IPFS_ACCELERATE_AGENT_GC_REFLOG_EXPIRE_DAYS`, default `7`).
- Runs `git gc --quiet --auto`.
- Records timestamps, run count, and estimated loose-object reduction in
  `gc_state.json`.

Aggressive GC behavior:

- Defaults to a 24-hour interval
  (`IPFS_ACCELERATE_AGENT_GC_AGGRESSIVE_INTERVAL_SECONDS`, default `86400`).
- Runs worktree prune, expires all reflogs, runs
  `git gc --quiet --aggressive`, repacks, and prunes unreachable objects.
- Can take substantially longer than the bounded parse check and should not be
  treated as a task implementation failure by itself.

Additional behavior:

- `IPFS_ACCELERATE_AGENT_GC_MAX_LOOSE_OBJECTS` controls the loose-object
  threshold for GC consideration, default `5000`.
- If `IPFS_ACCELERATE_AGENT_GC_WORKTREE_ROOT` is set, the collector can run
  light `git gc --auto --quiet` maintenance in discovered submodule/worktree
  repositories.
- GC is repository maintenance. It can update Git object storage and
  `gc_state.json`, but it should not modify tracked source files.

## Safe Escalation Rules

Escalate from bounded parse checks to autonomous implementation only when all
of these are true:

- The bounded command exits `0`.
- `swissknife_refactor_task_state.json` shows the expected SWR task counts and
  no unexpected active implementation.
- The task's `Depends on` entries are completed in the SWR task board.
- The intended validation command is clear and practical to run.
- The working tree has been reviewed for unrelated local changes that must not
  be reverted.

Do not escalate when:

- Another supervisor is actively implementing against the same state directory,
  unless that active run is the intended owner.
- The bounded command selects tasks from the wrong prefix or wrong plan.
- The state directory points at a live PID that is not the expected supervisor.
- The task requires source edits but the requested mode is `--no-implement`.
- Guardrail failures indicate dependency, retry-budget, or reconciliation work
  that has not been intentionally disabled.

If escalation is blocked, preserve the event logs and record the reason in the
task or operator notes rather than editing the task to completed.
