# SwissKnife Supervisor Shared-Checkout Safety Contract

This is the normative SWR-135 contract for every supervisor that can write the
SwissKnife submodule. It applies to the canonical `all-tools` and `refactor`
lanes, historical Profile G/Profile H lanes, the legacy virtual-desktop launch,
VAI, MGW, HAO, implementation children, merge resolvers, integration tooling,
and operators. The machine-readable identities are in
[`supervisor-lane-inventory.json`](supervisor-lane-inventory.json).

## Safety invariant

Pre-existing work belongs to its current owner. Automation may observe it and
report a blocker, but must not transform, hide, stash, reset, or remove it.
Exactly one verified process may own the SwissKnife writer lease. A lease makes
the process eligible to perform the normal dirty-path ownership checks; it does
not make a dirty checkout safe and does not transfer ownership of any file.

When another lane holds the lease, the required outcome is a pause before an
implementation child is spawned. When a task overlaps dirty work, the required
outcome is also a pause. Priority, repeated failure, apparent staleness, or a
generated-looking path never authorize repair.

## One namespace for all lanes

Every lane uses `swissknife-supervisor-checkout-lease-v1`. The path is derived
from the parent repository, not from a lane state directory and not from a
SwissKnife submodule Git directory:

```text
git -C swissknife rev-parse --show-superproject-working-tree
git -C "$SUPERPROJECT_WORKTREE" rev-parse --path-format=absolute --git-common-dir
$SUPERPROJECT_COMMON_GIT_DIR/swissknife-checkout-lease-v1/owner.json
```

Top-level worktrees have different SwissKnife submodule Git directories but
share the parent Git common directory. Using `$GIT_DIR` inside `swissknife`, a
lane-specific `tmp` directory, CWD, board name, or state prefix would silently
split the namespace and is prohibited.

The owner record is published atomically and records at least:

- lease UUID and contract version;
- namespace ID, parent common Git directory, owned checkout, and Git directory;
- lane ID, canonical board, task prefix, state prefix, and state directory;
- wrapper PID, hostname, UID, executable, command, Linux boot ID, PID namespace,
  and `/proc/<pid>/stat` start ticks;
- protected foreground-child PID and identity before that child may launch the
  supervisor command;
- acquisition time and heartbeat.

Lease v1 deliberately requires Linux procfs. It refuses to run on a platform
where PID start ticks, boot identity, PID namespace, and protected process-group
membership cannot all be verified.

An active owner wins regardless of lease age or heartbeat age. `--check` is
read-only and succeeds for either an available lease or a structurally valid,
identity-verified active lease. It refuses malformed, foreign, or unverifiable
metadata.

## Stale identity and reclamation

PID existence alone is not identity. A lease may be reclaimed only after the
recorded identity is compared with the operating system:

- the recorded PID is absent; or
- the machine boot ID changed; or
- the same numeric PID has different process start ticks.

If the wrapper is gone but its recorded protected child still has the exact
identity, the lease remains active. This prevents a killed Node wrapper from
allowing a second lane to start while its supervisor child is still running.
Different hostname, unreadable `/proc`, permission errors, missing identity,
truncated JSON, unknown schema, and Git or PID namespace mismatch are
**unverifiable**, not stale, and fail closed. In particular, a different PID
namespace may hide a still-live process with the same namespace-local PID; it
is never proof of death.

Verified-stale metadata is moved to a unique audit directory before the atomic
acquisition retry. There is no age timeout and no force-release option. The
safe inspection and explicit reclamation commands are:

```bash
cd swissknife
node scripts/swissknife-checkout-lease.mjs --check --json
node scripts/swissknife-checkout-lease.mjs --reclaim --json
```

`--reclaim` succeeds only for a lease already proven stale by exact identity
verification. Never delete the lease directory or PID files because they look
old.

## Mandatory process controls

The lease wrapper must be the outermost process and must hold the lease until
the foreground supervisor exits. A separate `--acquire && supervisor` sequence
is invalid because it creates a race and loses process-lifetime ownership.

Every implementation launch must set this on the wrapper so the supervisor,
managed daemon, restarts, and agents inherit it:

```bash
IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS=0
```

Zero is mandatory. The daemon's nonzero default can run `git checkout --force
.` inside a persistently dirty submodule followed by `git submodule update
--init --force`; zero disables that maintenance path. Every shared-checkout
implementation command also carries `--no-ephemeral-worktree` and
`--no-worktree-reconciliation`. Do not configure generated-dirty repair or an
LLM merge resolver to repair a dirty SwissKnife checkout.

### Canonical all-tools launch

Run from the parent repository root:

```bash
IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS=0 \
node swissknife/scripts/swissknife-checkout-lease.mjs \
  --run \
  --lane all-tools \
  --board implementation_plan/docs/37-swissknife-virtual-desktop-ipfs-mcp-orb-meta-glasses-plan-2026-07-07.md \
  -- \
  python3 scripts/swissknife_leased_implementation_supervisor.py \
  --todo-path implementation_plan/docs/37-swissknife-virtual-desktop-ipfs-mcp-orb-meta-glasses-plan-2026-07-07.md \
  --state-dir tmp/swissknife_all_tools_supervisor/state \
  --task-prefix '## SVD-' \
  --state-prefix swissknife_all_tools \
  --implement \
  --no-ephemeral-worktree \
  --no-worktree-reconciliation
```

### Canonical refactor launch

Run from the parent repository root:

```bash
IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS=0 \
node swissknife/scripts/swissknife-checkout-lease.mjs \
  --run \
  --lane refactor \
  --board implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md \
  -- \
  python3 scripts/swissknife_leased_implementation_supervisor.py \
  --todo-path implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md \
  --state-dir tmp/swissknife_refactor_supervisor/state \
  --task-prefix '## SWR-' \
  --state-prefix swissknife_refactor \
  --implement \
  --no-ephemeral-worktree \
  --no-worktree-reconciliation
