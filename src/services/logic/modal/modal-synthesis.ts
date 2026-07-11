/**
 * modal-synthesis.ts
 *
 * Modal synthesis hints and residual repair routing.
 * TypeScript port of ipfs_datasets_py/logic/modal/synthesis.py
 *
 * Provides:
 *   ModalProgramSynthesisHint   — a reviewable proposal for compiler work
 *   ModalResidualRepairRoute    — deterministic code-repair route from a residual
 *   RESIDUAL_REPAIR_ROUTES      — static map of loss name → repair route (9 entries)
 *   routeAutoencoderResidual()  — look up repair route for a loss name
 *   residualSignatureForHint()  — stable signature for clustering hints
 */

import { sha256Hex } from '../../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// ModalResidualRepairRoute
// ---------------------------------------------------------------------------

export interface ModalResidualRepairRoute {
  action: string;
  targetComponent: string;
  rationale: string;
  priority: number;
  domain?: string;
  frameFeatures?: string[];
}

// ---------------------------------------------------------------------------
// RESIDUAL_REPAIR_ROUTES
// ---------------------------------------------------------------------------

export const RESIDUAL_REPAIR_ROUTES: Record<string, ModalResidualRepairRoute> = Object.freeze({
  cross_entropy_loss: {
    action: 'refine_modal_family_cue_rules',
    targetComponent: 'modal.compiler.registry',
    rationale: 'Cross-entropy residuals indicate modal-family cue or registry ambiguity.',
    priority: 0.5,
  },
  cosine_loss: {
    action: 'improve_encoder_decoder_reconstruction',
    targetComponent: 'modal.autoencoder',
    rationale: 'Cosine residuals indicate the learned embedding head is not preserving reusable compiler/decompiler features.',
    priority: 0.5,
  },
  reconstruction_loss: {
    action: 'refine_typed_ir_or_decompiler_slots',
    targetComponent: 'modal.ir_decompiler',
    rationale: 'Reconstruction residuals indicate typed IR/decompiler slots are losing source semantics.',
    priority: 0.5,
  },
  source_decompiled_text_embedding_cosine_loss: {
    action: 'refine_semantic_decompiler_reconstruction',
    targetComponent: 'modal.ir_decompiler',
    rationale: 'Source/decompiled text cosine residuals indicate the deterministic IR decoder is not reconstructing source semantics from typed slots.',
    priority: 0.65,
  },
  source_decompiled_text_token_loss: {
    action: 'refine_semantic_decompiler_reconstruction',
    targetComponent: 'modal.ir_decompiler',
    rationale: 'Source/decompiled token residuals indicate the deterministic IR decoder is missing source legal text structure.',
    priority: 0.55,
  },
  legal_ir_view_cross_entropy_loss: {
    action: 'repair_multiview_legal_ir_loss',
    targetComponent: 'bridge.contracts',
    rationale: 'LegalIR view residuals indicate canonical multiview bridge alignment needs repair.',
    priority: 0.5,
  },
  legal_ir_multiview_proof_failure_ratio: {
    action: 'repair_multiview_legal_ir_prover_gate',
    targetComponent: 'external_provers.router',
    rationale: 'Proof-gate residuals indicate external theorem prover routing needs repair.',
    priority: 0.5,
  },
  legal_ir_multiview_graph_failure_penalty: {
    action: 'repair_multiview_legal_ir_graph_projection',
    targetComponent: 'knowledge_graphs.neo4j_compat',
    rationale: 'Graph residuals indicate Neo4j-compatible LegalIR projection needs repair.',
    priority: 0.5,
  },
  deontic_decoder_slot_loss: {
    action: 'repair_deontic_bridge_quality_gate',
    targetComponent: 'deontic.ir',
    rationale: 'Deontic slot residuals indicate LegalNormIR bridge reconstruction needs repair.',
    priority: 0.5,
  },
});

// ---------------------------------------------------------------------------
// routeAutoencoderResidual
// ---------------------------------------------------------------------------

/**
 * Return the deterministic code-repair route for a persistent autoencoder residual.
 *
 * @param lossName  Name of the loss metric that is persistently elevated.
 * @param focus     Optional set of repair-focus hints from the optimizer context.
 */
export function routeAutoencoderResidual(
  lossName: string,
  opts: { focus?: string[] } = {},
): ModalResidualRepairRoute | null {
  const normalized = String(lossName ?? '').trim();
  if (RESIDUAL_REPAIR_ROUTES[normalized]) return RESIDUAL_REPAIR_ROUTES[normalized];

  const focusSet = new Set(opts.focus ?? []);
  if (focusSet.has('repair_deontic_bridge_quality_gate')) {
    return RESIDUAL_REPAIR_ROUTES['deontic_decoder_slot_loss'];
  }
  if (focusSet.has('repair_multiview_legal_ir_graph_projection')) {
    return RESIDUAL_REPAIR_ROUTES['legal_ir_multiview_graph_failure_penalty'];
  }
  if (focusSet.has('repair_external_prover_router')) {
    return RESIDUAL_REPAIR_ROUTES['legal_ir_multiview_proof_failure_ratio'];
  }
  return null;
}

// ---------------------------------------------------------------------------
// ModalProgramSynthesisHint
// ---------------------------------------------------------------------------

export interface ModalProgramSynthesisHintInit {
  hintId: string;
  action: string;
  targetComponent: string;
  rationale: string;
  priority: number;
  domain?: string;
  evidence?: Record<string, unknown>;
  status?: string;
}

