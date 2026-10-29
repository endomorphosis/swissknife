# Protected native backend foundations for the SwissKnife supervisor

This source is an implementation contract, not acceptance evidence. Only the original protected validators and current native observations qualify each foundation. App acceptance remains separate.

Source snapshot: PUBSUB-API-CONTRACT.md; SHA-256 7a89384f7bf5662bd9653d4222875da38f13e6961472de82cdbf3f0755f9f1ec.

# Protected SVF-043 pubsub contract

Draft implementation contract, not a qualification receipt. Actual qualification runs only beneath the original leased backend-repair worker. No HOLD/main-inactive requirement applies to runtime qualification; plan/source adoption remains separate maintenance.

Protected gate CLI (unchanged proposal command):

```
python3 -B scripts/svf_backends/validate_pubsub_foundation.py --profile config/swissknife_visual_functional_supervisor.json --ensure-owned-services --verify --output-root data/agent_supervisor/swissknife_visual_functional/tasks/SVF-043/qualification
```

The gate loads only the protected, registered `foundation_service_ownership.py`, calls `ensure_owned_services(root, family='kit-pubsub', expected_sources=<six current source SHA256s>, output_dir=<fresh attempt>)` BEFORE importing candidate SDK code, then `inspect_registered_pubsub_peers(root)`. Missing/draft registration, source mismatch, foreign/occupied listeners, lost lease/caller ancestry, or Chrome ownership refuses. These helper calls own all service controls. Gate never installs units, starts arbitrary commands, changes daemon configuration, removes data/HOLD or resets budgets.

## Six source inputs and protected owners

The exact source closure is the existing common-helper REQUIRED_SOURCES for kit-pubsub: new `external/ipfs_kit/ipfs_kit_py/assurance/pinned_pubsub.py`, `scripts/svf_backends/native_pubsub_backend.py`, `scripts/svf_backends/owned_pubsub_peers.py`, existing `native_kit_service.py`, `swissknife/scripts/ipfs-kit-native-forwarder.cjs`, and `start-ipfs-kit-mcp-compat.cjs`. Model edit permissions are the separately reviewed task manifest, never expanded by this gate. Registration, sidecar units/config, gate/tests/common helper are protected. The original pinned_ipfs.py, primary storage5031 and legacy5021/8091 remain unchanged.

Registered peer dictionaries use roles `a`,`b`, APIs `http://127.0.0.1:5032`,`http://127.0.0.1:5033`, distinct node_id/repo_path/PID, and fields pid,start_ticks,uid,cgroup,executable_path,executable_sha256,unit,swarm_multiaddr. These are actual kernel/SDK identities returned by the protected helper. Both peers are already separately root-registered and loopback-only; no arbitrary endpoint/peer/command arrives through a browser request.

## New public SDK

`ipfs_kit_py.assurance.pinned_pubsub.LivePinnedPubsubAdapter(api_url: str, timeout: float=10)` is the genuine new SDK capability. Never modify/relabel pinned_ipfs.py or call its durable `_success` for pubsub. Expose the actual validated canonical `api_url` used for transport, simulated=False, live_provider=True, transport_kind='http'; no injected transports in live qualification. Define the new class's observed public methods (including __init__) in pinned_pubsub.py itself; reusing pinned_ipfs utilities is permitted without changing that file, but inherited methods must not be falsely attributed to the new source.

* `subscribe(topic: str, *, deadline: float, cancel_event: threading.Event, max_frames: int, max_bytes: int)` returns a closeable context manager/iterator. Each item is a mapping containing `raw_frame: bytes`: one actual Kubo NDJSON line, without synthetic normalization replacing the raw bytes. `close()` and context exit must interrupt blocked readers and join owned resources.
* `pubsub_publish(topic: str, data: bytes, *, deadline: float, cancel_event: threading.Event)` returns a mapping with `accepted is True`, `durable is False`, `effect_kind == 'EXTERNAL_NOTIFY'`, `state == 'ACCEPTED'`, fresh nonempty request_id and operation_id. It MUST NOT claim delivery, backend durability, COMMITTED, or echo-generated success. HTTP ACK alone is accepted only.
* `pubsub_peers(topic: str, *, deadline: float, cancel_event: threading.Event)` returns a bounded list of actual peer-ID strings.
* `swarm_connect(multiaddr: str, *, deadline: float, cancel_event: threading.Event)` performs the actual SDK connection. Bridge/gate restrict the argument to the other registered owned peer.

