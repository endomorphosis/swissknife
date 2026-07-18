# Service Module Public API

Generated from `src/module-ownership.json` manifest `2026-07-14-swr-145` by `npm run services:audit`.

Service implementations have exactly one owning family. Cross-family consumers must import a declared public entrypoint, and compatibility is limited to export-only barrels: a removed shadow must never be replaced with executable forwarding code.

## Family Summary

| Family | Owner | Runtime | Browser-safe entrypoint | Public entrypoints |
| --- | --- | --- | --- | --- |
| `service-apps` | app-surface-runtime | `universal` | `src/services/apps/app-manifest.ts` | 14 |
| `service-glasses` | glasses-surface-runtime | `split` | none | 7 |
| `service-integrations` | external-integration-service-runtime | `split` | none | 4 |
| `service-ipfs` | ipfs-descriptor-runtime | `split` | `src/services/ipfs/ipfs-browser.ts` | 9 |
| `service-logic` | logic-service-runtime | `split` | `src/services/logic/api/reasoning-normalization-pipeline.ts` | 72 |
| `service-mcp` | mcp-protocol-runtime | `split` | `src/services/mcp/browser-mcp.ts` | 25 |
| `service-platform` | platform-service-runtime | `split` | none | 8 |
| `service-proof-engine` | proof-engine-service-runtime | `split` | `src/services/proof-engine/proof-engine-browser.ts` | 3 |
| `service-provers` | prover-service-runtime | `split` | `src/services/provers/provers-browser.ts` | 19 |
| `service-shared` | shared-service-runtime | `universal` | `src/services/shared/shared-browser-crypto.ts` | 3 |
| `service-storage` | browser-safe-dispatch-artifact-storage | `browser-safe` | `src/services/storage/supervisor-dispatch-artifact-store.ts` | 1 |
| `service-zkp` | zkp-service-runtime | `split` | `src/services/zkp/browser-zkp.ts` | 13 |
| `services` | domain-service-runtime | `split` | none | 0 |

## Canonical Family APIs

### service-apps

Owner: app-surface-runtime. Runtime: `universal`.

Public entrypoints:

- `src/services/apps/all-app-executable-backend-contract.ts`
- `src/services/apps/all-app-live-tool-bindings.ts`
- `src/services/apps/all-tools-app-binding-matrix.ts`
- `src/services/apps/all-tools-composite-workflows.ts`
- `src/services/apps/all-tools-policy-classifier.ts`
- `src/services/apps/app-manifest-registry.ts`
- `src/services/apps/app-manifest.ts`
- `src/services/apps/index.ts`
- `src/services/apps/mcp-generated-app-quality-gates.ts`
- `src/services/apps/mcp-generated-app-state.ts`
- `src/services/apps/meta-glasses-app-capability-registry.ts`
- `src/services/apps/mcp-deontic-ui-manifest.ts`
- `src/services/apps/swissknife-mcp-capability-registry.ts`
- `src/services/apps/virtual-desktop-app-manifest.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/apps/**/*`

### service-glasses

Owner: glasses-surface-runtime. Runtime: `split`.

Public entrypoints:

- `src/services/glasses/all-tools-glasses-projection.ts`
- `src/services/glasses/glasses-browser.ts`
- `src/services/glasses/glasses-host.ts`
- `src/services/glasses/idl-to-glasses-compiler.ts`
- `src/services/glasses/index.ts`
- `src/services/glasses/ipfs-glasses-widgets.ts`
- `src/services/glasses/meta-glasses-io-profile.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/glasses/**/*`

### service-integrations

Owner: external-integration-service-runtime. Runtime: `split`.

Public entrypoints:

- `src/services/integrations/index.ts`
- `src/services/integrations/integrations-browser.ts`
- `src/services/integrations/integrations-host.ts`
- `src/services/integrations/spacy-wasm-nlp.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/integrations/**/*`

### service-ipfs

Owner: ipfs-descriptor-runtime. Runtime: `split`.

Public entrypoints:

