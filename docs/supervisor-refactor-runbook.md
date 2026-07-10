# SwissKnife Refactor Supervisor Runbook

This runbook defines the safe supervisor workflow for
`implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md`.
It is scoped to `SWR-*` refactor tasks and the dedicated state directory
`tmp/swissknife_refactor_supervisor/state`.

## Phase 17 Handoff Scope

SWR-111 is the Phase 17 supervisor closeout for exhaustive virtual desktop
backend closure and the Agent Supervisor Console. It is a documentation,
release-readiness, and operational handoff task; it must not invent task status,
invoke side-effectful tools during closeout, or bypass the supervisor.

Treat these files as the Phase 17 closeout source set:

| Evidence | Path |
| --- | --- |
| Task board | `implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md` |
| Final signoff | `swissknife/docs/refactor-final-signoff.md` |
| Supervisor runbook | `swissknife/docs/supervisor-refactor-runbook.md` |
| Release readiness report | `swissknife/docs/release-readiness-report.json` |
| Release readiness summary | `swissknife/docs/release-readiness-report.md` |
| Release freshness | `swissknife/docs/release-evidence-freshness.json` |
| App/backend contract | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json` |
| All-tools app bindings | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/all-tools-app-bindings.json` |
| Tool policy matrix | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/all-tools-policy-matrix.json` |
| All-server catalog | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/all-server-tool-catalog.json` |
| Hierarchical MCP evidence | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/hierarchical-tools-evidence.json` |
| MCP++/libp2p reachability | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/mcpplusplus-libp2p-reachability.json` |
| App workflow matrix | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/app-workflow-matrix.json` |
| App screenshots | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots` |
| Supervisor Console evidence | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-e2e.json` |
| Supervisor Console receipts | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-receipts.json` |
| Supervisor Console evidence doc | `swissknife/docs/agent-supervisor-console-evidence.md` |
| ORB/IDL coverage | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/orb-idl-complete-coverage.json` |
| ORB/IDL contract doc | `swissknife/docs/orb-idl-virtual-desktop-contract.md` |
| Meta glasses simulator handoff | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/glasses-simulator-handoff.json` |
| Meta glasses screenshots | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/glasses-screenshots` |
| Accelerate adapter coverage | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/ipfs-accelerate-adapter-coverage.json` |
| Accelerate adapter PID | `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/ipfs-accelerate-compat.pid` |
| Supervisor status | `tmp/swissknife_refactor_supervisor/state/swissknife_refactor_supervisor_status.json` |
| Supervisor task state | `tmp/swissknife_refactor_supervisor/state/swissknife_refactor_task_state.json` |

Closeout is `GO` only when all of these checks are true:

- SWR-100 through SWR-110 are completed in the task board.
- `app-backend-contract.json` records all 45 canonical apps and all three MCP
  service families.
- `all-tools-policy-matrix.json` accounts for all 822 descriptors with owner,
  service, policy class, exposure, confirmation, receipt, and fallback rules.
- Side-effectful, destructive, credential, external-network, media-capture, and
  heavy-compute tools are not blindly invoked; they have explicit confirmation
  or fixture policy.
- `app-workflow-matrix.json` covers 45/45 apps with pointer launch, keyboard
  launch, screenshot, receipt or fixture, and loading/success/fallback/error
  states.
- `hierarchical-tools-evidence.json` reports `decision: go`, 3/3 available
  services, 3/3 full facades, 3/3 representative dispatch probes passed, 0
  blockers, and 0 unexplained hierarchy gaps.
- `mcpplusplus-libp2p-reachability.json` reports `ok: true` when libp2p is
  advertised.
- Supervisor Console evidence observes all seven required paths: success,
  receipt resolve, index search, server unavailable, denied, stale state, and
  transport fallback.
- ORB/IDL evidence covers all 45 apps, display, camera, speaker, microphone,
  input, typed fallbacks, and read-only Supervisor Console projection by
  default.