Use actual Kubo0.39 multibase arguments/data/topics/seqno (pub topic passed as multibase, message as multipart payload). `from` is actual peer-ID text. Streaming must be bounded by deadline, cancellation, frame count and bytes. Do not use legacy pubsub-ls as a subscription or local callbacks as peer delivery.

## Canonical MCP tool, unchanged app contracts

Facade `http://127.0.0.1:18316/mcp`, exact tool `ipfs_pubsub_publish`. Foundation payload has exactly fixture_scope=`svf-pubsub-043`, topic=`svf.pubsub.<32 lowercase UUID hex>`, message_id=<canonical UUID>, message=<UTF8,1..4096 bytes>, dry_run=false, correlation_id=<bounded string>. Acknowledgement topic is `<topic>.ack`. No supplied API URLs, process commands, filesystem paths, peer identities, raw validator output or consent bypass. Existing app scopes are explicitly root-registered; original app UI consent remains mandatory when later apps call this route.

Native payload (inside the ordinary MCP content JSON block) has schema `swissknife.native-pubsub-exchange.v1`, backend=`ipfs_kit_py.assurance.pinned_pubsub:live-kubo-http`, success=true, accepted=true, durable=false, delivery_state='delivered', replayed=boolean, message_id, topic, message_sha256, sender_peer_id=a.node_id, receiver_peer_id=b.node_id, receiver_frame_base64, ack_frame_base64, native_provenance. Existing storage tools keep their current schemas/strict guards.

First successful call: replayed=false. Retrying identical message_id/topic/message returns the SAME actually observed frame tuples with replayed=true and emits no second message. Conflicting reuse fails. Never return delivered on offline receiver, timeout/cancel, merely HTTP ACK, stale/self frames or fabricated publisher echo. Queued/accepted states are explicitly non-delivered and preserve exact unsent input for a later governed retry.

Raw receiver data must equal exact `message.encode('utf8')`, sender must be peer A, topic exactly requested. Raw ACK must come from peer B on `<topic>.ack`, with bytes equal canonical JSON (sorted keys, compact UTF8):

```
{"message_id":"<same UUID>","message_sha256":"<SHA256(message UTF8)>","receiver_peer_id":"<A>","schema":"swissknife.pubsub-ack.v1","sender_peer_id":"<B>","topic":"<original topic>"}
```

Both NDJSON frames require actual nonempty multibase seqno, matching topicIDs and sender. Base64 transport is canonical padded standard base64; raw Kubo fields use actual multibase (`u/U/m/M` accepted by protected decoder). No raw tracebacks/secrets.

native_provenance: schema `swissknife.native-kit-pubsub-execution.v1`, owner `ipfs_kit_py`, sdk_class `ipfs_kit_py.assurance.pinned_pubsub.LivePinnedPubsubAdapter`, sdk_method `pubsub_publish`, sdk_source_sha256, bridge_source_sha256, service_source_sha256 matching current source inputs, sdk_request_id, sdk_operation_id, transport='http', simulated=false, cache_fallback=false, effect_kind='EXTERNAL_NOTIFY', durable=false, state='ACCEPTED', correlation_id, observed_at (fresh UTC), work_complete=false, completion_authority=false.

## Independent live gate

The protected gate subscribes directly to both actual Kubo HTTP streams in addition to calling the actual public SDK subscriptions. An initial SDK publish is joined to both SDK and independent receiver frames. It then invokes the canonical MCP tool, joins independent B receive + A ACK to the SDK observations and the bridge's raw frames, verifies actual receiver identity/topic/seqno/bytes/hash and fresh request/message identity, and checks idempotent retry emits one unique receiver event. No implementation delivered flag can replace these observations. All raw frames, MCP envelopes, identities and source hashes are immutable, hashed per-attempt artifacts. Peer process identities/source bytes are rechecked after capture. A capsule references the protected report hash; no task/app completion authority is granted.

