# Refactor Main Reconciliation Receipt

Generated: 2026-07-20T07:52:16.674Z
Task: SWR-162
Decision: **GO**

## Checkout

Head: `9252e108bf10b80593adc3e36b441b75affe51b3`
Branch: `automation/swissknife-refactor-integration`
Selected upstream: `origin/main`
Integration base: `f9415b10d38443690c7cc5a9221946427506c318`
Working tree status entries: 80
Unmerged paths: 0
Conflict marker paths: 0

## Integrated Commits

| Commit | Subject | Changed paths |
| --- | --- | ---: |
| `e53e2e237153` | SWR-162: reconcile validated refactor lane | 138 |
| `cda2bfd428a2` | SWR-162: support staged parent gitlink validation | 1 |
| `6c50b79a7d3d` | SWR-162: lease MCP dashboard evidence port | 4 |
| `eb87ca3041e6` | fix(release): tolerate absent sibling repos in clean clone | 1 |
| `af88cacefc3f` | fix(release): allow standalone reconciliation receipt | 2 |
| `4cecea515242` | fix(release): validate standalone reconciliation evidence | 2 |
| `61c087a52e57` | fix(release): compare freshness contracts across clones | 1 |
| `9252e108bf10` | fix(mcp): retry queued datasets read probes | 1 |

## Preserved Integrated Attempt Refs

| Ref | Tip | Relationship |
| --- | --- | --- |
| `implementation/swr-160-attempt-1-1784474746-submodule-swissknife` | `add6ea7a622b` | ancestor_of_integration_base |
| `implementation/swr-160-attempt-1-1784474944-submodule-swissknife` | `add6ea7a622b` | ancestor_of_integration_base |
| `origin/copilot/auto-heal-failed-workflows` | `b622eedf148f` | ancestor_of_integration_base |
| `origin/implementation/mgw-572-attempt-3-1783506404-submodule-swissknife` | `db63a68d338e` | ancestor_of_integration_base |
| `origin/recovery/restore-snapshot-only-20260708` | `cbd1a155b407` | ancestor_of_integration_base |

## Rejected Stale Or Recovery Branches

| Ref | Tip | Category | Reason |
| --- | --- | --- | --- |
| `origin/auto-heal/swissknife-ci-20251030-005805` | `2395f5372af6` | diagnostic | diagnostic branch is preserved for audit/recovery but is not accepted as release source |
| `origin/auto-heal/swissknife-ci-20251030-005827` | `d0e6ea664e28` | diagnostic | diagnostic branch is preserved for audit/recovery but is not accepted as release source |
| `origin/auto-heal/swissknife-ci-20251030-022435` | `06e7d4d39413` | diagnostic | diagnostic branch is preserved for audit/recovery but is not accepted as release source |
| `origin/auto-heal/swissknife-ci-20251030-022557` | `4fae61814a5f` | diagnostic | diagnostic branch is preserved for audit/recovery but is not accepted as release source |
| `origin/auto-heal/swissknife-ci-20251030-035616` | `267d44e3c8ee` | diagnostic | diagnostic branch is preserved for audit/recovery but is not accepted as release source |
| `origin/auto-heal/swissknife-ci-20251030-035653` | `b86cdf5ad5f8` | diagnostic | diagnostic branch is preserved for audit/recovery but is not accepted as release source |
| `origin/recovery/snapshot-20260708-1817` | `87290f3645d8` | recovery | recovery branch is preserved for audit/recovery but is not accepted as release source |

## Task Status Evidence

- Parent task board: present
- Parent task board required for this checkout: yes
- SWR-160: completed
- SWR-161: completed
- SWR-162: ready

## Blockers

No blockers.