- Meta glasses evidence is simulator-driven, hardware-free, and covers display,
  camera, speaker, microphone, touch, voice, and handoff receipts.
- Active supervisor PID, state, and log paths are recorded in
  `swissknife/docs/refactor-final-signoff.md`.
- Release readiness reports final decision `GO`, 13/13 gates passed, and 0
  blockers.
- Residual external server or simulator prerequisites are recorded instead of
  hidden.

## Active Supervisor State

The active SWR-111 closeout run was observed with these paths:

| Path | Expected content |
| --- | --- |
| `tmp/swissknife_refactor_supervisor/swissknife_refactor_supervisor.pid` | Watchdog PID. Observed closeout PID: `513718`. |
| `tmp/swissknife_refactor_supervisor/state/swissknife_refactor_managed_daemon.pid` | Managed implementation daemon PID. Observed closeout PID: `514824`. |
| `tmp/swissknife_refactor_supervisor/state/swissknife_refactor_supervisor_status.json` | Watchdog status, active log path, run ID, PID paths, and restart settings. |
| `tmp/swissknife_refactor_supervisor/state/swissknife_refactor_task_state.json` | Active task, task counts, attempts, heartbeat, and recommended actions. |
| `tmp/swissknife_refactor_supervisor/state/swissknife_refactor_events.jsonl` | Implementation daemon event stream. |
| `tmp/swissknife_refactor_supervisor/state/swissknife_refactor_supervisor_events.jsonl` | Supervisor watchdog and health-check event stream. |
| `tmp/swissknife_refactor_supervisor/state/swissknife_refactor_implementation_daemon_20260710T062625Z.log` | Current managed implementation daemon log. |
| `tmp/swissknife_refactor_supervisor/state/implementation_logs/swr-111-attempt-1.log` | Current SWR-111 implementation log. |

Expected closeout task-state values while SWR-111 is active:

- `active_task_id: "SWR-111"`
- `active_task_title: "Phase 17 supervisor closeout and operational handoff"`
- `active_phase: "implementing"`
- `completed_count: 110`
- `ready_task_ids` includes `SWR-111`
- `blocked_count: 0`
- `implementation_in_progress: true`

Do not hand-edit state JSON to force task completion. If state is stale or
points at a dead process, first inspect the PID files and event logs, then rerun
the bounded parse check. Delete or rewrite state only as an explicit recovery
action after confirming no matching supervisor process is alive.

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
- The disabled retry, dependency, and reconciliation guardrails keep the
  bounded check focused on parsing and status refresh.

For SWR-111, the bounded parse check is the validation command. It is expected
to observe the task board and state directory without launching implementation
agents. If the command leaves SWR-111 active, that is acceptable while this
closeout branch is still unmerged; do not mark the task complete by hand unless
the supervising daemon or operator explicitly requests that metadata update.

## Evidence Refresh Commands

Use these commands from `swissknife/` when Phase 17 evidence is stale and the
local environment can run the full browser/MCP lanes:

```bash
node scripts/capture-ipfs-mcp-all-tools-ledger.cjs
node scripts/build-all-tools-capability-matrix.cjs
node scripts/capture-mcp-live-probe-evidence.cjs
node scripts/capture-hierarchical-mcp-tools-evidence.cjs
npm run evidence:libp2p-browser
npm run build:web
npm run typecheck:services
npm run test:browser-compat
npm run test:fast -- test/mcp-plus-plus
npm run test:e2e:mcp
npm run test:e2e:meta-glasses
npm run evidence:mcp-glasses
npm run release:readiness
```

Refresh accelerate adapter evidence only when the local upstream
`ipfs_accelerate_py` server is expected to be running at `127.0.0.1:9000`:

```bash
node scripts/capture-ipfs-accelerate-adapter-coverage.cjs
cat test-results/virtual-desktop-ipfs-mcp-orb/ipfs-accelerate-compat.pid
ss -ltnp | grep ':3003'
```

The PID in the file must match the `ss` listener PID. If it does not, rerun
adapter coverage; do not treat a stale PID file as live process evidence.