Authored contract tests exercise rejection paths and cannot produce live qualification. Actual gate execution is blocked until protected registration and the new real SDK/bridge are present. Original343/493 UI/workflow/visual/receipt gates remain mandatory.

## Explicit first-foundation scope

First SVF-043 draft qualifies online independent two-peer SDK/MCP delivery+ACK+dedup and actual publication to a fresh unsubscribed topic as NONdurable accepted-only. Contract tests reject malformed, stale, self, wrong peer/topic/bytes, cancel/offline/queue packets that pretend to be positive delivery. This does **not** qualify a real stopped-node bridge queue or recovery. No receiver stop hook is used. A future additional protected recovery gate needs its own crash-safe restore owner; original343/493 offline/recovery acceptance remains unchanged and pending. No first-foundation capsule grants that completion authority.

## Protected SDK-chain observation

The protected registered `scripts/svf_backends/foundation_native_entrypoint.py` exports `read_snapshot(root, *, family='kit-pubsub', invocation_id=<actual native service InvocationID>)`. It is pinned by protected registration before import. The gate snapshots before/after the canonical MCP calls, validates the actual native PID, kernel birth, cgroup and process `INVOCATION_ID`, and requires novel events inside that monotonic observation window. The gate's own direct SDK probes run in a different PID and cannot satisfy this chain.

Snapshot schema is `swissknife.foundation-sdk-call-snapshot.v1`; observer schema is `swissknife.foundation-sdk-call-observer.v1`. Each event has schema `swissknife.foundation-sdk-call-event.v1`, native PID/birth/InvocationID, sequence/call UUID/thread/time, SDK module/class/method/source path+SHA/code SHA, sanitized arguments, phase, bounded result, and optional actual iterator `frame:{sha256,bytes}`. Source path is exactly the repo-relative pinned_pubsub.py path. Public SDK module is `ipfs_kit_py.assurance.pinned_pubsub`, class `LivePinnedPubsubAdapter`. Subscribe stream events retain that subscription call_id; hashes cover the exact original `raw_frame` bytes, including its newline. Event references identify immutable0600 per-event JSON under the fixed runtime `backends/foundation-call-witness/kit-pubsub/<InvocationID>/events` directory. The gate reopens each regular, nonsymlink reference, verifies bytes/SHA and actual JSON against the snapshot, and rechecks source/process identity after collection.

The gate requires native A publish and native B ACK publish enter/return events with actual accepted-only SDK result; message publish request_id/operation_id must match returned provenance. It requires native B/A subscribe enter/stream events matching the actual receiver/ACK raw frames already independently joined by sender/topic/seqno/payload. The message itself is fresh canonical JSON `{schema:'swissknife.pubsub-message.v1',message_id:<UUID>,nonce:<random>}` so the protected observer can safely identify a controlled message without recording arbitrary body text. Missing trace, old invocation, modified history, wrong source, absent subscribe/publish or invented delivery flags fail qualification. These observations are explicitly `observational_only:true`, `authenticated_origin:false`, `completion_authority:false`: there is no claim of cryptographic isolation from other code running under the same OS user.

## Actual canonical refusal probes

Runtime qualification invokes actual `ipfs_pubsub_publish` through the registered18316 MCP route with fresh malformed requests: unknown fixture scope, dry_run=true, wrong topic prefix, malformed UUID, message exceeding4096 UTF8 bytes, and each forbidden `api_url`, `argv`, `path` field. Each request has a fresh protected HTTP B subscription ready before dispatch. Every response must be an actual MCP `isError:true`, with no positive delivery/acceptance/durability claim, and zero independent B frames in the declared250ms observation window. The native trace must contain no corresponding public SDK publication. Raw bounded request/response artifacts are retained. Pure argument tests alone cannot satisfy these runtime probes. Positive retry dedup has its separate declared500ms observation window; neither window claims indefinite absence of future traffic.

Root-controlled readonly configuration explicitly allows only `svf-pubsub-043`, `svf-p2p-chat-g030`, `svf-p2p-chat-classic`. This foundation gate exercises only the first. The two app scopes authorize their existing governed route, not completion or replacement of original343/493 browser/receipt/visual/offline/recovery checks. Unknown scopes and browser-supplied endpoints/commands/paths remain refused. The runtime bridge must read this fixed root-owned configuration, never accept a caller-supplied allowlist.