- `src/services/ipfs/index.ts`
- `src/services/ipfs/ipfs-browser.ts`
- `src/services/ipfs/ipfs-host.ts`
- `src/services/ipfs/ipfs-ui-profiles.ts`
- `src/services/ipfs/mcp-ipfs-accelerate-descriptor-pack.ts`
- `src/services/ipfs/mcp-ipfs-datasets-descriptor-pack.ts`
- `src/services/ipfs/mcp-ipfs-kit-descriptor-pack.ts`
- `src/services/ipfs/mcp-ipfs-kit-tools-manifest.json`
- `src/services/ipfs/mcp-ipfs-ui-descriptors.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/ipfs/**/*`

### service-logic

Owner: logic-service-runtime. Runtime: `split`.

Public entrypoints:

- `src/services/logic/api/index.ts`
- `src/services/logic/api/logic-api-remainders.ts`
- `src/services/logic/api/logic-batch-processing.ts`
- `src/services/logic/api/logic-verification-toolkit.ts`
- `src/services/logic/api/proof-storage-parsers.ts`
- `src/services/logic/api/reasoning-normalization-pipeline.ts`
- `src/services/logic/api/session-translation-types.ts`
- `src/services/logic/bridges/index.ts`
- `src/services/logic/bridges/logic-bridges-browser.ts`
- `src/services/logic/bridges/logic-bridges-host.ts`
- `src/services/logic/bridges/modal-frame-bridge.ts`
- `src/services/logic/bridges/prover-router-bridge.ts`
- `src/services/logic/cec/cec-runtime-context-utils.ts`
- `src/services/logic/cec/index.ts`
- `src/services/logic/cec/logic-cec-browser.ts`
- `src/services/logic/cec/logic-cec-host.ts`
- `src/services/logic/dcec/dcec-types.ts`
- `src/services/logic/dcec/dcec-ucan-tptp-types.ts`
- `src/services/logic/dcec/index.ts`
- `src/services/logic/dcec/logic-dcec-browser.ts`
- `src/services/logic/dcec/logic-dcec-host.ts`
- `src/services/logic/deontic/browser-nlp.ts`
- `src/services/logic/deontic/deontic-extraction.ts`
- `src/services/logic/deontic/deontic-graph-builder.ts`
- `src/services/logic/deontic/deontic-graph.ts`
- `src/services/logic/deontic/deontic-knowledge-base.ts`
- `src/services/logic/deontic/deontic-parser-utils.ts`
- `src/services/logic/deontic/deontic-text-analyzer.ts`
- `src/services/logic/deontic/index.ts`
- `src/services/logic/deontic/legal-norm-builder.ts`
- `src/services/logic/deontic/legal-norm-decoder.ts`
- `src/services/logic/deontic/legal-norm-ir.ts`
- `src/services/logic/deontic/logic-deontic-browser.ts`
- `src/services/logic/deontic/logic-deontic-host.ts`
- `src/services/logic/deontic/normative-conflict-detector.ts`
- `src/services/logic/deontic/policy-to-dcec.ts`
- `src/services/logic/deontic/prover-syntax-builder.ts`
- `src/services/logic/deontic/support-map.ts`
- `src/services/logic/fol/enhanced-fol-converter.ts`
- `src/services/logic/fol/flogic-semantic-optimizer.ts`
- `src/services/logic/fol/fol-exporters.ts`
- `src/services/logic/fol/fol-nlp-extraction.ts`
- `src/services/logic/fol/fol-output-formatters.ts`
- `src/services/logic/fol/fol-text-converter.ts`
- `src/services/logic/fol/fol-text-parser.ts`
- `src/services/logic/fol/index.ts`
- `src/services/logic/fol/logic-formatter.ts`
- `src/services/logic/fol/logic-fol-browser.ts`
- `src/services/logic/fol/logic-fol-host.ts`
- `src/services/logic/fol/ml-confidence-scorer.ts`
- `src/services/logic/modal/index.ts`
- `src/services/logic/modal/logic-modal-browser.ts`
- `src/services/logic/modal/logic-modal-host.ts`
- `src/services/logic/modal/shadow-prover.ts`
- `src/services/logic/nl/index.ts`
- `src/services/logic/nl/logic-nl-browser.ts`
- `src/services/logic/nl/logic-nl-host.ts`
- `src/services/logic/nl/portuguese-deontic-flogic-types.ts`
- `src/services/logic/shared/embedding-prover.ts`
- `src/services/logic/shared/formula-analyzer.ts`
- `src/services/logic/shared/index.ts`
- `src/services/logic/shared/logic-converters.ts`
- `src/services/logic/shared/logic-shared-bridge-types.ts`
- `src/services/logic/shared/logic-shared-browser.ts`
- `src/services/logic/shared/logic-shared-host.ts`
- `src/services/logic/tdfol/index.ts`
- `src/services/logic/tdfol/logic-tdfol-browser.ts`
- `src/services/logic/tdfol/logic-tdfol-host.ts`
- `src/services/logic/tdfol/policy-to-tdfol.ts`
- `src/services/logic/tdfol/tdfol-completeness-rules.ts`
- `src/services/logic/tdfol/tdfol-core.ts`
- `src/services/logic/tdfol/tdfol-types.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/logic/**/*`

