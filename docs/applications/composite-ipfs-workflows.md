# Composite IPFS Workflows

SwissKnife composite app descriptors define multi-step workflows that cross
`ipfs_kit_py`, `ipfs_datasets_py`, and `ipfs_accelerate_py` while preserving
typed result envelopes, MCP++ receipts, and event-DAG lineage.

The descriptor catalog is implemented in
`src/services/apps/composite-app-descriptors.ts` and uses
`swissknife.app-result-envelope.v1` as the envelope schema for every workflow.

## Workflows

| Workflow | App | Services | Result focus |
| --- | --- | --- | --- |
| `file-manager.pin-selected-file` | File Manager | `ipfs_kit_py`, `ipfs_datasets_py` | pinned CID plus provenance event |
| `ai-chat.answer-with-cited-dataset-context` | AI Chat | `ipfs_datasets_py`, `ipfs_accelerate_py`, `ipfs_kit_py` | answer, citations, stored answer CID |
| `training-manager.train-with-dataset` | Training Manager | `ipfs_datasets_py`, `ipfs_accelerate_py`, `ipfs_kit_py` | training job id and model artifact CID |
| `neural-photoshop.generate-and-store-media` | Neural Photoshop | `ipfs_accelerate_py`, `ipfs_kit_py` | generation job id and media CID |
| `task-manager.monitor-accelerate-jobs` | Task Manager | `ipfs_accelerate_py`, `ipfs_datasets_py` | job status/progress plus provenance event |

## Lineage Rules

Each descriptor declares:

- `steps`: ordered MCP/MCP++ capability calls with input and result schemas.
- `receipt_lineage.required_step_ids`: steps that must emit receipt refs.
- `receipt_lineage.parent_links`: parent-child receipt dependencies.
- `result_envelope.required_output_fields`: `step_results` and `receipt_lineage`
  are required for every composite result.

Write and provenance steps also require event-DAG refs. Read steps can appear in
the lineage as parents so a downstream receipt can point back to the exact
dataset, file, or job state that informed the result.

## Fallbacks

Composite descriptors do not bypass the app capability policy catalog. Sensitive
or side-effectful steps still require confirmation, receipt refs, and event DAG
refs according to `app-capability-policy.ts`. When a backend is unavailable, the
desktop renderer should show the workflow's `fallback_strategy` and preserve the
partial `step_results` collected before failure.