On failure the gate preserves bounded actual frames and RPC envelopes captured in that attempt as immutable hashed artifacts plus `failure.json`, then rethrows the original refusal. It does not emit a positive qualification or change task status. Partial SDK construction and subscription startup use owned-resource cleanup even when admission fails.

## Explicit bounded capture lifecycle

The protected startup observer delegates ordinary SDK calls without recording when no valid capture is armed. A foundation gate cannot arm arbitrary logging or change a service command. The protected helper, after the verified leased caller/source/reload checks, creates one immutable `capture.json` beneath the actual native InvocationID. It returns `sdk_call_witness` with schema `swissknife.foundation-sdk-call-capture-ref.v1`, family, invocation_id, capture_id, observer_source `{path,sha256}` and capture `{path,sha256,bytes,capture_id,expires_at}`. The gate also reads the helper's sealed ownership_witness file and verifies its hash, actual native identity, source map, lease_id and foreground start-ticks; these must match the capture's owner.

Capture schema is `swissknife.foundation-sdk-call-capture.v1`, with exact capture_id, family, invocation_id, task_id=`SVF-043`, native_process `{pid,start_ticks}`, lease_id, foreground_birth (Linux start-ticks string), numeric issued_at/expires_at UNIX epochs, expected_sources, observational_only=true and completion_authority=false. It must be currently active with a maximum300second lifetime and exactly the current six-source map. Snapshot.capture returns `{reference:{path,sha256,bytes},value:<actual capture>}` and snapshot.capture_faults returns bounded immutable fault records. The gate reopens the actual0600 regular capture file, compares its JSON/bytes/SHA to both helper and snapshots, requires unchanged capture before/after, and rejects any fault, expiry, owner/source mismatch or missing required native calls. Event.capture_id and capture_sha256 must match this exact capture; other captures cannot provide evidence. A bounded observer overflow disables capture without changing ordinary SDK behavior, and missing trace still cannot qualify. No persistent ring, truncation or global event cap is used as an availability promise.


Source snapshot: SUPERVISOR-CONTRACT.md; SHA-256 aa8ab51d159145cfe2ab350c406a87dd58e6685bc759916490b5a0e3baf15673.

# Protected R13 supervisor fixture contract (draft, not admitted)

No runtime backend implementation is provided by this bundle. Its three protected Python programs and contract tests define acceptance for future SVF-044. The live gate refuses missing registration, helper, source, capability or real proof. RAM SDK qualification does not grant production MCP or app acceptance.

## Protected source boundary

Install these only after root review, with immutable registered SHA256 values and no model edit permission:

- scripts/svf_backends/fixed_supervisor_worker.py
- scripts/svf_backends/fixed_supervisor_output_validator.py
- scripts/svf_backends/validate_supervisor_foundation.py
- tests/test_svf_supervisor_foundation_contract.py

The implementation may edit only the four SVF-044 declared backend/native/facade files. The canonical 45-app contract, SDK source, these protected programs, controller, phase/recovery budgets and old boards remain read only. Do not import or instantiate quarantined datasets_integration.WorkflowCoordinator. The literal wire tool name below is a compatibility alias; actual provenance names IntentRepository, DatabaseTaskSource and VerificationProcessRunner.

Existing CPU execution must remain unchanged. The protected gate fingerprints AST bodies for inference_arguments, safe_runtime and WarmInferenceWorker, preserves the entire original NativeAccelerate.call body as a suffix and preserves ordinary ALIASES. Add exactly one prefix `if tool == 'WorkflowCoordinator.submit_task' or (type(args) is dict and 'fixture_mode' in args):` before original call logic; do not attach an else or intercept ordinary calls. This explicit guard is protected by the gate's AST check. Existing get_task without fixture_mode remains ordinary CPU job_status; submit_task remains genuine CPU inference. Native backend warm engine/source and current offline GPT-2 limits are outside implementation scope. Catalog readiness is bounded15s after the independently verified fresh native/facade generation. No extra inference is used by this gate.

## Ownership and CLI

Live task check:

`python3 -B scripts/svf_backends/validate_supervisor_foundation.py --profile config/swissknife_visual_functional_supervisor.json --ensure-owned-services --verify --output-root data/agent_supervisor/swissknife_visual_functional/tasks/SVF-044/qualification`

The gate calls root-authored `foundation_service_ownership.ensure_owned_services(root, family='accelerate-supervisor', expected_sources=..., output_dir=...)`. It does not implement its own service control. The original main may be active, HOLD must be absent and the verified original worker must hold the physical checkout lease; the ownership helper enforces these facts, Chrome closure, exact unit/fragment/env/argv/source ownership and fresh native+facade PID births/InvocationIDs. It returns native_process, facade_process, mcp_url, runtime_root, expected_sources and immutable ownership witness path/hash. Missing/draft registration refuses before production qualification. Worker read-only --validate never calls this promotion gate.

Expected source map has four editable backend/native/facade files, four actual SDK files (IntentRepository, DatabaseTaskSource, VerificationProcessRunner, live resource_scheduler) and the two protected fixed programs. The source map is snapshotted before reload and checked again after real qualification. The root helper independently registers the full protected closure. Gate output stays in SVF-044/qualification/attempt-<freshUUID>; raw records are immutable0600.

RAM-only prerequisite exercise:

`SVF_FOUNDATION_REPOSITORY_ROOT=<checkout> python -B <RAM>/scripts/svf_backends/validate_supervisor_foundation.py --sdk-self-test --output-root /dev/shm/<new-owned-directory>`

This explicitly reports production_mcp_ready=false. It uses an actual fresh DuckDB/SDK and actual tiny fixed children, never injected Popen/clock/host/capacity/model calls. `deny_all` is the runner's declared closed policy, not a kernel network namespace. Only these protected stdlib programs run; no arbitrary-code safety claim.

## Literal wire API

Canonical tool names: `WorkflowCoordinator.submit_task` and `get_task`. All fixture calls use `fixture_mode: "svf-goal-worker-v1"`. Reject unknown keys, wrong mode/fixture/run/task, caller code/argv/path/URL/SQL/validator/output/evidence. Server owns UUIDs, challenge, DB and fixed commands. There is no fallback to quarantined simulation, fabricated output, cached completion, or another taskboard.

Create arguments:

`{"fixture_mode":"svf-goal-worker-v1","action":"create","fixture":"dependency-output-v1","dry_run":false,"correlation_id":"<bounded string>"}`

Only fixture values dependency-output-v1, timeout-recovery-v1 and cancel-recovery-v1 exist. Server generates canonical UUID run_id and32hex challenge. DB is exactly `<registered runtime_root>/<run_id>/control.duckdb`, where runtime_root is `<checkout>/data/agent_supervisor/swissknife_visual_functional/backends/supervisor-fixtures`. New private0700 run, no symlinks/foreign DB. Create an actual objective, root goal, child goal with parent_goal_cid and `edge_kind='subgoal'`, plan and two tasks A→B. Tasks require original protected validation, never allow_completion_without_evidence. B is not ready until A's actual valid output completion. Goal status never follows heartbeat alone.

Successful create payload includes success:true, fixture_mode, run_id, challenge, database_path, objective_id, root_goal_cid, child_goal_cid, task_ids:{a:<actualSDK CID>,b:<actualSDK CID>}, native_provenance.

Dispatch/retry arguments:

`{"fixture_mode":"svf-goal-worker-v1","action":"dispatch","run_id":"<server UUID>","task_key":"a","dry_run":false}`

Actions dispatch/retry/cancel share only server run_id and task_key enum a|b plus bounded correlation. get_task accepts fixture_mode/run_id/task_key and returns actual task_id/status/output_sha256 plus provenance. Unknown run UUID, traversal or mode fails; no caller-selected path. An unready B refuses without spawning or changing its revision. Re-dispatch of successful A returns its existing record without new worker, output change or revision. A bounded retry after actual timeout/cancel runs a fresh fixed child/validator and preserves prior attempt history; it does not reset counters or invent completion.