### service-mcp

Owner: mcp-protocol-runtime. Runtime: `split`.

Public entrypoints:

- `src/services/mcp/agent-supervisor-console-gateway.ts`
- `src/services/mcp/all-app-tool-gateway.ts`
- `src/services/mcp/all-tools-idl-generator.ts`
- `src/services/mcp/browser-mcp.ts`
- `src/services/mcp/host/mcpClient.ts`
- `src/services/mcp/host/mcp-traffic-manager.ts`
- `src/services/mcp/host/mcp-versioned-client.ts`
- `src/services/mcp/index.ts`
- `src/services/mcp/libp2p-browser-runtime.ts`
- `src/services/mcp/mcp-browser.ts`
- `src/services/mcp/mcp-control-surface-mediator.ts`
- `src/services/mcp/mcp-deontic-interface-broker.ts`
- `src/services/mcp/mcp-envelope.ts`
- `src/services/mcp/mcp-event-dag.ts`
- `src/services/mcp/mcp-host.ts`
- `src/services/mcp/mcp-idl.ts`
- `src/services/mcp/mcp-interface-registry.ts`
- `src/services/mcp/mcp-mcp-policy.ts`
- `src/services/mcp/mcp-orb-capability-router.ts`
- `src/services/mcp/mcp-plus-plus-connector.ts`
- `src/services/mcp/mcp-plus-plus.ts`
- `src/services/mcp/mcp-remote-deontic-engine.ts`
- `src/services/mcp/mcp-schema-ui-generator.ts`
- `src/services/mcp/mcp-ui-profile.ts`
- `src/services/mcp/mcp-wasm-prover-hub.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/mcp/**/*`

### service-platform

Owner: platform-service-runtime. Runtime: `split`.

Public entrypoints:

- `src/services/platform/claude.ts`
- `src/services/platform/index.ts`
- `src/services/platform/notifier.ts`
- `src/services/platform/platform-browser.ts`
- `src/services/platform/platform-host.ts`
- `src/services/platform/sentry.ts`
- `src/services/platform/statsig.ts`
- `src/services/platform/webgpu-optimizer.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/platform/**/*`

### service-proof-engine

Owner: proof-engine-service-runtime. Runtime: `split`.

Public entrypoints:

- `src/services/proof-engine/index.ts`
- `src/services/proof-engine/proof-engine-browser.ts`
- `src/services/proof-engine/proof-engine-host.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/proof-engine/**/*`

### service-provers

Owner: prover-service-runtime. Runtime: `split`.

Public entrypoints:

- `src/services/provers/browser-crypto.ts`
- `src/services/provers/coq-jscoq-bridge.ts`
- `src/services/provers/cvc5-wasm-bridge.ts`
- `src/services/provers/dcec-prover-bridge.ts`
- `src/services/provers/external-provers.ts`
- `src/services/provers/formula-classifier.ts`
- `src/services/provers/index.ts`
- `src/services/provers/lean4-wasm-bridge.ts`
- `src/services/provers/lurk-wasm-bridge.ts`
- `src/services/provers/mcp-proof-cache.ts`
- `src/services/provers/neural-prover-bridge.ts`
- `src/services/provers/prover-types.ts`
- `src/services/provers/prover-strategy-runtime.ts`
- `src/services/provers/provers-browser.ts`
- `src/services/provers/provers-host.ts`
- `src/services/provers/tdfol-extended-rules.ts`
- `src/services/provers/tdfol-prover-bridge.ts`
- `src/services/provers/tptp-problem.ts`
- `src/services/provers/z3-wasm-bridge.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/provers/**/*`

