# MCP++ Conformance Matrix (Phase 1 Baseline)

**Status:** Updated — Rounds 50-52, Profile C DelegationManager, Profile D audit/compliance, Profile E PubSubBus  
**Last updated:** 2026-07-01  
**Scope:** SwissKnife MCP++ Profiles A-E with parity tracking against:
- `endomorphosis/mcp_plus_plus` (spec intent)
- `endomorphosis/ipfs_accelerate_py` (conformance discipline and rollout gates)
- `endomorphosis/ipfs_datasets_py` (runtime and security reference patterns)

---

## 1) Baseline Summary

| Profile | Area | SwissKnife Status | Notes |
|---|---|---|---|
| A | MCP-IDL interface contracts | PASS | Deterministic canonicalization + CID repository + compat/select APIs implemented and tested. |
| B | CID-native envelopes & receipts | PASS | Envelope/receipt content addressing and signing path implemented and tested. |
| C | UCAN capability delegation | PASS | Core token issue/validate/can + revocation + DelegationManager lifecycle (add/merge/query/persist/IPFS-reload) implemented and tested. |
| D | Temporal deontic policy | PASS | Policy engine + obligation tracking + deontic-to-UI projection + per-device conformance + remote TDFOL proof delegation + ORB runtime enforcement + JSON-serialisable UI manifest bridge all implemented and tested. |
| E | P2P transport/session | PASS | Session framing, handshake, correlation, rate limits, PubSubBus, deterministic error codes, explicit state machine, backoff reconnection policy, and capability negotiation all implemented and tested. |

---

## 2) Detailed Conformance Matrix

### Profile A — MCP-IDL

| Requirement | Status | Evidence |
|---|---|---|
| Deterministic canonicalization for descriptors | PASS | `src/services/mcp-idl.ts` (`canonicalize`, `stableStringify`) |
| Deterministic interface CID generation (`sha256:<hex>`) | PASS | `src/services/mcp-idl.ts` (`computeInterfaceCID`) |
| Repository APIs (`register/list/get/compat/select`) | PASS | `src/services/mcp-idl.ts` (`InterfaceRepository`) |
| CLI integration for listing and compatibility checks | PASS | `src/commands/mcp-plus-plus.ts` (`idl list/get/compat`) |
| Test coverage for determinism and repository behavior | PASS | `test/mcp-plus-plus/mcp-idl.test.ts`, `test/mcp-plus-plus/integration-pipeline.test.ts` |

### Profile B — CID-native artifacts

| Requirement | Status | Evidence |
|---|---|---|
| ExecutionEnvelope with content-addressed input/intent/proof | PASS | `src/services/mcp-envelope.ts` (`buildEnvelope`) |
| ExecutionReceipt with content-addressed output | PASS | `src/services/mcp-envelope.ts` (`buildReceipt`) |
| Deterministic receipt CID generation | PASS | `src/services/mcp-envelope.ts` (`computeReceiptCID`) |
| Optional signature flow for receipts | PASS | `src/services/mcp-envelope.ts` (`buildReceipt`) |
| Test coverage for CID determinism and envelope/receipt lifecycle | PASS | `test/mcp-plus-plus/mcp-envelope.test.ts`, `test/mcp-plus-plus/integration-pipeline.test.ts` |

### Profile C — UCAN delegation

| Requirement | Status | Evidence |
|---|---|---|
| UCAN token issue/parse/validate (Ed25519, did:key) | PASS | `src/auth/ucan-auth.ts` |
| Capability checks with wildcard resource support | PASS | `src/auth/ucan-auth.ts` (`can`) |
| Proof-chain validation (delegation linkage) | PASS | `src/auth/ucan-auth.ts` (`validateToken`) + `test/mcp-plus-plus/ucan-auth.test.ts` |
| Revocation registry integration | PASS | `src/auth/ucan-auth.ts` (`UCANRevocationRegistry`, revocation checks) + `test/mcp-plus-plus/transport-and-revocation.test.ts` |
| Delegation lifecycle manager (merge/reload/query/persistence) parity with references | PASS | `src/auth/delegation-manager.ts` (`DelegationManager.add/merge/activeByActor/activeByResource/canInvoke/save/loadFrom`) + `test/mcp-plus-plus/delegation-manager.test.ts` |
| Persistent/IPFS-backed delegation state | PASS | `src/auth/delegation-manager.ts` (`save`, `loadFrom`, `reloadFromIPFS`) |
| Natural language policy-to-UCAN compilation | GAP | Not present |

