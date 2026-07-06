/**
 * integration-init.ts
 *
 * Integration package facade — feature flags and status reporting.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/__init__.py
 *
 * Provides:
 *   SYMBOLIC_AI_AVAILABLE   — runtime feature flag
 *   enableSymbolicAI()      — opt-in activation (no side effects by default)
 *   IntegrationCapabilities — available module capabilities
 *   getIntegrationStatus()  — full status report
 */

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export let SYMBOLIC_AI_AVAILABLE = false;

/**
 * Opt-in activation of SymbolicAI-backed tooling.
 * In the TypeScript implementation SymbolicAI is not available (Python-only),
 * so this always returns false but records the attempt.
 */
export function enableSymbolicAI(opts: { autoconfigureEnv?: boolean } = {}): boolean {
  // In a real deployment this would attempt to load a Python bridge.
  // For the TypeScript stack, SymbolicAI is unavailable — return false.
  SYMBOLIC_AI_AVAILABLE = false;
  return false;
}

/** Reset the feature flag (for testing). */
export function resetSymbolicAI(): void {
  SYMBOLIC_AI_AVAILABLE = false;
}

// ---------------------------------------------------------------------------
// IntegrationCapabilities
// ---------------------------------------------------------------------------

export interface IntegrationCapabilities {
  /** Symbolic AI (symai) integration available */
  symbolicAI: boolean;
  /** Modal logic provers available */
  modalLogic: boolean;
  /** CEC/DCEC inference engine available */
  cecEngine: boolean;
  /** TDFOL proving available */
  tdfolProver: boolean;
  /** Embedding-based retrieval available */
  embeddingRetrieval: boolean;
  /** Interactive FOL construction available */
  interactiveFOL: boolean;
  /** External provers (Vampire/E-Prover) available */
  externalProvers: boolean;
  /** IPFS proof caching available */
  ipfsCache: boolean;
}

export const DEFAULT_CAPABILITIES: IntegrationCapabilities = {
  symbolicAI:         false,   // Python-only
  modalLogic:         true,    // tdfol-shadowprover-bridge.ts
  cecEngine:          true,    // cec-bridge.ts
  tdfolProver:        true,    // tdfol-prover.ts
  embeddingRetrieval: true,    // embedding-prover.ts
  interactiveFOL:     true,    // interactive-fol-constructor.ts
  externalProvers:    false,   // No binary available at runtime
  ipfsCache:          true,    // ipfs-proof-cache.ts
};

// ---------------------------------------------------------------------------
// IntegrationStatus
// ---------------------------------------------------------------------------

export interface IntegrationStatus {
  version: string;
  capabilities: IntegrationCapabilities;
  availableModules: string[];
  unavailableModules: string[];
  warnings: string[];
}

/**
 * Return a full status report for the integration layer.
 */
export function getIntegrationStatus(): IntegrationStatus {
  const caps = { ...DEFAULT_CAPABILITIES, symbolicAI: SYMBOLIC_AI_AVAILABLE };

  const availableModules: string[] = [];
  const unavailableModules: string[] = [];
  const warnings: string[] = [];

  if (caps.symbolicAI) availableModules.push('symbolic-ai');
  else { unavailableModules.push('symbolic-ai'); warnings.push('SymbolicAI not available — call enableSymbolicAI() to activate (Python only)'); }

  if (caps.modalLogic)         availableModules.push('modal-logic', 'tdfol-shadowprover-bridge');
  if (caps.cecEngine)          availableModules.push('cec-bridge', 'dcec-prover');
  if (caps.tdfolProver)        availableModules.push('tdfol-prover');
  if (caps.embeddingRetrieval) availableModules.push('embedding-prover');
  if (caps.interactiveFOL)     availableModules.push('interactive-fol-constructor');
  if (caps.ipfsCache)          availableModules.push('ipfs-proof-cache');

  if (!caps.externalProvers) {
    unavailableModules.push('vampire', 'eprover');
    warnings.push('External provers (Vampire, E-Prover) require installation via prover-installer.ts');
  }

  return {
    version: '1.0.0-sprint43',
    capabilities: caps,
    availableModules: availableModules.sort(),
    unavailableModules: unavailableModules.sort(),
    warnings,
  };
}

/**
 * Check if a specific capability is enabled.
 */
export function hasCapability(name: keyof IntegrationCapabilities): boolean {
  return getIntegrationStatus().capabilities[name];
}