### service-shared

Owner: shared-service-runtime. Runtime: `universal`.

Public entrypoints:

- `src/services/shared/browser-event-emitter.ts`
- `src/services/shared/index.ts`
- `src/services/shared/shared-browser-crypto.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/shared/**/*`

### service-storage

Owner: browser-safe-dispatch-artifact-storage. Runtime: `browser-safe`.

Public entrypoints:

- `src/services/storage/supervisor-dispatch-artifact-store.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/storage/**/*`

### service-zkp

Owner: zkp-service-runtime. Runtime: `split`.

Public entrypoints:

- `src/services/zkp/artifacts/index.ts`
- `src/services/zkp/browser-snarkjs-backend.ts`
- `src/services/zkp/browser-zkp-policy.ts`
- `src/services/zkp/browser-zkp.ts`
- `src/services/zkp/ethereum-zkp-bridge.ts`
- `src/services/zkp/groth16-cec-expansion.ts`
- `src/services/zkp/index.ts`
- `src/services/zkp/profile-d-policy-zkp.ts`
- `src/services/zkp/zkp-backends.ts`
- `src/services/zkp/zkp-browser-schnorr.ts`
- `src/services/zkp/zkp-browser.ts`
- `src/services/zkp/zkp-canonicalization-runtime.ts`
- `src/services/zkp/zkp-host.ts`

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/zkp/**/*`

### services

Owner: domain-service-runtime. Runtime: `split`.

Public entrypoints:

- None; this is an ownership aggregate only.

Private implementation patterns (declared public entrypoints are excluded):

- `src/services/**/*`

## Migration Paths

The legacy files below were executable shadow copies and are deleted. Import the public family API shown; no compatibility implementation remains at the old path.

| Removed legacy path | Canonical implementation | Public family API | Compatibility |
| --- | --- | --- | --- |
| `src/services/bridge/bridge-modal-frame-bridge.ts` | `src/services/logic/bridges/modal-frame-bridge.ts` | `src/services/logic/bridges/modal-frame-bridge.ts` | removed; import the canonical family API |
| `src/services/bridge/bridge-prover-router-bridge.ts` | `src/services/logic/bridges/prover-router-bridge.ts` | `src/services/logic/bridges/prover-router-bridge.ts` | removed; import the canonical family API |
| `src/services/deontic-cognitive-logic-types.ts` | `src/services/logic/dcec/dcec-ucan-tptp-types.ts` | `src/services/logic/dcec/dcec-ucan-tptp-types.ts` | removed; import the canonical family API |
| `src/services/deontic-nlp-ontology-types.ts` | `src/services/logic/nl/portuguese-deontic-flogic-types.ts` | `src/services/logic/nl/portuguese-deontic-flogic-types.ts` | removed; import the canonical family API |
| `src/services/deontic/browser-nlp.ts` | `src/services/logic/deontic/browser-nlp.ts` | `src/services/logic/deontic/browser-nlp.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-deontic-extraction.ts` | `src/services/logic/deontic/deontic-extraction.ts` | `src/services/logic/deontic/deontic-extraction.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-deontic-graph-builder.ts` | `src/services/logic/deontic/deontic-graph-builder.ts` | `src/services/logic/deontic/deontic-graph-builder.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-deontic-graph.ts` | `src/services/logic/deontic/deontic-graph.ts` | `src/services/logic/deontic/deontic-graph.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-deontic-knowledge-base.ts` | `src/services/logic/deontic/deontic-knowledge-base.ts` | `src/services/logic/deontic/deontic-knowledge-base.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-deontic-parser-utils.ts` | `src/services/logic/deontic/deontic-parser-utils.ts` | `src/services/logic/deontic/deontic-parser-utils.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-deontic-text-analyzer.ts` | `src/services/logic/deontic/deontic-text-analyzer.ts` | `src/services/logic/deontic/deontic-text-analyzer.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-legal-norm-builder.ts` | `src/services/logic/deontic/legal-norm-builder.ts` | `src/services/logic/deontic/legal-norm-builder.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-legal-norm-decoder.ts` | `src/services/logic/deontic/legal-norm-decoder.ts` | `src/services/logic/deontic/legal-norm-decoder.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-legal-norm-ir.ts` | `src/services/logic/deontic/legal-norm-ir.ts` | `src/services/logic/deontic/legal-norm-ir.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-normative-conflict-detector.ts` | `src/services/logic/deontic/normative-conflict-detector.ts` | `src/services/logic/deontic/normative-conflict-detector.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-prover-syntax-builder.ts` | `src/services/logic/deontic/prover-syntax-builder.ts` | `src/services/logic/deontic/prover-syntax-builder.ts` | removed; import the canonical family API |
| `src/services/deontic/deontic-support-map.ts` | `src/services/logic/deontic/support-map.ts` | `src/services/logic/deontic/support-map.ts` | removed; import the canonical family API |
| `src/services/fol-bridge-session-types.ts` | `src/services/logic/api/session-translation-types.ts` | `src/services/logic/api/session-translation-types.ts` | removed; import the canonical family API |
| `src/services/fol-utils/fol-output-formatter.ts` | `src/services/logic/fol/fol-output-formatters.ts` | `src/services/logic/fol/fol-output-formatters.ts` | removed; import the canonical family API |
| `src/services/fol-utils/fol-parser.ts` | `src/services/logic/fol/fol-text-parser.ts` | `src/services/logic/fol/fol-text-parser.ts` | removed; import the canonical family API |
| `src/services/fol-utils/fol-utils-nlp-predicate-extractor.ts` | `src/services/logic/fol/fol-nlp-extraction.ts` | `src/services/logic/fol/fol-nlp-extraction.ts` | removed; import the canonical family API |
| `src/services/fol-utils/index.ts` | `src/services/logic/fol/index.ts` | `src/services/logic/fol/index.ts` | removed; import the canonical family API |
| `src/services/fol/fol-enhanced-fol-converter.ts` | `src/services/logic/fol/enhanced-fol-converter.ts` | `src/services/logic/fol/enhanced-fol-converter.ts` | removed; import the canonical family API |
| `src/services/fol/fol-flogic-semantic-optimizer.ts` | `src/services/logic/fol/flogic-semantic-optimizer.ts` | `src/services/logic/fol/flogic-semantic-optimizer.ts` | removed; import the canonical family API |
| `src/services/fol/fol-fol-exporters.ts` | `src/services/logic/fol/fol-exporters.ts` | `src/services/logic/fol/fol-exporters.ts` | removed; import the canonical family API |
| `src/services/fol/fol-fol-text-converter.ts` | `src/services/logic/fol/fol-text-converter.ts` | `src/services/logic/fol/fol-text-converter.ts` | removed; import the canonical family API |
| `src/services/fol/fol-logic-formatter.ts` | `src/services/logic/fol/logic-formatter.ts` | `src/services/logic/fol/logic-formatter.ts` | removed; import the canonical family API |
| `src/services/fol/fol-ml-confidence-scorer.ts` | `src/services/logic/fol/ml-confidence-scorer.ts` | `src/services/logic/fol/ml-confidence-scorer.ts` | removed; import the canonical family API |
| `src/services/logic-language-pipeline.ts` | `src/services/logic/api/reasoning-normalization-pipeline.ts` | `src/services/logic/api/reasoning-normalization-pipeline.ts` | removed; import the canonical family API |
| `src/services/logic-observability-pipeline.ts` | `src/services/logic/cec/cec-runtime-context-utils.ts` | `src/services/logic/cec/cec-runtime-context-utils.ts` | removed; import the canonical family API |
| `src/services/logic-verification-utilities.ts` | `src/services/logic/api/logic-verification-toolkit.ts` | `src/services/logic/api/logic-verification-toolkit.ts` | removed; import the canonical family API |
| `src/services/logic/fol/nlp-predicate-extractor.ts` | `src/services/logic/fol/fol-nlp-extraction.ts` | `src/services/logic/fol/fol-nlp-extraction.ts` | removed; import the canonical family API |
| `src/services/mcp/mcp-mcp-deontic-ui-manifest.ts` | `src/services/apps/mcp-deontic-ui-manifest.ts` | `src/services/apps/mcp-deontic-ui-manifest.ts` | removed; import the canonical family API |
| `src/services/mcp/mcp-mcp-traffic-manager.ts` | `src/services/mcp/host/mcp-traffic-manager.ts` | `src/services/mcp/host/mcp-traffic-manager.ts` | removed; import the canonical family API |
| `src/services/mcp/mcp-mcp-versioned-client.ts` | `src/services/mcp/host/mcp-versioned-client.ts` | `src/services/mcp/host/mcp-versioned-client.ts` | removed; import the canonical family API |
| `src/services/mcp/mcp-swissknife-mcp-capability-registry.ts` | `src/services/apps/swissknife-mcp-capability-registry.ts` | `src/services/apps/swissknife-mcp-capability-registry.ts` | removed; import the canonical family API |
| `src/services/prover-strategy-adapters.ts` | `src/services/provers/prover-strategy-runtime.ts` | `src/services/provers/prover-strategy-runtime.ts` | removed; import the canonical family API |
| `src/services/provers/provers-dcec-types.ts` | `src/services/logic/dcec/dcec-types.ts` | `src/services/logic/dcec/dcec-types.ts` | removed; import the canonical family API |
| `src/services/provers/provers-policy-to-dcec.ts` | `src/services/logic/deontic/policy-to-dcec.ts` | `src/services/logic/deontic/policy-to-dcec.ts` | removed; import the canonical family API |
| `src/services/provers/provers-policy-to-tdfol.ts` | `src/services/logic/tdfol/policy-to-tdfol.ts` | `src/services/logic/tdfol/policy-to-tdfol.ts` | removed; import the canonical family API |
| `src/services/provers/provers-tdfol-completeness-rules.ts` | `src/services/logic/tdfol/tdfol-completeness-rules.ts` | `src/services/logic/tdfol/tdfol-completeness-rules.ts` | removed; import the canonical family API |
| `src/services/provers/provers-tdfol-types.ts` | `src/services/logic/tdfol/tdfol-types.ts` | `src/services/logic/tdfol/tdfol-types.ts` | removed; import the canonical family API |
| `src/services/zkp-onchain-eth-bridge.ts` | `src/services/zkp/ethereum-zkp-bridge.ts` | `src/services/zkp/ethereum-zkp-bridge.ts` | removed; import the canonical family API |

## Package Subpath Migrations

| Package subpath | Browser target | Import/default target |
| --- | --- | --- |
| `swissknife/deontic-nlp` | `./src/services/logic/deontic/browser-nlp.ts` | `./src/services/logic/deontic/browser-nlp.ts` |
| `swissknife/logic-language` | `./src/services/logic/api/reasoning-normalization-pipeline.ts` | `./src/services/logic/api/reasoning-normalization-pipeline.ts` |
| `swissknife/proof-engine` | `[object Object]` | `./src/services/proof-engine/proof-engine-host.ts` |
| `swissknife/provers` | `[object Object]` | `./src/services/provers/provers-host.ts` |

## Behavioral Reconciliation

- Deontic conflict reports use conflict entity membership, so one detected conflict is reported for every entity it names.
- FOL NLP extraction keeps the Python-shaped predicate/statistics contract and the richer unary, binary, ternary, and semantic-role classification in one implementation; `normalisePredicate` retains lower snake-case behavior while `normalizePredicate` retains formula-symbol casing.
- Logic API remainder helpers now live as executable canonical code in the logic API family instead of forwarding to a deleted root shadow.
- `proof-engine-browser.ts` and `provers-browser.ts` are browser-specific runtime implementations, not index shadows. The browser proof facade delegates to a worker verifier, and the bounded prover executes its TypeScript truth-table runtime.
- The proof-engine index resolves legacy star-export collisions explicitly: `ProofCache` is the persistent cache, `ExecutionProofCache` is the execution-local cache, `ProofResult` is the canonical result class, and `UtilityProofResult` is the lightweight utility result shape.
- Cross-family proof-engine consumers import `src/services/proof-engine/index.ts`; runtime package consumers select `proof-engine-browser.ts` or `proof-engine-host.ts` through package export conditions.

## Compatibility Barrels

The canonical convenience entrypoints `src/services/apps/index.ts` and `src/services/logic/deontic/browser-nlp.ts` contain exports only. Other approved service `index.ts` files are classified individually by the duplicate inventory; executable index entrypoints remain implementations only when explicitly declared by policy.