### Profile D — Temporal deontic policy

| Requirement | Status | Evidence |
|---|---|---|
| Policy model (permissions/prohibitions/obligations/temporal constraints) | PASS | `src/services/mcp-policy.ts` (`Policy`, related types) |
| Decision engine with deny precedence and temporal checks | PASS | `src/services/mcp-policy.ts` (`evaluatePolicy`) |
| Obligation tracking and overdue detection | PASS | `src/services/mcp-policy.ts` + `test/mcp-plus-plus/policy-and-scheduler.test.ts` |
| Deterministic policy decision CID | PASS | `src/services/mcp-policy.ts` (`decision_cid`) |
| Deontic interface projection (policy → per-method states) | PASS | `src/services/mcp-deontic-interface-broker.ts` (`projectDeonticInterface`, `checkPolicyConsistency`) + `test/mcp-plus-plus/mcp-deontic-interface-broker.test.ts` |
| Per-device deontic conformance (obligated-first, budget cap, modality binding) | PASS | `src/services/mcp-deontic-interface-broker.ts` (`conformProjectionToDevice`) |
| End-to-end constrained interface model builder | PASS | `src/services/mcp-deontic-interface-broker.ts` (`buildConstrainedInterfaceModel`) |
| ORB runtime deontic enforcement (authorize → deny/obligation on policy_cid) | PASS | `src/services/mcp-orb-capability-router.ts` (`applyDeonticPolicy`, `ORBDeonticEvaluator`) |
| Remote TDFOL proof delegation (temporal/hard proofs to ipfs_datasets_py) | PASS | `src/services/mcp-remote-deontic-engine.ts` (`RemoteDeonticEngine`, `createRemoteDeonticORBEvaluator`) + `test/mcp-plus-plus/mcp-remote-deontic-engine.test.ts` |
| JSON-serialisable deontic UI manifest bridge + invoke guard | PASS | `src/services/mcp-deontic-ui-manifest.ts` (`buildDeonticUIManifest`, `invokeControl`) + `test/mcp-plus-plus/mcp-deontic-ui-manifest.test.ts` |
| Compliance/audit policy integration (ComplianceChecker/PolicyAuditLog) | PASS | `src/services/policy-audit-log.ts` (`PolicyAuditLog`) + `src/services/compliance-checker.ts` (`ComplianceChecker`, `addMCPPPBaseRules`) + `test/mcp-plus-plus/compliance-audit.test.ts` |

### Profile E — P2P transport/session

| Requirement | Status | Evidence |
|---|---|---|
| Length-prefixed framing with max frame guardrails | PASS | `src/services/mcp-p2p-session.ts` (`DEFAULT_MAX_FRAME_BYTES`, frame parsing/writing) |
| Initialize/initialized handshake flow | PASS | `src/services/mcp-p2p-session.ts` (`handshake`) |
| Request/response correlation for concurrent in-flight messages | PASS | `src/services/mcp-p2p-session.ts` + `test/mcp-plus-plus/mcp-p2p-session.test.ts` |
| Rate-limiting of inbound messages | PASS | `src/services/mcp-p2p-session.ts` (`FixedWindowRateLimiter`) |
| Transport abstraction + factory | PASS | `src/services/mcp-transport.ts` (`MCPTransportFactory`) |
| Structured PubSubBus lifecycle parity (subscribe/topic mapping/resubscribe metrics) | PASS | `src/services/mcp-pubsub-bus.ts` (`MCPPubSubBus`, `InProcessBusTransport`, `MCP_WELL_KNOWN_TOPICS`) + `test/mcp-plus-plus/mcp-pubsub-bus.test.ts` |
| Hardened recovery semantics (oversize/malformed frame codes, churn backoff policy, explicit state machine) | PASS | `src/services/mcp-p2p-session.ts` — `SessionErrorCode` (1xxx/2xxx/3xxx/4xxx), `SessionError`, `SessionState` machine, `computeBackoffDelay`, `ReconnectPolicy` |
| Capability negotiation/downgrade and stricter handshake gating | PASS | `src/services/mcp-p2p-session.ts` — `negotiateCapabilities`, `MCP_PLUS_PLUS_PROFILES`, `handshake()` emits `capability-downgrade` event |

