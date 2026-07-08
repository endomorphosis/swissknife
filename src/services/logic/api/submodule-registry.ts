/**
 * LogicSubmoduleRegistry — machine-readable registry of all logic submodules.
 *
 * Mirrors ipfs_datasets_py/logic/submodule_registry.py (614 lines):
 *   class LogicSubmoduleSpec
 *   logic_submodule_specs() → tuple[LogicSubmoduleSpec, ...]
 *   logic_integration_manifest() → dict
 *
 * Registers all implemented swissknife logic service modules,
 * enabling tooling, documentation, and capability discovery.
 *
 * T-101.
 * Reference: ipfs_datasets_py/logic/submodule_registry.py
 */

// ---------------------------------------------------------------------------
// LogicSubmoduleSpec
// ---------------------------------------------------------------------------

export interface LogicSubmoduleSpec {
  readonly name:                  string;
  readonly module:                string;
  readonly description:           string;
  readonly roles:                 string[];
  readonly capabilities:          string[];
  readonly status:                'implemented' | 'partial' | 'stub' | 'pending';
  readonly implementationPhase:   number;
  readonly source_file:           string;
  readonly public_symbols:        string[];
  readonly notes:                 string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const _SPECS: LogicSubmoduleSpec[] = [
  // --- External Provers ---
  { name: 'z3-wasm',       module: 'src/services/provers/z3-wasm-bridge',      description: 'Z3 SMT solver WASM bridge (z3-solver npm, lazy-load)', roles: ['prover', 'smt'], capabilities: ['sat', 'unsat', 'model'], status: 'implemented', implementationPhase: 1,  source_file: 'provers/z3-wasm-bridge.ts',      public_symbols: ['Z3WasmBridge'], notes: '' },
  { name: 'cvc5-wasm',     module: 'src/services/provers/cvc5-wasm-bridge',    description: 'CVC5 SMT-LIB2 bridge (shim via Z3)', roles: ['prover', 'smt'], capabilities: ['sat', 'smt-lib2'], status: 'implemented', implementationPhase: 2, source_file: 'provers/cvc5-wasm-bridge.ts', public_symbols: ['Cvc5WasmBridge'], notes: '' },
  { name: 'coq-jscoq',     module: 'src/services/provers/coq-jscoq-bridge',    description: 'Coq subprocess bridge for higher-order proofs', roles: ['prover', 'interactive'], capabilities: ['coq', 'higher_order'], status: 'implemented', implementationPhase: 3, source_file: 'provers/coq-jscoq-bridge.ts', public_symbols: ['CoqJsCoqBridge'], notes: '' },
  { name: 'lean4-wasm',    module: 'src/services/provers/lean4-wasm-bridge',   description: 'Lean 4 subprocess bridge + ix ZK-attested proofs', roles: ['prover', 'interactive', 'zk'], capabilities: ['lean4', 'ix', 'sphinx'], status: 'implemented', implementationPhase: 4, source_file: 'provers/lean4-wasm-bridge.ts', public_symbols: ['Lean4WasmBridge'], notes: '' },
  { name: 'lurk-wasm',     module: 'src/services/provers/lurk-wasm-bridge',    description: 'Lurk ZK proof-carrying adapter for locally built or installed lurk-wasm packages', roles: ['prover', 'zk'], capabilities: ['zk', 'nova'], status: 'partial', implementationPhase: 97, source_file: 'provers/lurk-wasm-bridge.ts', public_symbols: ['LurkWasmBridge', 'ZKProofArtifact', 'loadLurkPackage', 'computeZKProofArtifactCid'], notes: 'adapter implemented; native cryptographic proving requires external lurk-wasm build/install' },
  { name: 'multi-stark',   module: 'src/services/provers/multi-stark-bridge',   description: 'Multi-circuit STARK adapter for locally built or installed multi-stark WASM packages', roles: ['prover', 'zk'], capabilities: ['zk', 'plonky3', 'multi-circuit'], status: 'partial', implementationPhase: 98, source_file: 'provers/multi-stark-bridge.ts', public_symbols: ['MultiStarkBridge', 'loadMultiStarkPackage', 'policyObligationsToMultiStarkInputs'], notes: 'adapter implemented; upstream project currently exposes Rust crate/repo, native WASM package remains external' },
  { name: 'neural-prover', module: 'src/services/provers/neural-prover-bridge', description: 'LLM-guided proof sketch verifier', roles: ['prover', 'neural'], capabilities: ['llm', 'lean4', 'coq'], status: 'implemented', implementationPhase: 6, source_file: 'provers/neural-prover-bridge.ts', public_symbols: ['NeuralProverBridge'], notes: '' },
  { name: 'dcec-native',   module: 'src/services/provers/dcec-prover-bridge',  description: 'Native TypeScript DCEC forward-chaining prover', roles: ['prover', 'deontic'], capabilities: ['dcec', 'obligation', 'prohibition', 'modal_deontic'], status: 'implemented', implementationPhase: 9, source_file: 'provers/dcec-prover-bridge.ts', public_symbols: ['DcecProverBridge'], notes: '' },
  { name: 'tdfol-native',  module: 'src/services/provers/tdfol-prover-bridge', description: 'Native TypeScript TDFOL + LTL prover', roles: ['prover', 'temporal', 'deontic'], capabilities: ['tdfol', 'ltl', 'sdl', 'temporal'], status: 'implemented', implementationPhase: 10, source_file: 'provers/tdfol-prover-bridge.ts', public_symbols: ['TdfolProverBridge'], notes: '' },
  { name: 'tdfol-extended', module: 'src/services/provers/tdfol-extended-rules', description: 'Extended TDFOL rules (S4/S5/ObligationWeakening/CTD/temporal-deontic)', roles: ['prover', 'temporal', 'deontic'], capabilities: ['s4', 's5', 'deontic_detachment', 'future_obligation'], status: 'implemented', implementationPhase: 13, source_file: 'provers/tdfol-extended-rules.ts', public_symbols: ['ExtendedTdfolProverBridge'], notes: '' },
  // --- ZKP ---
  { name: 'zkp-ucan',      module: 'src/services/zkp/zkp-ucan-bridge',         description: 'ZKP→UCAN capability caveat bridge', roles: ['zkp', 'ucan'], capabilities: ['zkp_caveat', 'ucan_delegation', 'simulation'], status: 'implemented', implementationPhase: 11, source_file: 'zkp/zkp-ucan-bridge.ts', public_symbols: ['ZkpUcanBridge', 'ZkpCapabilityEvidence'], notes: '' },
  // --- Deontic Layer ---
  { name: 'deontic-analyzer', module: 'src/services/logic/deontic/deontic-text-analyzer', description: 'Regex NL→deontic statement extraction + conflict detection', roles: ['deontic', 'nlp'], capabilities: ['extract_obligations', 'detect_conflicts'], status: 'implemented', implementationPhase: 12, source_file: 'deontic/deontic-text-analyzer.ts', public_symbols: ['DeonticTextAnalyzer'], notes: '' },
  { name: 'deontic-kb',    module: 'src/services/logic/deontic/deontic-knowledge-base', description: 'Temporal deontic KB with rule inference', roles: ['deontic', 'kb'], capabilities: ['rule_inference', 'compliance_check'], status: 'implemented', implementationPhase: 12, source_file: 'deontic/deontic-knowledge-base.ts', public_symbols: ['DeonticKnowledgeBase'], notes: '' },
  { name: 'deontic-graph', module: 'src/services/logic/deontic/deontic-graph',        description: 'Typed O/P/F/R node+rule graph with conflict detection', roles: ['deontic', 'graph'], capabilities: ['detect_conflicts', 'assess_rules', 'source_gap'], status: 'implemented', implementationPhase: 16, source_file: 'deontic/deontic-graph.ts', public_symbols: ['DeonticGraph', 'DeonticGraphBuilder'], notes: '' },
  { name: 'legal-norm-ir', module: 'src/services/logic/deontic/legal-norm-ir',        description: 'LegalNormIR typed IR + deterministic decoder', roles: ['deontic', 'ir', 'decoder'], capabilities: ['decode_obligation', 'decode_definition', 'decode_exemption'], status: 'implemented', implementationPhase: 17, source_file: 'deontic/legal-norm-ir.ts', public_symbols: ['LegalNormIR', 'buildLegalNormIR', 'decodeLegalNormIR'], notes: '' },
  { name: 'parser-utils',  module: 'src/services/logic/deontic/deontic-parser-utils',  description: 'classifyModal/classifyLegalEntity/scoreScaffoldQuality utilities', roles: ['deontic', 'parser'], capabilities: ['classify_modal', 'classify_entity', 'score_quality'], status: 'implemented', implementationPhase: 18, source_file: 'deontic/deontic-parser-utils.ts', public_symbols: ['classifyModal', 'classifyLegalEntity', 'normalizePredicate'], notes: '' },
  { name: 'prover-syntax', module: 'src/services/logic/deontic/prover-syntax-builder', description: 'Multi-target prover syntax (Z3/DCEC/TDFOL/Lean4/Prolog) from LegalNormIR', roles: ['deontic', 'prover', 'syntax'], capabilities: ['z3-smt2', 'dcec', 'tdfol', 'lean4', 'prolog'], status: 'implemented', implementationPhase: 18, source_file: 'deontic/prover-syntax-builder.ts', public_symbols: ['ProverSyntaxBuilder', 'ProverTargetSyntaxRecord'], notes: '' },
  // --- FOL / NL ---
  { name: 'fol-converter', module: 'src/services/logic/fol/fol-text-converter',       description: 'Regex NL→FOL converter (∀x/∃x, Prolog, TPTP)', roles: ['fol', 'nlp'], capabilities: ['extract_predicates', 'parse_quantifiers', 'build_formula'], status: 'implemented', implementationPhase: 14, source_file: 'fol/fol-text-converter.ts', public_symbols: ['FolTextConverter'], notes: '' },
  { name: 'flogic-optimizer', module: 'src/services/logic/fol/flogic-semantic-optimizer', description: 'Cosine similarity + F-logic ontology consistency scorer', roles: ['fol', 'quality'], capabilities: ['cosine_similarity', 'ontology_check'], status: 'implemented', implementationPhase: 15, source_file: 'fol/flogic-semantic-optimizer.ts', public_symbols: ['FLogicSemanticOptimizer', 'cosineSimilarity'], notes: '' },
  // --- Bridge ---
  { name: 'prover-router-bridge', module: 'src/services/logic/bridges/prover-router-bridge', description: 'Batch TDFOL formula → ProofGateResult via prover stack', roles: ['bridge', 'prover'], capabilities: ['batch_evaluate', 'check_consistency'], status: 'implemented', implementationPhase: 13, source_file: 'bridge/prover-router-bridge.ts', public_symbols: ['ProverRouterBridgeAdapter', 'ProofGateResult'], notes: '' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return all registered submodule specs. */
export function getSubmoduleSpecs(): LogicSubmoduleSpec[] {
  return [..._SPECS];
}

/** Return a spec by name, or undefined if not found. */
export function getSubmoduleSpec(name: string): LogicSubmoduleSpec | undefined {
  return _SPECS.find(s => s.name === name);
}

/** Return all spec names, optionally filtered by status. */
export function getSubmoduleNames(filter?: { status?: LogicSubmoduleSpec['status'] }): string[] {
  let specs = _SPECS;
  if (filter?.status) specs = specs.filter(s => s.status === filter.status);
  return specs.map(s => s.name);
}

/**
 * Return a JSON-serialisable integration manifest.
 *
 * Python ref: `logic_integration_manifest()` in submodule_registry.py.
 */
export function getIntegrationManifest(): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const spec of _SPECS) {
    entries[spec.name] = {
      module:          spec.module,
      description:     spec.description,
      roles:           spec.roles,
      capabilities:    spec.capabilities,
      status:          spec.status,
      implementation_phase: spec.implementationPhase,
      public_symbols:  spec.public_symbols,
    };
  }
  return {
    version:    '1.0.0',
    total:      _SPECS.length,
    implemented: _SPECS.filter(s => s.status === 'implemented').length,
    entries,
  };
}