## Tool Invocation Policy

Closeout evidence must account for every descriptor but must not execute every
descriptor. The policy matrix records these release decisions:

| Class | Closeout decision |
| --- | --- |
| `read` | May be live-dispatched when the route is available and non-sensitive. |
| `write` | Do not invoke during closeout; require confirmation, receipt, and fixture or dry-run evidence. |
| `destructive` | Do not invoke during closeout; require desktop/mobile confirmation and blocked-state receipt fallback. |
| `credential` | Do not invoke during closeout; require confirmation, redaction, and credential-safe routing. |
| `external_network` | Do not invoke during closeout except safe dry-run/status probes; require confirmation and receipt. |
| `media_capture` | Do not invoke against real devices; use simulator permission states or denial receipts. |
| `heavy_compute` | Do not invoke during closeout unless represented by bounded status/dry-run evidence; require confirmation where app-visible. |

Current policy counts are 426 read, 136 write, 32 destructive, 18 credential,
63 external-network, 8 media-capture, and 139 heavy-compute descriptors. The
matrix records 396 confirmation-required descriptors, 398 app-visible
descriptors, 267 app-visible-with-confirmation descriptors, 49
desktop-or-mobile-only descriptors, and 108 adapter-source-only descriptors.

## External Prerequisites

These services and simulator profiles are expected for a full evidence refresh:

| Dependency | Expected state |
| --- | --- |
| `ipfs_accelerate_py` upstream | Available at `http://127.0.0.1:9000` before refreshing adapter coverage. |
| SwissKnife accelerate adapter | Available at `http://127.0.0.1:3003/mcp` with PID/listener match. |
| `ipfs_kit_py` | Available at `http://127.0.0.1:8014/mcp` for receipt evidence. |
| `ipfs_datasets_py` | Available at `http://127.0.0.1:3002/mcp` for indexed task/goal/run search. |
| MCP++/libp2p | Advertised `/mcp+p2p/1.0.0` endpoint reachable when advertised. |
| Meta glasses simulator | Playwright simulator profile `meta-ray-ban-display-simulator-swr-097`; physical glasses are not required. |

If a dependency is intentionally unavailable, rerun the evidence capture in a
mode that records typed unavailable state and expect release readiness to fail
when the missing dependency is release-required.

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

## GO/NO_GO Decision Rules

Record `GO` in `swissknife/docs/refactor-final-signoff.md` only when every
closeout source above is present and blocker-free. Record `NO_GO` when any of
these conditions is observed:

- A Phase 17 dependency from SWR-100 through SWR-110 is not completed.
- A canonical app lacks backend contract, workflow, screenshot, receipt or
  fixture, required state, ORB/IDL projection, or local-only rationale.
- A required MCP service is unavailable without typed unavailable evidence.
- A hierarchical facade is missing for a required service.
- Advertised MCP++/libp2p reachability is unavailable or stale.
- A tool descriptor lacks policy class, owner, exposure, confirmation, receipt,
  or fallback classification.
- A side-effectful tool is invoked without confirmation or dry-run/fixture
  policy.
- Supervisor Console evidence lacks any required path or receipt correlation.
- Browser console code reads local supervisor files, imports Python, spawns a
  process, or invokes the implementation supervisor directly.
- ORB/IDL evidence omits display, camera, speaker, microphone, input, typed
  fallback, or Supervisor Console read-only projection.
- Meta glasses evidence requires physical glasses or direct desktop pairing.
- Accelerate adapter coverage cannot prove a restart-ready listener whose PID
  file matches port `3003`.
- Release readiness reports `NO_GO`, failed gates, or blockers.

Warnings may remain compatible with `GO` only when they are explicit in release
evidence and have no associated blockers. Current accepted warnings are the
five optional release-evidence files that are absent, 220 explicit direct-only
`ipfs_datasets_py` descriptors, 12 flat descriptors excluded from the
app-visible ledger, and two non-blocking `ipfs_accelerate_py` alias probe
failures while representative dispatch and required adapter aliases pass.
