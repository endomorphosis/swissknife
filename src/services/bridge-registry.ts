/**
 * bridge-registry.ts
 *
 * Registry of all known legal IR bridge adapter specifications.
 * TypeScript port of ipfs_datasets_py/logic/bridge/registry.py
 *
 * Provides:
 *   LogicBridgeSpec         — static description of one bridge adapter
 *   SPECS                   — tuple of all 6 registered bridge specs
 *   logicBridgeSpecs()      — return all (or only implemented) specs
 *   logicBridgeSpec(name)   — look up a single spec by name
 *   logicBridgeManifest()   — full manifest dict for optimizer routing
 *   bridgeNameForComponent()— find the most specific bridge for a component
 */

// ---------------------------------------------------------------------------
// LogicBridgeSpec
// ---------------------------------------------------------------------------

export interface LogicBridgeSpecInit {
  name: string;
  targetComponent: string;
  adapterModule: string;
  adapterClass: string;
  description: string;
  roles: readonly string[];
  sourceView: string;
  targetViews: readonly string[];
  lossNames?: readonly string[];
  requiredSubmodules?: readonly string[];
  astScope?: string;
  implemented?: boolean;
}

export class LogicBridgeSpec {
  readonly name: string;
  readonly targetComponent: string;
  readonly adapterModule: string;
  readonly adapterClass: string;
  readonly description: string;
  readonly roles: readonly string[];
  readonly sourceView: string;
  readonly targetViews: readonly string[];
  readonly lossNames: readonly string[];
  readonly requiredSubmodules: readonly string[];
  readonly astScope: string;
  readonly implemented: boolean;

  constructor(init: LogicBridgeSpecInit) {
    this.name = init.name;
    this.targetComponent = init.targetComponent;
    this.adapterModule = init.adapterModule;
    this.adapterClass = init.adapterClass;
    this.description = init.description;
    this.roles = init.roles;
    this.sourceView = init.sourceView;
    this.targetViews = init.targetViews;
    this.lossNames = init.lossNames ?? [];
    this.requiredSubmodules = init.requiredSubmodules ?? [];
    this.astScope = init.astScope ?? '';
    this.implemented = init.implemented ?? true;
  }

  toDict(): Record<string, unknown> {
    return {
      adapter_class: this.adapterClass,
      adapter_module: this.adapterModule,
      ast_scope: this.astScope,
      description: this.description,
      implemented: this.implemented,
      loss_names: [...this.lossNames],
      name: this.name,
      required_submodules: [...this.requiredSubmodules],
      roles: [...this.roles],
      source_view: this.sourceView,
      target_component: this.targetComponent,
      target_views: [...this.targetViews],
    };
  }
}

// ---------------------------------------------------------------------------
// SPECS — all registered bridge adapters
// ---------------------------------------------------------------------------