---

## 3) Reference-Pattern Parity Gaps

### From `ipfs_datasets_py`

1. **DelegationManager parity gap (critical):**  
   Missing persistent delegation graph management (`add`, `merge`, `active_tokens_by_*`, `reload_from_ipfs`, revocation lifecycle integration).

2. **PubSubBus parity gap (high):**  
   Missing dedicated bus abstraction with subscription IDs, topic counters, handler hot-swap (`resubscribe`) and topic/subscription introspection.

3. **ComplianceChecker parity gap (high):**  
   Missing automated compliance checks and backup-oriented operational guardrails.

4. **PolicyAuditLog parity gap (high):**  
   Missing immutable/append-only audit stream for policy and revocation decisions.

### From `ipfs_accelerate_py`

1. **Spec gap matrix discipline (high):**  
   No maintained PASS/PARTIAL/GAP matrix with evidence and closure criteria (this document establishes baseline).

2. **Conformance gate and cutover criteria (high):**  
   No formal release gates tied to test evidence and interoperability checks.

3. **Server/runtime unification rollout approach (medium):**  
   Staged migration and feature-flag cutover criteria not yet codified for MCP++ runtime hardening.

---

## 4) Critical Gaps Requiring Immediate Attention

Priority order for implementation start:

1. **C1 — Delegation lifecycle management** *(resolved)*  
   `DelegationManager` implemented with JSON + IPFS-backed persistence, merge, chain-walk evaluation, active-token queries, and revocation integration.

2. **E1 — P2P pub/sub operational abstraction** *(resolved)*  
   `MCPPubSubBus` implemented with deterministic lifecycle (idle/starting/running/stopping/stopped), topic-to-handler registry, pre-start subscription replay, resubscribe metrics, pluggable transport backend (`InProcessBusTransport` works without libp2p).

3. **E2 — Transport hardening** *(resolved)*  
   `SessionErrorCode` taxonomy (1xxx framing, 2xxx protocol, 3xxx rate, 4xxx lifecycle), `SessionError`, explicit `SessionState` machine, `computeBackoffDelay` with exponential + jitter, `negotiateCapabilities` + capability-downgrade event.

4. **D1/C2 — Compliance + audit integration** *(resolved)*  
   PolicyAuditLog (ring-buffer, JSONL sink, replay, stats, deterministic entry CIDs) + ComplianceChecker (rule lifecycle, merge/diff, checkAndAudit, built-in MCP++ base rules) implemented.

---

## 5) Conformance Gates for Production Release

### Gate G1 — Baseline correctness (must pass)
- All Profile A/B/C/D/E MCP++ tests pass:
  - `test/mcp-plus-plus/mcp-idl.test.ts`
  - `test/mcp-plus-plus/mcp-envelope.test.ts`
  - `test/mcp-plus-plus/ucan-auth.test.ts`
  - `test/mcp-plus-plus/policy-and-scheduler.test.ts`
  - `test/mcp-plus-plus/mcp-p2p-session.test.ts`
  - `test/mcp-plus-plus/integration-pipeline.test.ts`

### Gate G2 — Security and delegation parity (must pass)
- DelegationManager implemented with lifecycle operations.
- Revocation flows persist and are queryable.
- UCAN delegation chain tests include merge/reload and persistence scenarios.

### Gate G3 — Transport resilience parity (must pass)
- Structured PubSubBus abstraction in place.
- Explicit reconnection/backoff behavior validated.
- Malformed/oversize frame handling produces deterministic behavior and test coverage.