Successful dispatch/retry payload includes `execution:{producer:{path:<absolute immutable JSON>,sha256:<hex>},validator:{path,sha256}}`. Both paths are beneath `<run>/attempts/...`. Each file is the actual SDK VerificationRunResult.to_dict(), including real command_argv/PID/process_group_id/lease/stdout/stderr/disposition/publication fences. The gate independently observes actual kernel child PID/birth/parent/argv/UID/process group and source hash while running; a model-authored passed flag or fake SDK-result JSON cannot satisfy this witness.

Native successful envelope is MCP content:[{type:"json",json:payload}], receipt:{owner:"ipfs_accelerate_py",tool:<exact requested name>,status:"ok",native_provenance:<identical object>}. Native provenance must contain schema:"swissknife.native-supervisor-execution.v1", owner:"ipfs_accelerate_py", simulated:false, cache_fallback:false, source_sha256:<exact expected10-source map>, and sdk_classes exactly:

1. ipfs_accelerate_py.agent_supervisor.task_sources.intent_repository.IntentRepository
2. ipfs_accelerate_py.agent_supervisor.task_sources.database_task_source.DatabaseTaskSource
3. ipfs_accelerate_py.agent_supervisor.verification.process_runner.VerificationProcessRunner

Preserve authenticated outer MCPP receipt/event handling. These fields are not sufficient acceptance by themselves: independent DB, output and kernel checks remain mandatory.

## Fixed commands and evidence-fenced completion

Use VerificationProcessRunner(require_resource_lease=True) with actual host, Popen and clock, explicit argv/hermetic environment/deadline/4096-byte stdout+stderr caps, stdin=None and a private artifact root. No shell or arbitrary stdin/program/path. Producer argv is exactly `<checkout>/external/ipfs_datasets/.venv/bin/python` (literal protected native alias, regardless whether the checker runs as python3), -I, -B, protected worker, --runtime-root, --run-id, --stage a|b, --challenge and --mode normal|timeout|cancel. Validator argv uses its separate protected file and omits mode. The gate checks the exact original validation argv in the SDK task.

Normal producer holds200ms for independent read-only kernel observation, then fsyncs one immutable canonical JSON file a.json or b.json. A result is SHA256("a:"+challenge). B verifies exact actual A bytes and returns SHA256("b:"+A.result+":"+challenge), binding predecessor_sha256. The separate validator imports no producer/implementation code; it independently recomputes and compares exact bytes. Producer stdout binds output SHA, own PID/birth/parent and protected source hash. The gate checks raw SDK stdout SHA/length plus kernel joins and independently validates bytes again. No task completes merely from stdout saying passed.

Call actual IntentRepository.record_attempt before each real dispatch; retain failed/cancelled attempt history and a separate admission before a real retry. Record actual validation using original argv, actual output digest and current attempt; CAS a freshly read revision with evidence digests and allow_completion_without_evidence=False. Actual DatabaseTaskSource/IntentRepository readback must show validation-dependent completion, B readiness and persistent records after a new SDK repository instance opens the DB. The gate reads actual objective/goal containment, acceptance, validators, task revisions and event history. Do not prematurely settle root/child goals.

Timeout-recovery-v1 initially runs A with protected mode timeout (2s hold), SDK deadline0.1s. Cancel-recovery-v1 initially runs A with mode cancel (2s hold), permits concurrent cancel after real child is observed, and passes actual VerificationCancellation to SDK. Both return MCP isError:true with JSON `error:{code:"supervisor_timeout"|"supervisor_cancelled"}`, fixture_mode and `execution:{producer:{path,sha256}}`. That raw SDK result must be timed_out/cancelled with publication_allowed=false, no output and a reaped exact child. Retry uses normal mode, new actual attempt and independent validation. Error/retry history remains retained. Cancel must not deadlock behind the dispatch lock.

No production route, app acceptance, service restart/reopen durability claim or all-task completion is established by the staged tests. Real live qualification remains pending until the implementation and registered helper exist and the protected gate actually passes. Original app552/553/cross930 browser, receipt/DAG and final visual checks remain separate.

## Mandatory opt-in native SDK call witness

The helper returns sdk_call_witness with the fixed protected observer source, immutable capture reference, UUID, expiry and native InvocationID. The gate verifies private capture bytes/hash, original leased foreground, task SVF-044, native PID birth, exact10-source map, <=300s lifetime and no capture faults. It reads snapshots only via the root-pinned foundation_native_entrypoint.py and verifies all immutable event references, exact source and original method marshal-code hashes. Missing/expired/faulted capture or incomplete calls refuses; ordinary production SDK calls outside the bounded capture continue unchanged and are not permanently logged.

