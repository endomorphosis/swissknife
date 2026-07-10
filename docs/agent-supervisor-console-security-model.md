# Agent Supervisor Console Security Model

SWR-104 defines the Agent Supervisor Console as a browser-safe operations gateway. The browser receives typed capability descriptors and sends mediated MCP or MCP++ requests. It does not read host state paths, launch local processes, or call implementation-supervisor internals directly.

## Trust Boundary

The browser boundary is `src/services/mcp/agent-supervisor-console-gateway.ts`. It exposes a transport-injected gateway and defaults to typed `unavailable` results when no transport is configured. Browser code may render capabilities, build request envelopes, validate governed write inputs, and normalize responses. Actual supervisor state and mutations remain behind backend MCP services.

The contract is machine-readable in `contracts/agent-supervisor-console.schema.json` and type-readable through `src/shared/service-contracts/agent-supervisor-console.ts`.

## Backend Ownership

| Owner | Authority |
| --- | --- |
| `ipfs_accelerate_py` | Supervisor health, queue, goals, subgoals, redacted logs, and governed prompt/task-control actions. |
| `ipfs_kit_py` | Immutable evidence and receipt persistence. Receipt refs returned to the browser are owned by this service. |
| `ipfs_datasets_py` | Searchable task, goal, taskboard, and run-history indexes. |

The browser contract treats these owners as capabilities, not implementation modules. A UI may show owner status and route requests through MCP/MCP++ transports, but it must not derive local paths, launch commands, or bypass policy mediation.

## Capabilities

Read capabilities:

| Capability | Owner | Purpose |
| --- | --- | --- |
| `supervisor.health.read` | `ipfs_accelerate_py` | Supervisor and backend health. |
| `supervisor.queue.read` | `ipfs_accelerate_py` | Queue entries and dependency state. |
| `supervisor.goals.read` | `ipfs_accelerate_py` | Goal tree roots and task bindings. |
| `supervisor.subgoals.read` | `ipfs_accelerate_py` | Subgoal state for goal/task slices. |
| `supervisor.taskboard.links.read` | `ipfs_datasets_py` | Indexed taskboard and release-evidence links. |
| `supervisor.logs.read` | `ipfs_accelerate_py` | Redacted supervisor logs. |
| `supervisor.receipts.read` | `ipfs_kit_py` | Immutable evidence and receipt references. |
| `supervisor.run-history.search` | `ipfs_datasets_py` | Searchable run-history records. |

Governed write capabilities:

| Capability | Owner | Policy |
| --- | --- | --- |
| `supervisor.prompt-steering.request` | `ipfs_accelerate_py` | Requires dry-run or explicit confirmation, bounded prompt text, target validation, and receipt output. |
| `supervisor.task-control.request` | `ipfs_accelerate_py` | Requires dry-run or explicit confirmation, target task, reason text, dependency and budget policy checks, and receipt output. |

Prompt steering includes a browser-visible review payload before submission:

| Field | Purpose |
| --- | --- |
| `normalized_target` | Canonical `goal:<id>`, `subgoal:<id>`, or `task:<id>` target string. |
| `policy_class` | The governed write policy class. Prompt steering is `confirm`. |
| `affected_task_ids` | The task IDs derived from the selected goal, subgoal, or taskboard task. |
| `planned_mcp_action` | The MCP method, owner, transports, structured input mode, and required policy checks that will be submitted. |

The submitted payload carries `expected_normalized_target` from the review. If the selected target changes after review, the gateway returns `invalid_target` and the user must review again.

## Result States

Every gateway call returns one of three states:

| State | Meaning |
| --- | --- |
| `available` | The backend accepted the request and returned data. Mutating requests include an `ipfs_kit_py` receipt. |
| `unavailable` | A typed availability failure occurred, such as `server_unavailable`, `transport_unavailable`, `index_stale`, `receipt_unavailable`, `not_configured`, or `timeout`. |
| `denied` | Policy blocked the request with `policy_denied`, `confirmation_required`, `dependency_blocked`, `budget_exceeded`, `scope_not_allowed`, or `invalid_target`. |

Unavailable states are displayable and retryable according to the reason. Denied states are not transport failures; they are policy outcomes that must be shown with the policy class and any confirmation requirement.

## Browser Bundle Rules

Browser bundles may import:

- `src/services/mcp/browser-mcp.ts`
- `src/services/mcp/browser.ts`
- `src/services/mcp/agent-supervisor-console-gateway.ts`
- `src/shared/service-contracts/agent-supervisor-console.ts`

Browser bundles must not contain:

- Host state file reads.
- Process launch or subprocess APIs.
- Direct implementation-supervisor invocation.
- Unmediated prompt mutation paths.
- Backend implementation imports.

The `audit:bundle-host-leakage` gate enforces host API leakage. The gateway implementation also avoids hard-coded local service endpoints; callers must provide a remote endpoint or receive a typed `not_configured` / `transport_unavailable` result.

## Governed Request Flow

1. UI selects a goal, subgoal, or task and builds a request.
2. The browser shows the normalized target, policy class, affected tasks, redacted-log marker, and planned MCP action.
3. The user must explicitly confirm the reviewed target. The prompt is size-bounded to 8000 characters.
4. The browser gateway validates local shape constraints: target presence, bounded prompt length, target-review match, reason text, and dry-run or confirmation.
5. The gateway sends a typed JSON MCP invocation to the configured transport. Prompt content remains a structured payload field and is never converted to command-line or shell input.
6. `ipfs_accelerate_py` evaluates supervisor policy, dependency state, branch protections, confirmation policy, and budget controls.
7. `ipfs_kit_py` persists immutable evidence or receipts. Available governed responses must include an `ipfs_kit_py` receipt; missing receipts are normalized to `receipt_unavailable`.
8. `ipfs_datasets_py` indexes searchable task, goal, and run-history records.
9. The browser receives `available`, `unavailable`, or `denied` and renders the exact state, including the correlation ID and immutable receipt on acceptance.

Prompt content must be redacted in logs and receipts whenever prompt text is not required for the policy decision display. The browser and gateway use `[prompt redacted]` as the display and log projection while preserving only prompt length, target, planned action, correlation ID, and receipt references.

This model keeps the Agent Supervisor Console operational in browser contexts while preserving backend ownership and policy authority.