### Gate G4 — Compliance and auditability (must pass)
- Compliance and policy audit components implemented.
- Audit replay path verifies decision/provenance consistency.

### Gate G5 — Interoperability and rollout (must pass)
- Capability negotiation documented and enforced.
- Cross-runtime interoperability tests with Python reference behavior added.
- Feature-flagged rollout path and rollback criteria documented.

### Gate G6 — Descriptor-generated desktop apps (must pass)
- MCP++ UI Profile descriptors validate before registry publish.
- Registry launch resolution enforces compatibility, trust policy, and version fallback.
- Generated UI quality gates cover schema-driven commands/forms/renderers, policy-aware controls, ORB invocation, streams, recovery, replay restoration, and provenance audit.
- At least one descriptor-only app path ships with no bespoke virtual desktop shell code. Current evidence:
  - `src/services/mcp-ipfs-ui-descriptors.ts`
  - `src/services/mcp-generated-app-quality-gates.ts`
  - `test/e2e/generated-app-quality-gate.e2e.test.ts`
  - `test/mcp-plus-plus/integration-pipeline.test.ts`

---

## 6) Initial Remediation Backlog (Phase 1 Output)

- [x] Implement `src/auth/delegation-manager.ts` with persistence + merge/reload operations.
- [x] Implement `src/services/mcp-pubsub-bus.ts` and adapt `mcp-discovery.ts` integration points.
- [x] Introduce transport session state machine + deterministic error taxonomy in `mcp-p2p-session.ts`.
- [x] Deontic interface broker: formal-logic policy → constrained UI + per-device conformance (`mcp-deontic-interface-broker.ts`, Round 50).
- [x] ORB runtime deontic enforcement: `applyDeonticPolicy` in authorize() path (`mcp-orb-capability-router.ts`, Round 50).
- [x] Remote TDFOL proof delegation: delegate temporal/hard proofs to Python formal-logic engine (`mcp-remote-deontic-engine.ts`, Round 51).
- [x] JSON-serialisable UI manifest bridge + invoke guard (`mcp-deontic-ui-manifest.ts`, Round 52).
- [x] Add compliance and policy audit primitives (`compliance-checker`, `policy-audit-log`).
- [x] Add conformance status CLI output (`mcp-plus-plus conformance status`).
- [x] Add requirement-to-test mapping doc and keep this matrix updated per merged feature.
- [x] WASM theorem prover layer — Z3/CVC5/Coq/Lean4 local-first proof evaluation
      (`mcp-wasm-prover-hub.ts`, `provers/z3-wasm-bridge.ts`, `provers/cvc5-wasm-bridge.ts`,
       `provers/coq-jscoq-bridge.ts`, `provers/lean4-wasm-bridge.ts`,
       `provers/smt2-serializer.ts`, `provers/mcp-proof-cache.ts`).
- [x] Remote engine local-first pre-check: `checkPolicyConsistencyRemote(policy, engine, hub?)` —
      Z3/CVC5 WASM decides propositional/FOL before going to Python TDFOL.
- [x] Lurk/ZK stub (`provers/lurk-wasm-bridge.ts`) — `ZKProofArtifact` type + Phase 6 placeholder.
- [x] AuditEntry `extra.prover_id` + `extra.proof_time_ms` — logged by `PolicyAuditLog.record()`.
- [x] `mcp++ conformance` / `mcp++ status` show loaded WASM provers.
- [x] Add descriptor-generated desktop quality gates for the IPFS dataset-to-inference workflow.
- [x] Add descriptor authoring CLI starter packs and trust verification.
- [x] Add replay/audit inspector summaries for generated app debugging.

---

## 7) Ownership and Update Policy

- Update this matrix on every MCP++ PR that changes Profiles A-E behavior.
- New entries must include both implementation and test evidence.
- Status definitions:
  - **PASS:** Implemented with tests and no known parity blockers.
  - **PARTIAL:** Implemented but missing parity, hardening, or coverage.
  - **GAP:** Not implemented or not yet aligned with required behavior.