For the fresh DB/run it requires actual native objective/root/child/task creation, DatabaseTaskSource.ready_tasks showing A then dependency-unlocked B, actual VerificationProcessRunner producer/validator calls joined to kernel PID/process-group/source evidence, matching record_validation_result output digest/original argv, and nested same-thread DatabaseTaskSource.compare_and_set_status -> IntentRepository.cas_task_status with evidence checking enabled. Timeout/cancel calls must also be observed, followed by actual validated retry. Calls must carry the actual current native_supervisor_backend.py source in their observed caller chain. The shim records no prompts, SQL, environments or stdout bodies.

Every runner call must report actual defaults: require_resource_lease, host_snapshot_is_none, popen_is_subprocess_popen, clock_is_time_monotonic, sleep_is_time_sleep, scheduler_is_sdk_type and host_sampler_is_sdk_function all true, plus the independently protected resource_scheduler source hash. These are observations of the actual runner instance, not browser/model-provided flags. Traces are explicitly observational and not cryptographically authenticated against hostile same-UID code. Root source review, physical lease and the independent DB/kernel/output checks remain necessary.


## Exact public signatures in the pinned supervisor SDK

These were read from the actual public classes without modifying the SDK or live taskboards.

```text
IntentRepository.__init__(self, database_path: 'str | Path | None' = None, *, bound_connection: 'Any | None' = None, owner_id: 'str' = 'intent-repository:local', session_id: 'str' = 'session:intent', install_schema: 'bool' = True, evidence_freshness_seconds: 'int' = 3600, lock_timeout_seconds: 'float' = 30.0, clock_ms: 'Any | None' = None) -> 'None'
IntentRepository.upsert_objective(self, *, objective_id: 'str', objective_alias: 'str', title: 'str', status: 'str' = 'open', priority: 'str' = 'P2', parent_objective_id: 'str' = '', body: 'Mapping[str, Any] | None' = None, expected_revision: 'int | None' = None) -> 'IntentReceipt'
IntentRepository.upsert_goal(self, *, goal_cid: 'str', goal_alias: 'str', title: 'str', objective_id: 'str' = '', parent_goal_cid: 'str' = '', ordinal: 'int' = 0, status: 'str' = 'open', body: 'Mapping[str, Any] | None' = None, expected_revision: 'int | None' = None) -> 'IntentReceipt'
IntentRepository.link_goal_edge(self, *, parent_goal_cid: 'str', child_goal_cid: 'str', edge_kind: 'str' = 'depends_on') -> 'IntentReceipt'
IntentRepository.upsert_plan(self, *, plan_cid: 'str', goal_cid: 'str', plan_alias: 'str', status: 'str' = 'active', body: 'Mapping[str, Any] | None' = None, expected_revision: 'int | None' = None, set_head: 'bool' = True) -> 'IntentReceipt'
IntentRepository.upsert_task(self, *, task_cid: 'str', task_alias: 'str', goal_cid: 'str', ordinal: 'int' = 0, status: 'str' = 'ready', priority: 'str' = 'P2', plan_cid: 'str' = '', objective_id: 'str' = '', body: 'Mapping[str, Any] | None' = None, identity: 'Mapping[str, Any] | None' = None, expected_revision: 'int | None' = None, dependencies: 'Sequence[str] | None' = None, outputs: 'Sequence[Mapping[str, Any]] | None' = None, acceptance: 'Sequence[Mapping[str, Any] | str] | None' = None, validations: 'Sequence[Mapping[str, Any] | str | Sequence[str]] | None' = None) -> 'IntentReceipt'
IntentRepository.get_task(self, task_cid_or_alias: 'str') -> 'Mapping[str, Any] | None'
IntentRepository.select_ready_tasks(self, *, limit: 'int' = 100, now_ms: 'int | None' = None, include_completion_candidates: 'bool' = False, task_cids: 'Sequence[str]' = (), task_aliases: 'Sequence[str]' = (), task_prefix: 'str' = '', task_shard_count: 'int' = 1, task_shard_index: 'int' = 0, automatic_only: 'bool' = False) -> 'tuple[Mapping[str, Any], ...]'
IntentRepository.record_validation_result(self, *, task_cid: 'str', outcome: 'str', evidence_digest: 'str', argv: 'Sequence[str] | None' = None, attempt_id: 'str' = '', body: 'Mapping[str, Any] | None' = None) -> 'IntentReceipt'
IntentRepository.cas_task_status(self, *, task_cid: 'str', expected_revision: 'int', new_status: 'str', receipt: 'Mapping[str, Any] | None' = None, evidence_digests: 'Sequence[str] | None' = None, allow_completion_without_evidence: 'bool' = False, expected_control_receipt: 'Mapping[str, Any] | None' = None) -> 'IntentReceipt'
IntentRepository.required_evidence_satisfied(self, task_cid: 'str', *, now_ms: 'int | None' = None) -> 'tuple[bool, tuple[str, ...]]'
DatabaseTaskSource.__init__(self, database_path: 'str | Path | None' = None, *, intent: 'IntentRepository | None' = None, owner_id: 'str' = 'database-task-source:local', repository_tree_id: 'str' = '', plan_root_cid: 'str' = '', install_schema: 'bool' = True, evidence_freshness_seconds: 'int' = 3600, clock_ms: 'Any | None' = None, _post_merge_queue_authority: 'object | None' = None) -> 'None'
DatabaseTaskSource.ready_tasks(self, completed_ids: 'Iterable[str]' = (), blocked_ids: 'Iterable[str]' = (), limit: 'int' = 100, *, task_cids: 'Sequence[str]' = (), task_aliases: 'Sequence[str]' = (), task_prefix: 'str' = '', task_shard_count: 'int' = 1, task_shard_index: 'int' = 0, automatic_only: 'bool' = False) -> 'TaskPage'
DatabaseTaskSource.get_task(self, task_cid_or_alias: 'str | TaskRecord | Mapping[str, Any]') -> 'TaskRecord | None'
DatabaseTaskSource.compare_and_set_status(self, task_cid_or_alias: 'str | TaskRecord | Mapping[str, Any]', expected_revision: 'int', status: 'str', receipt: 'Mapping[str, Any] | None' = None, *, expected_control_receipt: 'Mapping[str, Any] | None' = None, evidence_digests: 'Sequence[str] | None' = None) -> 'CASResult'
VerificationProcessRunner.__init__(self, *, resource_scheduler: 'ResourceScheduler | None' = None, host_snapshot: 'HostResourceSnapshot | Mapping[str, Any] | None' = None, popen_factory: 'PopenFactory | None' = None, clock: 'Clock | None' = None, sleep: 'Sleep | None' = None, term_grace_seconds: 'float' = 0.25, kill_wait_seconds: 'float' = 1.0, poll_interval_seconds: 'float' = 0.02, require_resource_lease: 'bool' = True) -> 'None'
VerificationProcessRunner.run(self, command: 'VerificationCommand', *, cancellation: 'VerificationCancellation | None' = None) -> 'VerificationRunResult'
VerificationCancellation.cancel(self, *, cancellation_id: 'str | None' = None, reason: 'str' = 'cancelled') -> 'bool'
VerificationCommand(argv: 'Sequence[str]', cwd: 'str', environment: 'Mapping[str, str]', timeout_seconds: 'float', sandbox: 'VerificationSandboxIdentity', network_policy: 'str' = 'deny_all', max_stdout_bytes: 'int' = 262144, max_stderr_bytes: 'int' = 262144, lane_id: 'str' = '', resource_class: 'str' = 'cpu-validation', stage: 'str' = 'validation', metadata: 'Mapping[str, str]' = <factory>, stdin: 'bytes | str | None' = None) -> None
build_closed_sandbox(*, source_root: 'str | os.PathLike[str]', artifact_root: 'str | os.PathLike[str]', platform: 'Mapping[str, str] | None' = None, extra: 'Mapping[str, Any] | None' = None) -> 'VerificationSandboxIdentity'
build_hermetic_environment(values: 'Mapping[str, str] | None' = None, *, path: 'str | None' = None) -> 'dict[str, str]'
```
