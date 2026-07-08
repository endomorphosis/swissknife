/**
 * base-prover-bridge.ts
 *
 * Abstract base class and registry for all prover bridges.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/bridges/base_prover_bridge.py
 *
 * Provides:
 *   BridgeCapability  — enum of bridge capabilities
 *   BridgeMetadata    — static bridge description
 *   BaseProverBridge  — abstract base (prove/toTargetFormat/isAvailable/getMetadata)
 *   BridgeRegistry    — register/get/list/getByCap
 *   getBridgeRegistry() — singleton
 */

// ---------------------------------------------------------------------------
// BridgeCapability
// ---------------------------------------------------------------------------

export enum BridgeCapability {
  BIDIRECTIONAL_CONVERSION = 'bidirectional',
  INCREMENTAL_PROVING      = 'incremental',
  RULE_EXTRACTION          = 'rule_extraction',
  OPTIMIZATION             = 'optimization',
  PARALLEL_PROVING         = 'parallel',
}

// ---------------------------------------------------------------------------
// BridgeMetadata
// ---------------------------------------------------------------------------

export interface BridgeMetadata {
  name: string;
  version: string;
  targetSystem: string;
  capabilities: BridgeCapability[];
  requiresExternalProver: boolean;
  description: string;
}

// ---------------------------------------------------------------------------
// BaseProverBridge — abstract
// ---------------------------------------------------------------------------

export interface BridgeProofResult {
  proved: boolean;
  formula: string;
  method: string;
  steps: string[];
  timeMs: number;
  confidence: number;
  targetResult?: unknown;
}

export abstract class BaseProverBridge {
  abstract getMetadata(): BridgeMetadata;

  /** Check if the target prover system is available (no external deps = always true). */
  isAvailable(): boolean { return true; }

  /** Convert a TDFOL formula to the target system's format. */
  abstract toTargetFormat(formula: string): string;

  /** Convert a target system result back to a standard BridgeProofResult. */
  abstract fromTargetFormat(targetResult: unknown, formula: string): BridgeProofResult;

  /** Prove a formula using the target system. */
  abstract prove(formula: string): BridgeProofResult;

  /** Prove a batch of formulas. */
  proveBatch(formulas: string[]): BridgeProofResult[] {
    return formulas.map(f => this.prove(f));
  }

  hasCapability(cap: BridgeCapability): boolean {
    return this.getMetadata().capabilities.includes(cap);
  }
}

// ---------------------------------------------------------------------------
// BridgeRegistry
// ---------------------------------------------------------------------------

export class BridgeRegistry {
  private bridges: Map<string, BaseProverBridge> = new Map();

  /** Register a bridge implementation. */
  register(bridge: BaseProverBridge): void {
    const { name } = bridge.getMetadata();
    this.bridges.set(name, bridge);
  }

  /** Retrieve a bridge by name. Returns undefined if not found. */
  get(name: string): BaseProverBridge | undefined {
    return this.bridges.get(name);
  }

  /** List all registered bridge names. */
  list(): string[] {
    return [...this.bridges.keys()].sort();
  }

  /** Find all bridges that have a given capability. */
  getByCap(capability: BridgeCapability): BaseProverBridge[] {
    return [...this.bridges.values()].filter(b => b.hasCapability(capability));
  }

  /** Return metadata for all registered bridges. */
  getAllMetadata(): BridgeMetadata[] {
    return [...this.bridges.values()].map(b => b.getMetadata());
  }

  get size(): number { return this.bridges.size; }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _registry: BridgeRegistry | null = null;

export function getBridgeRegistry(): BridgeRegistry {
  if (!_registry) _registry = new BridgeRegistry();
  return _registry;
}

export function resetBridgeRegistry(): void {
  _registry = null;
}

// ---------------------------------------------------------------------------
// A concrete stub bridge for testing
// ---------------------------------------------------------------------------

export class StubProverBridge extends BaseProverBridge {
  private name: string;

  constructor(name = 'stub', private caps: BridgeCapability[] = [BridgeCapability.BIDIRECTIONAL_CONVERSION]) {
    super();
    this.name = name;
  }

  getMetadata(): BridgeMetadata {
    return {
      name: this.name,
      version: '1.0.0',
      targetSystem: 'stub',
      capabilities: this.caps,
      requiresExternalProver: false,
      description: 'Stub bridge for testing',
    };
  }

  toTargetFormat(formula: string): string {
    return `STUB(${formula})`;
  }

  fromTargetFormat(targetResult: unknown, formula: string): BridgeProofResult {
    const proved = String(targetResult).includes('proved');
    return { proved, formula, method: 'stub', steps: [], timeMs: 0, confidence: proved ? 0.7 : 0 };
  }

  prove(formula: string): BridgeProofResult {
    const t0 = performance.now();
    // Prove simple deontic and event-calculus forms
    const proved = /^[OPF]\(|^Happens\(|^HoldsAt\(/.test(formula);
    return {
      proved, formula,
      method: 'stub_lookup',
      steps: proved ? [`STUB proved: ${formula}`] : [],
      timeMs: performance.now() - t0,
      confidence: proved ? 0.7 : 0,
    };
  }
}
