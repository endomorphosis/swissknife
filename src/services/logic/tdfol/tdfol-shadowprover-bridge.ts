/**
 * tdfol-shadowprover-bridge.ts
 *
 * Bridge between TDFOL and ShadowProver modal logic provers.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/bridges/tdfol_shadowprover_bridge.py
 *
 * Provides:
 *   ModalLogicType           — K | T | S4 | S5 | D
 *   TDFOLShadowProverBridge  — modal proof via ShadowProver (simulated)
 *   ModalAwareTDFOLProver    — proveModal / proveInSystem
 *   createModalAwareProver() — factory
 */

import { BaseProverBridge, BridgeCapability, BridgeMetadata, BridgeProofResult } from '../../proof-engine/index.js';

// ---------------------------------------------------------------------------
// ModalLogicType
// ---------------------------------------------------------------------------

export enum ModalLogicType {
  K  = 'K',    // Basic modal logic
  T  = 'T',    // Reflexive (□p → p)
  S4 = 'S4',   // Reflexive + Transitive
  S5 = 'S5',   // Equivalence relation
  D  = 'D',    // Serial (□p → ◊p) — for deontic logic
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODAL_FORMULA_RE = /^[□◊]/;
const DEONTIC_RE       = /^[OPF]\(/;

function isModalFormula(formula: string): boolean {
  return MODAL_FORMULA_RE.test(formula) || DEONTIC_RE.test(formula);
}

function bestSystemForFormula(formula: string): ModalLogicType {
  if (DEONTIC_RE.test(formula)) return ModalLogicType.D;
  if (formula.startsWith('□')) return ModalLogicType.S4;
  if (formula.startsWith('◊')) return ModalLogicType.K;
  return ModalLogicType.K;
}

function shadowProveSimulated(formula: string, system: ModalLogicType): { proved: boolean; confidence: number; steps: string[] } {
  // Simulated ShadowProver: modal and deontic formulas prove in their native system
  if (isModalFormula(formula)) {
    const confidence =
      system === ModalLogicType.S5 ? 0.95 :
      system === ModalLogicType.S4 ? 0.90 :
      system === ModalLogicType.D  ? 0.85 :
      system === ModalLogicType.T  ? 0.80 : 0.75;
    return { proved: true, confidence, steps: [`ShadowProver(${system}): ${formula.slice(0, 40)}`] };
  }
  return { proved: false, confidence: 0, steps: [] };
}

// ---------------------------------------------------------------------------
// TDFOLShadowProverBridge
// ---------------------------------------------------------------------------

export class TDFOLShadowProverBridge extends BaseProverBridge {
  private system: ModalLogicType;

  constructor(system: ModalLogicType = ModalLogicType.K) {
    super();
    this.system = system;
  }

  getMetadata(): BridgeMetadata {
    return {
      name: `tdfol-shadowprover-${this.system}`,
      version: '1.0.0',
      targetSystem: `ShadowProver(${this.system})`,
      capabilities: [BridgeCapability.BIDIRECTIONAL_CONVERSION, BridgeCapability.INCREMENTAL_PROVING],
      requiresExternalProver: false,
      description: `TDFOL ↔ ShadowProver bridge for modal logic system ${this.system}`,
    };
  }

  toTargetFormat(formula: string): string {
    // TDFOL → ShadowProver format
    return formula
      .replace(/O\(([^)]+)\)/g, `Obligatory($1)`)
      .replace(/P\(([^)]+)\)/g, `Permitted($1)`)
      .replace(/F\(([^)]+)\)/g, `Forbidden($1)`)
      .replace(/□/g, 'Necessarily')
      .replace(/◊/g, 'Possibly');
  }

  fromTargetFormat(targetResult: unknown, formula: string): BridgeProofResult {
    const proved = String(targetResult).toLowerCase().includes('proved') || String(targetResult).includes('true');
    return { proved, formula, method: `shadowprover_${this.system}`, steps: [], timeMs: 0, confidence: proved ? 0.8 : 0 };
  }

  prove(formula: string): BridgeProofResult {
    const t0 = performance.now();
    const { proved, confidence, steps } = shadowProveSimulated(formula, this.system);
    return { proved, formula, method: `shadowprover_${this.system}`, steps, timeMs: performance.now() - t0, confidence };
  }
}

// ---------------------------------------------------------------------------
// ModalAwareTDFOLProver
// ---------------------------------------------------------------------------

export interface ModalProofResult {
  formula: string;
  logicSystem: ModalLogicType;
  proved: boolean;
  confidence: number;
  steps: string[];
  timeMs: number;
}

export class ModalAwareTDFOLProver {
  private bridges: Map<ModalLogicType, TDFOLShadowProverBridge>;

  constructor() {
    this.bridges = new Map(
      Object.values(ModalLogicType).map(sys => [sys, new TDFOLShadowProverBridge(sys as ModalLogicType)])
    );
  }

  /** Prove a formula using the most appropriate modal logic system. */
  proveModal(formula: string, preferredSystem?: ModalLogicType): ModalProofResult {
    const system = preferredSystem ?? bestSystemForFormula(formula);
    const bridge = this.bridges.get(system) ?? this.bridges.get(ModalLogicType.K)!;
    const result = bridge.prove(formula);
    return {
      formula,
      logicSystem: system,
      proved: result.proved,
      confidence: result.confidence,
      steps: result.steps,
      timeMs: result.timeMs,
    };
  }

  /** Prove a formula in a specific modal logic system. */
  proveInSystem(formula: string, system: ModalLogicType): ModalProofResult {
    return this.proveModal(formula, system);
  }

  /** Prove a formula in all systems and return all results. */
  proveInAllSystems(formula: string): ModalProofResult[] {
    return Object.values(ModalLogicType).map(sys =>
      this.proveModal(formula, sys as ModalLogicType)
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createModalAwareProver(): ModalAwareTDFOLProver {
  return new ModalAwareTDFOLProver();
}
