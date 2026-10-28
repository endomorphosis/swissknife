# SVF driver integration contract

The independent campaign validator is
`scripts/swissknife_visual_functional_worker.py` in the containing workspace.
This short interface description supplies implementation context; its checks
remain authoritative. Do not weaken the validator or manufacture observations.

The runner uses the actual canonical app launcher/window and owned Chrome/Vite
lifecycle. Use existing manifest, executable backend contract, MCP++ gateway,
transport and UCAN validation. Never replace the app with `setContent`, synthetic
controls, hidden success markers, arbitrary script evaluation, or a mock owner.
Preserve the stage1 scenario admission/observation interfaces. A scenario has
three phases: `primary_result`, `persist_reopen`, `failure_recovery`. Actual values
come from DOM/media/owner reads; expected values are never an observation source.

CLI from workspace root:

```
node swissknife/scripts/run-visual-functional-workflow.mjs \
  --app <canonical-id> \
  --contracts swissknife/config/visual-functional-app-contracts.json \
  --output-dir data/agent_supervisor/swissknife_visual_functional/tasks/<id>/verification
```

Load the app scenario from `swissknife/test/e2e/functional-workflows/<app>.json`;
fail before resource acquisition if it is absent or invalid. Reopen the real
app with the same isolated test state. Actions are bounded and scoped to its
actual window. Observe failure before recovery; do not assert success only at
the end of a sequence of emitted events. Test writes require actual UI consent
and bounded isolated fixtures. External accounts and user data are out of scope.

## Input scenario JSON

`validateScenario(scenario, app)` in `scripts/run-visual-functional-workflow.mjs`
defines this input grammar. Narrative workflow descriptions are not executable
scenarios. Unknown fields are rejected. Output fields such as `actual`, `passed`,
`observed`, `checks` and `backend_observations` never belong in an input scenario.

The file `test/e2e/functional-workflows/<app_id>.json` must be a bounded regular
in-repository file (at most 1 MiB), with these exact required root fields:

| Field | Shape |
| --- | --- |
| `schema` | Exactly `swissknife.visual-functional-scenario.v1` |
| `app_id` | Selected canonical app ID from `config/visual-functional-app-contracts.json` |
| `fixture_scope` | Isolated namespace matching `^svf-[a-z0-9][a-z0-9-]{2,100}$` |
| `phases` | Object with exactly `primary_result`, `persist_reopen`, `failure_recovery`; each is an array of 1–64 steps |
| `backend_bindings` | Explicit array of selected binding intents; `[]` for local/external/policy apps |

Only `description` and `variables` are optional root fields. `variables` is plain
JSON data, at most 16 KiB; the runner does not interpolate it into action inputs.
Every step uses `op`, not `action`, with exactly the following other fields:

| `op` | Required fields besides `op` | Optional fields |
| --- | --- | --- |
| `click`, `check`, `uncheck` | `selector` | None |
| `fill`, `select` | `selector`, `value` (string, at most 8192 characters) | None |
| `press` | `selector`, `key` (Playwright key string such as `Enter`, at most 80 characters) | None |
| `wait_for` | `selector`, `state` (`visible`, `hidden`, `attached`, `detached`) | `timeout_ms` (integer 1–15000) |
| `wait_ms` | `milliseconds` (integer 0–5000) | None |
| `reopen_app` | None | None |
| `capture` | `label` matching `^[a-z][a-z0-9-]{0,63}$` | None |
| `assert` | `probe`, `operator`, `expected`, and exactly one of `requirement_id`/`checkpoint_id` | None |

CSS selectors are at most 512 characters and resolve within the actual app's
`.window-app-content`; action/observation targets must be unique. `count` counts
matching descendants instead. XPath, alternate selector engines, `>>`, parent
traversal and proof-marker selectors are refused. `reopen_app` closes/reopens the
native app with the same browser storage. There is no script/evaluate, request,
tool-call, file-upload, shell or arbitrary filesystem action. Secret controls
cannot be filled or observed.

Every DOM probe requires `kind` and `selector`. Its exact additional fields are:

| `kind` | Required extras | Optional extras / value |
| --- | --- | --- |
| `text`, `value`, `checked` | None | Actual text, input value, Boolean checked state |
| `count` | None | Optional `within` selector; descendant count |
| `image_state`, `media_state` | None | Optional `pointer`, `temporal_ms`; structured actual state |
| `json_attribute` | `attribute` (nonsensitive `data-*` name) | Optional `pointer`, `temporal_ms`; parsed JSON |
| `dom_property` | `property` from the enum below | Optional `temporal_ms`; numeric/Boolean property |
| `backend_result` | `binding_id`, `pointer`; **no selector** | Actual field of a verified raw owner receipt |

The `dom_property.property` enum is `currentTime`, `duration`, `paused`, `volume`,
`muted`, `playbackRate`, `readyState`, `naturalWidth`, `naturalHeight`, `disabled`,
`selectedIndex`, `scrollTop`, `scrollLeft`, `scrollWidth`, `clientWidth`,
`scrollHeight`, `clientHeight`, `focused`, `visible`. Image state has `decoded`,
`natural_width`, `natural_height`, `visible_area`; media state has `decoded`,
`current_time`, `duration`, `paused`, `error_code`, `visible_area`.
`pointer` is RFC6901, begins `/`, is at most 2048 characters and uses `~0`/`~1`
escapes. A `temporal_ms` integer of 50–1000 samples the same element twice and
returns **after minus before**. It requires a numeric `dom_property` or a numeric
field selected by `pointer`; it does not return the final absolute value.

`operator` is exactly `equals`, `not_equals`, `contains` or `at_least`; `expected`
is finite typed JSON. `contains` tests a nonempty substring for text, or typed
membership of a non-null expected element for arrays. `at_least` requires numbers
and a strictly positive expected threshold. Actual values are always observed.

Bind assertions to this app's `primary_workflow` contract:

- `primary_result` asserts each `result_1` … `result_N` exactly once, where N is
  `expected_results.length`. The runner supplies exact requirement texts; the
  scenario supplies meaningful expected values for actual probes.
- `persist_reopen` contains `reopen_app` before its one
  `requirement_id:"persist_reopen"` assertion.
- `failure_recovery` first asserts `checkpoint_id:"error_observed"`, then performs
  a recovery action, then asserts `requirement_id:"failure_recovery"`. Wait,
  capture and assert alone do not count as recovery. IDs cannot be duplicated,
  moved between phases, or supplied together on one assertion.

There are no general positive checkpoints: `checkpoint_id` is supported only
once as `error_observed` in `failure_recovery`. Every positive assertion uses
one existing semantic requirement ID exactly once. Put additional native byte
checks in the binding's `result_assertion`; the runner collects and verifies
those actual owner proofs before accepting the workflow. Do not invent extra
checkpoint IDs to wait for an operation or to add positive observations.

Runtime acceptance also requires a native DOM primary-result assertion and a
focused `press` followed by its semantic assertion before another UI action.
Merely emitting events does not prove the intended result.

For `tool_backed` apps, select a nonempty subset of exact IDs from
`app.backend_roles[].bindings[]` relevant to this workflow. Every intent has
exactly `binding_id`, `mode`, `consent`, `max_duration_seconds` (integer 1–120),
`max_output_bytes` (integer 1–1048576), optionally
`result_assertion:{pointer,operator,expected}`. A canonical nonmutating binding
requires `mode:"read",consent:"not_required"`; a mutating binding requires
`mode:"isolated_mutation",consent:"ui_required"`. Do not add owner, tool,
transport or capability fields: those identities come from the canonical
binding and actual app-originated `/mcp/tools/call`. Every selected binding needs
real execution and semantic raw-result proof through `result_assertion` or a
`backend_result` assertion. Its pointer selects native output under
`/result/result/`, excluding receipt identity under `/result/result/receipt`.
Dry runs cannot prove execution. An isolated mutation requires actual native UI
confirmation and a payload `fixture_scope` matching this scenario namespace.
Local/external/policy apps require `backend_bindings:[]`. A scenario grants no
permission to write controller/test/receipt files, fabricate proofs, import
credentials, read host paths, or dispatch to arbitrary owner endpoints.