export class ModalProgramSynthesisHint {
  readonly hintId: string;
  readonly action: string;
  readonly targetComponent: string;
  readonly rationale: string;
  readonly priority: number;
  readonly domain?: string;
  readonly evidence: Record<string, unknown>;
  readonly status: string;

  constructor(init: ModalProgramSynthesisHintInit) {
    this.hintId = init.hintId;
    this.action = init.action;
    this.targetComponent = init.targetComponent;
    this.rationale = init.rationale;
    this.priority = init.priority;
    this.domain = init.domain;
    this.evidence = init.evidence ?? {};
    this.status = init.status ?? 'proposed';
  }

  toDict(): Record<string, unknown> {
    return {
      action: this.action,
      evidence: this.evidence,
      domain: this.domain ?? null,
      hint_id: this.hintId,
      priority: this.priority,
      rationale: this.rationale,
      status: this.status,
      target_component: this.targetComponent,
    };
  }
}

// ---------------------------------------------------------------------------
// residualSignatureForHint
// ---------------------------------------------------------------------------

/**
 * Return a stable signature string for grouping/deduplicating residual hints.
 * Mirrors the Python implementation's JSON-based hash.
 */
export function residualSignatureForHint(hint: ModalProgramSynthesisHint): string {
  const evidence = hint.evidence ?? {};
  // PORT-121: all 11 Python payload fields included
  const payload = {
    action: hint.action,
    bridge_failure_name: evidence['bridge_failure_name'] ?? evidence['loss_name'] ?? null,
    component_gap: evidence['primary_legal_ir_component_gap'] ?? null,
    family_pair: [
      evidence['predicted_family'] ?? null,
      evidence['target_family'] ?? null,
    ],
    frame_features: ([...(evidence['frame_features'] as string[] ?? [])])
      .map(String)
      .sort()
      .slice(0, 8),
    target_component: hint.targetComponent,
    // PORT-121: 5 additional fields to match Python's 11-field signature
    rule_id:         evidence['rule_id'] ?? null,
    constraint_type: evidence['constraint_type'] ?? null,
    domain:          evidence['domain'] ?? hint.domain ?? null,
    primary_loss:    evidence['primary_loss'] ?? evidence['loss_name'] ?? null,
    hint_status:     hint.status ?? 'proposed',
  };
  const json = JSON.stringify(payload, null, 0);
  return sha256Hex(json).slice(0, 24);
}

// ---------------------------------------------------------------------------
// synthesisHintFromRoute (convenience factory)
// ---------------------------------------------------------------------------

/**
 * Create a `ModalProgramSynthesisHint` from a `ModalResidualRepairRoute` and a loss name.
 */
export function synthesisHintFromRoute(
  lossName: string,
  route: ModalResidualRepairRoute,
  evidence?: Record<string, unknown>,
): ModalProgramSynthesisHint {
  const hintId = sha256Hex(`${lossName}:${route.action}:${route.targetComponent}`).slice(0, 16);
  return new ModalProgramSynthesisHint({
    hintId,
    action: route.action,
    targetComponent: route.targetComponent,
    rationale: route.rationale,
    priority: route.priority,
    domain: route.domain,
    evidence: { loss_name: lossName, ...evidence },
  });
}

// PORT-122: synthesisHintsFromAutoencoderIntrospection — main entry point
export interface AutoencoderIntrospectionResult {
  residualVector:  number[];
  lossBreakdown:   Record<string, number>;
  frameFeatures:   string[];
  predictedFamily: string | null;
  targetFamily:    string | null;
}

export function synthesisHintsFromAutoencoderIntrospection(
  introspection: AutoencoderIntrospectionResult,
  domain?: string,
): ModalProgramSynthesisHint[] {
  const hints: ModalProgramSynthesisHint[] = [];
  // Primary hint from predicted→target family gap
  if (introspection.predictedFamily !== introspection.targetFamily) {
    const lossName = 'family_gap';
    const route: ModalResidualRepairRoute = {
      action: 'REALIGN_FAMILY',
      targetComponent: introspection.targetFamily ?? 'unknown',
      rationale: 'Predicted modal family differs from the target family in autoencoder introspection.',
      priority: 0.8,
      domain: domain ?? 'general',
      frameFeatures: introspection.frameFeatures,
    };
    hints.push(synthesisHintFromRoute(
      lossName,
      route,
      {
        domain: domain ?? 'general',
        predicted_family: introspection.predictedFamily,
        target_family: introspection.targetFamily,
        frame_features: introspection.frameFeatures,
        primary_loss: introspection.lossBreakdown['primary_loss'] ?? null,
      },
    ));
  }
  // Additional hints per loss component
  for (const [key, val] of Object.entries(introspection.lossBreakdown)) {
    if (val > 0.1) {
      const route: ModalResidualRepairRoute = {
        action: 'REDUCE_LOSS',
        targetComponent: key,
        rationale: `Autoencoder loss component ${key} remains above threshold.`,
        priority: Math.min(val, 1),
        domain: domain ?? 'general',
        frameFeatures: introspection.frameFeatures,
      };
      hints.push(synthesisHintFromRoute(
        key,
        route,
        {
          domain: domain ?? 'general',
          frame_features: introspection.frameFeatures,
          primary_loss: key,
        },
      ));
    }
  }
  return hints;
}