```

The inventory provides the same outer wrapper for every inactive or legacy
writer. Those lanes are not exempt: implementation through an old direct
wrapper is denied until it is routed through this lease. Each inventory command
is an audited exact argv contract: the lease rejects changed child arguments,
missing board/state identity, missing safety flags, or a command that does not
match its registered lane. The canonical direct-board wrapper and the VAI, MGW,
and HAO Python entrypoints also verify the live lease UUID, owner file,
wrapper/child start identities, and protected process group before honoring
`--implement`; observation-only launches remain available without a writer
lease.

`scripts/run_vai_mgw_hao_supervisors.py` cannot represent single ownership
while starting three detached writer lanes. Its launch entrypoint therefore
exits with a configuration error; run one of the three exact inventory commands
at a time instead.

The existing `tmp/swissknife_lane_worktrees/integration-merge.lock` serializes
some merge operations but neither records a board/PID identity nor excludes
implementation. It is not a substitute. An integration apply that can mutate
SwissKnife must itself be the foreground command of the same checkout lease.
Direct `scripts/swissknife_lane_worktrees.py merge --apply` now fails closed.
For example, a refactor integration runs from the parent root as:

```bash
IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS=0 \
node swissknife/scripts/swissknife-checkout-lease.mjs \
  --run \
  --lane refactor-integration \
  --board implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md \
  -- \
  python3 scripts/swissknife_lane_worktrees.py merge \
  --lane refactor \
  --validation-command 'cd swissknife && node scripts/swissknife-checkout-lease.mjs --check' \
  --apply
```

The integration lanes use an audited command-prefix policy so the required
validation string may vary; the executable, coordinator subcommand, and source
lane may not. The wrapper still rejects any validation argv containing a
prohibited destructive Git recovery command. The coordinator independently
requires the matching live lease token before `--apply` and refuses to update
an already-dirty SwissKnife lane checkout during initialization.

## Observation mode

Read-only or bounded status observation does not need to own the writer lease,
but it must not launch implementation. For the SWR lane:

```bash
IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS=0 \
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

This may refresh daemon-owned JSON and event logs in its dedicated state tree;
it may not edit source, task completion metadata, or another lane's state.

## Dirty-path decision sequence

After acquiring the lease and before work execution:

1. Validate lane ID, board, task prefix, state prefix, and state directory.
2. Confirm `IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS` is exactly `0` in the
   wrapper and live managed daemon.
3. Check for merge, rebase, cherry-pick, revert, bisect, or unresolved-index
   state. If present, pause the mutation lane.
4. Inventory parent and nested repository dirt, including untracked files.
5. Compare normalized task outputs with every dirty path, rename endpoint, and
   nested gitlink.
6. Launch only when no unowned overlap exists.
7. Repeat the inventory before merge, completion, or handoff.

At minimum inspect:

```bash
git status --porcelain=v1 --untracked-files=all
git diff --name-only --diff-filter=U
git -C swissknife status --porcelain=v1 --untracked-files=all
git -C swissknife diff --name-only --diff-filter=U
git worktree list --porcelain
```

A parent status line such as `m swissknife` is not sufficient. The nested paths
remain independently owned. Broad declared output directories overlap every
dirty descendant.

## Pause receipt

On lease contention, unverifiable ownership, interrupted Git state, or dirty
overlap, stop before repair. Record the loop identity, task and attempt, declared
outputs, blocker reason and paths, known owner (or `unknown`), repository or
worktree, UTC timestamp, and recovery `wait_for_owner_then_recheck`. Append the
receipt only to that lane's event/log stream. Task status remains daemon-owned.

The current migration observation is deliberately not retroactive compliance:
the pre-SWR-135 all-tools process was observed without the dirty-attempt setting
and both live canonical processes were started without this lease. Do not kill,
rewrite, or retrofit them. Gracefully stop each through its owning operator and
relaunch with the commands above.

## Prohibited recovery

No lane, agent, merge resolver, integration tool, or operator acting for them
may run or emulate any of these against a dirty SwissKnife submodule or its
parent checkout:

```text
git checkout --force ...
git checkout -f ...
git reset ...
git clean ...
git restore <pre-existing-path> ...
git stash ...
git submodule update ...
git worktree remove --force <dirty-worktree>
```

This also forbids automatic stash/pop, deleting or replacing untracked files,
aborting another owner's Git operation, selecting conflict sides without
ownership, force-moving branches, changing a gitlink to hide nested dirt,
committing user work to a rescue branch without consent, and hand-editing a task
or supervisor status to claim success.

Allowed coordination writes are limited to atomic lease metadata in the parent
common Git directory, the lane's own atomic status JSON, append-only event/log
records, PID files, and task outputs that passed ownership checks. Git object
maintenance is never a working-tree repair and does not relax this contract.

## Resume and audit

Resume only after the exact lease owner is available, the prior owner has ended
or transferred its work, fresh parent/nested status has no unowned overlap, no
Git operation is interrupted, the environment and lane identity match the
inventory, and dependencies remain valid.

A compliant handoff shows:

- `node scripts/swissknife-checkout-lease.mjs --check` passes;
- every known writer uses the one parent-common-directory namespace;
- an active owner record includes PID, verified identity, lane, and board;
- a competing lane is refused before child spawn;
- the launch environment is exactly `IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS=0`;
- stale reclamation evidence is identity-based, never time-based;
- dirty parent and nested paths produce pause receipts; and
- no force checkout, reset, update, stash, cleanup, gitlink rewrite, or manual
  completion/status rewrite occurred.