### Authored admission fixture example

This example uses `scenarioFor`/`unitDesktop` in
`test/scripts/visual-functional-workflow.test.mjs`. It passes schema admission,
not app acceptance. These selectors belong to that Calculator DOM unit fixture;
real app scenarios must use their actual controls and semantic expectations.

```json
{
  "schema": "swissknife.visual-functional-scenario.v1",
  "app_id": "calculator",
  "fixture_scope": "svf-doc-admission-fixture",
  "backend_bindings": [],
  "phases": {
    "primary_result": [
      {"op":"fill","selector":"#input","value":"12.5*4"},
      {"op":"press","selector":"#input","key":"Enter"},
      {"op":"assert","requirement_id":"result_1","probe":{"kind":"text","selector":"#result"},"operator":"equals","expected":"50"}
    ],
    "persist_reopen": [
      {"op":"reopen_app"},
      {"op":"assert","requirement_id":"persist_reopen","probe":{"kind":"text","selector":"#result"},"operator":"equals","expected":"50"}
    ],
    "failure_recovery": [
      {"op":"fill","selector":"#input","value":"1/0"},
      {"op":"press","selector":"#input","key":"Enter"},
      {"op":"assert","checkpoint_id":"error_observed","probe":{"kind":"text","selector":"#error"},"operator":"contains","expected":"zero"},
      {"op":"click","selector":"#clear"},
      {"op":"assert","requirement_id":"failure_recovery","probe":{"kind":"text","selector":"#result"},"operator":"equals","expected":"50"}
    ]
  }
}
```

Validate a real scenario before requesting a browser run. From the containing
workspace, this command performs admission only, with zero Chrome/MCP calls:

```sh
node --input-type=module - image-viewer <<'JS'
import fs from 'node:fs';
import {validateScenario} from './swissknife/scripts/run-visual-functional-workflow.mjs';
const id = process.argv[2];
const app = JSON.parse(fs.readFileSync('swissknife/config/visual-functional-app-contracts.json', 'utf8')).apps.find(a => a.app_id === id);
validateScenario(JSON.parse(fs.readFileSync(`swissknife/test/e2e/functional-workflows/${id}.json`, 'utf8')), app);
console.log('Scenario admitted; functional acceptance not evaluated.');
JS
```

Positive examples and rejection cases are in
`test/scripts/visual-functional-workflow.test.mjs`: `scenarioFor`, `backendVector`
and the stage1/2/3 tests. A syntax-only `json.tool` check cannot replace admission.

## Native backend execution

Native application actions use `invokeNativeTool(container, appId, bindingId,
{executionMode: 'execute', toolId, payload, trigger})` for actual execution.
Import this canonical ESM API from `../live-tool-gateway.js` in `web/js/apps/`
modules, or `./live-tool-gateway.js` in `web/js/`; it is not a `window` global.
The readonly `/mcp/tools/bindings?app_id=<app_id>` response exposes `controls`
with per-tool `safe_payloads` defaults. Use those qualified CIDs/model inputs
and the actual owner argument schema; apply the user's intended input without
inventing a CID, host path, model, or an unsupported operation.
Use the app contract's exact `backend_roles` binding IDs, tool candidates and
transports. Consent belongs to the binding's policy, not the tool's name:
`mutates_remote_state` or a policy class other than `read`/`media_capture`
requires the real gateway confirmation. A binding using `ipfs_cat` can therefore
still be governed. An ungoverned read has no confirmation dialog; its scenario
must await and assert the actual owner result instead of waiting for a button
that cannot appear. This does not waive governed consent or backend proof.

The existing default remains preview for governed bindings, and the global
force-preview setting takes precedence. For a governed real call, the shared
gateway displays the actual execution confirmation dialog and waits for a
trusted browser click. A scenario must click the visible
`[data-gateway-confirm="<binding_id>"]` after activating the app's action.
Application code must never poll or programmatically click that confirmation.
Synthetic clicks cannot authorize real execution. Cancellation sends no call.