export const SPECS: readonly LogicBridgeSpec[] = Object.freeze([
  new LogicBridgeSpec({
    name: 'modal_frame_logic',
    targetComponent: 'modal.frame_logic',
    adapterModule: 'ipfs_datasets_py.logic.bridge.modal_frame_logic',
    adapterClass: 'ModalFrameLogicBridgeAdapter',
    description:
      'spaCy legal text -> modal IR with embedded frame logic, Neo4j-compatible graph projection, and modal prover compilation gate.',
    roles: ['legal_ir', 'modal', 'frame_logic', 'kg', 'prover', 'loss'],
    sourceView: 'legal_text',
    targetViews: ['modal_ir', 'frame_logic', 'neo4j_graph_data'],
    lossNames: [
      'cosine_similarity', 'cosine_loss', 'cross_entropy_loss',
      'reconstruction_loss', 'text_reconstruction_loss',
      'source_decompiled_text_embedding_cosine_loss',
      'source_decompiled_text_token_loss',
      'frame_ranking_loss', 'flogic_similarity_loss', 'symbolic_validity_penalty',
    ],
    requiredSubmodules: ['modal', 'flogic', 'knowledge_graphs'],
    astScope: 'frame_logic',
  }),

  new LogicBridgeSpec({
    name: 'deontic_norms',
    targetComponent: 'deontic.ir',
    adapterModule: 'ipfs_datasets_py.logic.bridge.deontic_norms',
    adapterClass: 'DeonticNormsBridgeAdapter',
    description:
      'Legal text -> deontic LegalNormIR, frame records, prover syntax, and bridge metrics.',
    roles: ['legal_ir', 'deontic', 'frame_logic', 'prover_input', 'loss'],
    sourceView: 'legal_text',
    targetViews: ['deontic_ir', 'frame_logic', 'prover_formulas', 'neo4j_graph_data'],
    lossNames: [
      'cosine_similarity', 'cosine_loss', 'cross_entropy_loss',
      'reconstruction_loss', 'text_reconstruction_loss',
      'frame_ranking_loss', 'flogic_similarity_loss',
      'ontology_violation_count', 'symbolic_validity_penalty',
    ],
    requiredSubmodules: ['deontic'],
    astScope: 'deontic',
  }),

  new LogicBridgeSpec({
    name: 'fol_tdfol',
    targetComponent: 'TDFOL.prover',
    adapterModule: 'ipfs_datasets_py.logic.bridge.fol_tdfol',
    adapterClass: 'FolTdfolBridgeAdapter',
    description:
      'Legal text -> FOL/TDFOL formulas, proof obligations, and parser proof gate.',
    roles: ['legal_ir', 'fol', 'tdfol', 'temporal', 'prover'],
    sourceView: 'legal_text',
    targetViews: ['tdfol_formulas', 'frame_logic', 'neo4j_graph_data'],
    lossNames: [
      'cosine_similarity', 'cosine_loss', 'cross_entropy_loss',
      'reconstruction_loss', 'text_reconstruction_loss',
      'frame_ranking_loss', 'symbolic_validity_penalty',
    ],
    requiredSubmodules: ['TDFOL'],
    astScope: 'tdfol',
  }),

  new LogicBridgeSpec({
    name: 'cec_dcec',
    targetComponent: 'CEC.native',
    adapterModule: 'ipfs_datasets_py.logic.bridge.cec_dcec',
    adapterClass: 'CecDcecBridgeAdapter',
    description:
      'Legal text -> CEC/DCEC event formulas, validation trace, and graph records.',
    roles: ['legal_ir', 'cec', 'event_calculus', 'prover'],
    sourceView: 'legal_text',
    targetViews: ['cec_formulas', 'frame_logic', 'neo4j_graph_data'],
    requiredSubmodules: ['CEC'],
    astScope: 'cec',
  }),

  new LogicBridgeSpec({
    name: 'external_prover_router',
    targetComponent: 'external_provers.router',
    adapterModule: 'ipfs_datasets_py.logic.bridge.external_prover_router',
    adapterClass: 'ExternalProverRouterBridgeAdapter',
    description:
      'TDFOL formulas -> lazy external prover-router diagnostics and proof gate.',
    roles: ['prover', 'installer', 'router'],
    sourceView: 'formal_formula',
    targetViews: ['prover_formulas', 'frame_logic', 'neo4j_graph_data'],
    astScope: 'tdfol',
  }),

  new LogicBridgeSpec({
    name: 'zkp_attestation',
    targetComponent: 'zkp.circuits',
    adapterModule: 'ipfs_datasets_py.logic.bridge.zkp_attestation',
    adapterClass: 'ZkpAttestationBridgeAdapter',
    description:
      'Formal proof obligations -> ZKP proof attestation views and graph records.',
    roles: ['legal_ir', 'zkp', 'proof_attestation', 'circuit', 'loss'],
    sourceView: 'formal_formula',
    targetViews: ['zkp_attestations', 'zkp_public_inputs', 'frame_logic', 'neo4j_graph_data'],
    lossNames: [
      'cosine_similarity', 'cosine_loss', 'cross_entropy_loss',
      'reconstruction_loss', 'text_reconstruction_loss',
      'frame_ranking_loss', 'flogic_similarity_loss',
      'ontology_violation_count', 'symbolic_validity_penalty',
    ],
    requiredSubmodules: ['zkp'],
    astScope: 'zkp',
  }),
]);

const SPECS_BY_NAME: ReadonlyMap<string, LogicBridgeSpec> = new Map(
  SPECS.map(s => [s.name, s])
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return all registered bridge specs (optionally only implemented ones). */
export function logicBridgeSpecs(opts: { implementedOnly?: boolean } = {}): readonly LogicBridgeSpec[] {
  if (opts.implementedOnly) return SPECS.filter(s => s.implemented);
  return SPECS;
}

/** Return one bridge spec by name. Throws if not found. */
export function logicBridgeSpec(name: string): LogicBridgeSpec {
  const spec = SPECS_BY_NAME.get(name);
  if (!spec) throw new Error(`Unknown logic bridge: ${JSON.stringify(name)}`);
  return spec;
}

/** Return the full bridge manifest dict used by optimizer routing. */
export function logicBridgeManifest(): Record<string, unknown> {
  const specs = SPECS.map(s => s.toDict());
  const byComponent: Record<string, string[]> = {};
  const roles: Record<string, string[]> = {};
  for (const spec of SPECS) {
    if (!byComponent[spec.targetComponent]) byComponent[spec.targetComponent] = [];
    byComponent[spec.targetComponent].push(spec.name);
    for (const role of spec.roles) {
      if (!roles[role]) roles[role] = [];
      roles[role].push(spec.name);
    }
  }
  return {
    bridge_count: specs.length,
    bridges: specs,
    implemented_bridges: SPECS.filter(s => s.implemented).map(s => s.name),
    manifest_version: 1,
    target_components: Object.fromEntries(
      Object.entries(byComponent)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, [...v].sort()])
    ),
    roles: Object.fromEntries(
      Object.entries(roles)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, [...v].sort()])
    ),
  };
}

/** Find the most specific bridge registered for an optimizer component target. */
export function bridgeNameForComponent(targetComponent: string): string | null {
  const target = String(targetComponent ?? '').trim();
  if (!target) return null;
  const matches = SPECS.filter(
    s => target.startsWith(s.targetComponent) || s.targetComponent.startsWith(target)
  );
  if (matches.length === 0) return null;
  // Prefer the longest targetComponent match (most specific)
  matches.sort((a, b) => b.targetComponent.length - a.targetComponent.length);
  return matches[0].name;
}