Confirmation authorizes dispatch; it does not mean the owner operation has
finished. Before an assertion or reopen, use a bounded `wait_for` on the app's
actual result readiness (for example a verified retrieved CID, a completed run
state, or acknowledged saved-project state). Do not substitute fixed sleeps,
synthetic proof labels, or an immediate assertion against a still-pending UI.

Keep the native window frame inside its desktop/mobile viewport. App-scoped
flex containers need `min-height:0` and their own internal scrolling so that
focusing a lower control cannot scroll the entire frame outside the window.
Preserve the shared backend controls and original geometry checks.
Never synthesize, relocate or poll for gateway consent controls in app code.
`invokeNetworkNativeTool(container, appId, tool, payload, trigger)` accepts an
exact reviewed `mcp++:ipfs_kit_py/...` operation key, not an app binding ID. It
does not forward an `executionMode` option; use the canonical `invokeNativeTool`
API above for real binding execution. A missing reviewed operation or a policy
denial is a distinct failure from a hidden governed confirmation control.

Use the actual controlled fixture CID and bytes from the configured owner;
never invent a plausible CID. Catalog availability, local artifact-cache bytes
and setup probes are not application execution proof. The program's configured
backend URLs are passed explicitly to each workflow subprocess. Real Kit reads
must reach its native Python SDK service through the MCP++ facade; compatibility
cache responses cannot substitute for native execution.

## Generated workflow report

`workflow.json` requires:

- `schema`: `swissknife.visual-functional-workflow.v1`, canonical `app_id`,
  `passed:true`, `source_template:false`, `actual_desktop:true` only on real success.
- `contract_sha256`: current contracts file SHA-256. `source_sha256` maps every
  app manifest source path, prefixed `swissknife/`, to current file SHA-256.
- `artifacts`: nonempty `{path,sha256,bytes}` records. Paths are workspace-relative,
  confined to this report directory, never symlinks. Retain actual desktop/mobile
  PNGs, trace and raw owner evidence, not labels referring to missing files.
- `checks`: unique `kind` values including `primary_result`, `keyboard`,
  `desktop_layout`, `mobile_layout`, `error_recovery`, each with `passed:true` and
  `observation:{operator,actual,expected}` independently computed from browser reads.
- `semantic_assertions`: exactly `result_1` through `result_N` for the contract's
  expected results, plus `persist_reopen` and `failure_recovery`. Each has its
  exact `requirement_text`, `passed:true` and `observed:{operator,actual,expected}`.
  Failure text equals contract.error + ` Recovery: ` + contract.recovery.

Typed operators are `equals`, `not_equals`, `contains`, `at_least`. JSON types
matter: false is not zero. Reject non-finite numbers and empty expected contains
values. `at_least` uses actual numbers and a strictly positive expected number.
Image/media probes support the `pointer` and `temporal_ms` field/delta reads
documented above. Extend scenario
admission and independent tests together; never compare a copied expectation or
claim that a decoded, stationary frame establishes playback. Positive primary
media observations require actual decoded, visible, advancing, unpaused media.

Tool-backed apps require nonempty genuine `backend_observations`. Every entry
has `owner`, `tool_id`, actual `transport` (`http`/`libp2p`), `correlation_id`,
`route:"/mcp/tools/call"`, `outcome:"executed"`, `receipt_id`, `event_dag_cid`,
`receipt_verified:true`, `semantic_result_verified:true`, `receipt_artifact`,
`event_artifact`, and `result_assertion:{pointer,operator,actual,expected}`.

Both raw artifact paths must be in `artifacts`. Preserve bytes obtained from the
real mediated owner, whose content hashes match their actual CIDv1/raw/SHA-256
IDs. Native receipt and event payloads have their respective `kind` plus `call`
and `result`. Their calls agree on owner/tool/correlation/route/transport/app and
input.correlation_id; receipt/event calls and native results must match. The
native receipt tool at `payload.result.result.receipt.tool` equals `tool_id`.
Reject native isError/error/failed/denied/unavailable outcomes recursively. The
bounded RFC6901 pointer resolves within retained receipt JSON; its pointed value
must equal assertion.actual before the typed assertion is evaluated. Never
derive a success proof or CID from fabricated wrapper data to satisfy this
format; missing genuine capability is a failed verification and a repair gap.

Browser-local, external-provider and policy-blocked apps require exactly
`unexpected_backend_calls:0` and `backend_observations:[]`. Enforce their actual
boundary while observing requests, rather than writing zeros unconditionally.

Stage2/3 foundation checks test real implementation and independent rejection
cases; unit fixtures are explicitly fixtures and cannot establish app acceptance.
The Calculator pilot runs actual arithmetic, keyboard arithmetic and clear/retry
recovery at both viewports. Its `pilot.json` schema is
`swissknife.visual-functional-driver-pilot.v1`, `app_id:"calculator"`,
`actual_desktop:true`, `foundation_integration_only:true`, `functional_acceptance:false`.
Its three observation kinds are `arithmetic_result`, `keyboard_result`, and
`clear_recovery`, each with typed `observation`. Retain `desktop.png`, `mobile.png`
and source hashes for the runner and `swissknife/web/js/apps/calculator.js`.
`--foundation-check pilot --output-dir <dir>` runs the real pilot. A pilot is
driver integration evidence; full app acceptance still requires all contracts,
reopen, failure recovery and final visual review through the separate app tasks.

## Optional saved-PNG error checkpoint

This additive exception amends the single-checkpoint wording and the `assert`
optional-fields cell above. Existing scenarios remain valid. No other new
checkpoint IDs are supported.

After `error_observed`, `failure_recovery` may contain one assert with
`checkpoint_id:"error_image_retained"`, an `image_state` probe without
`temporal_ms`, and this additional step field:

```json
"retained_from": {"primary_result": 11, "persist_reopen": 6}
```

The example indices are zero-based within each named phase. Supply the actual
indices of that scenario's original `image_state` assertions: a `result_N` in
`primary_result` and `persist_reopen` in its phase, each in 0-63. The field is
invalid on other steps. A checkpoint cannot also have `requirement_id`.

The image checkpoint must follow the observed error before any recovery UI,
owner-result assertion or semantic completion assertion. Only passive
wait/capture and non-semantic, non-owner assertions may intervene. All original
result, reopen and recovery requirements remain mandatory.

Within each independent viewport, the consumer verifies the native PNG artifact
at each exact referenced phase/step/literal selector, then requires error,
primary and reopen PNG content SHA, native source SHA and dimensions to match.
It proves retained saved IMG bytes only: it does not equate CSS selectors or
infer canvas pixels, layer contents, owner effects or successful recovery.


### Native saved-image observation after recovery

The optional `checkpoint_id: recovery_image_retained` extends the retained-image
checkpoint grammar above. It is a non-semantic `assert` in `failure_recovery`
with a native `image_state` probe and the same exact `retained_from` keys
(`primary_result`, `persist_reopen`). Each reference names an existing declared
native image assertion and its exact selector. It introduces no new requirement
ID and cannot replace or duplicate any original semantic assertion.

Keep the single original `error_observed` checkpoint. An optional
`error_image_retained` still belongs after that error and before recovery actions.
A `recovery_image_retained` belongs strictly after the unique original
`failure_recovery` semantic result, with at least one real declared UI retry action
between the error and that result. Only passive captures/waits may intervene
between the result and this checkpoint or follow it. These three named roles
are unique; unknown, duplicate, misplaced or additional checkpoints are refused
before browser execution. Old scenarios with only the error checkpoint, or
with the earlier optional retained-image checkpoint, remain valid.

The producer retains actual native PNG bytes for the post-result snapshot.
The independent consumers verify its artifact and its native content hash,
source-URI hash and dimensions against its own declared baseline observations.
Each checkpoint uses its own references. Matching native saved IMG bytes does
not establish canvas pixels, editable layers, an unobserved time, an owner write
or a rendered export. The legacy `error_observations` array carries these typed
checkpoints; its name grants no error, recovery or acceptance authority.
