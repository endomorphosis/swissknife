/**
 * Sprint 67 — Groth16 Backup + CEC Delegate + Expansion Rules
 * Ports of: zkp/backends/groth16_backup.py (222L),
 *           TDFOL/strategies/cec_delegate.py (216L),
 *           TDFOL/expansion_rules.py (209L)
 */

// ---------------------------------------------------------------------------
// T-310a — Groth16 Backup Backend (groth16_backup.py)
// ---------------------------------------------------------------------------

export interface ProvingKey   { circuitId: string; provingKeyHex: string }
export interface VerifyingKey { circuitId: string; verifyingKeyHex: string }

export interface R1CSCircuit {
  circuitId:    string;
  numVariables: number;
  numConstraints: number;
  constraints:  Array<{ a: number[]; b: number[]; c: number[] }>;
}

export class Groth16BackupBackend {
  async generateProof(witnessJson: string, provingKey: ProvingKey): Promise<string> {
    // Simulated Groth16 proof generation (pure-JS fallback)
    const seed = Buffer.from(witnessJson + provingKey.circuitId).toString('base64').slice(0, 32);
    return JSON.stringify({ type: 'groth16-backup', proof: seed, verified: true });
  }

  async verifyProof(proofJson: string, verifyingKey: VerifyingKey): Promise<boolean> {
    try {
      const proof = JSON.parse(proofJson) as { type?: string; verified?: boolean };
      return proof.type === 'groth16-backup' && proof.verified === true;
    } catch { return false; }
  }

  generateCircuit(id: string, numVariables = 4, numConstraints = 3): R1CSCircuit {
    return {
      circuitId:      id,
      numVariables,
      numConstraints,
      constraints:    Array.from({ length: numConstraints }, (_, i) => ({
        a: [1, 0, 0, 0].slice(0, numVariables),
        b: [0, 1, 0, 0].slice(0, numVariables),
        c: [0, 0, 1, 0].slice(0, numVariables),
      })),
    };
  }

  generateProvingKey(circuit: R1CSCircuit): ProvingKey {
    return { circuitId: circuit.circuitId, provingKeyHex: Buffer.from(circuit.circuitId).toString('hex') };
  }

  generateVerifyingKey(circuit: R1CSCircuit): VerifyingKey {
    return { circuitId: circuit.circuitId, verifyingKeyHex: Buffer.from(`vk-${circuit.circuitId}`).toString('hex') };
  }
}

// ---------------------------------------------------------------------------
// T-310b — CEC Delegate Strategy (cec_delegate.py)
// ---------------------------------------------------------------------------

export type ProverResult = { proved: boolean; proof?: string; error?: string };

export interface DelegateProverStrategy {
  name: string;
  prove(formula: string, axioms: string[]): Promise<ProverResult>;
  isAvailable(): boolean;
}

export class CECDelegateStrategy implements DelegateProverStrategy {
  readonly name = 'cec-delegate';
  private _available = false;

  constructor(private readonly cecPath?: string) {
    this._available = !!cecPath;
  }

  isAvailable(): boolean { return this._available; }

  async prove(formula: string, axioms: string[]): Promise<ProverResult> {
    if (!this._available) {
      return { proved: false, error: 'CEC prover not available — set cecPath in constructor' };
    }
    // Real impl would spawn CEC binary; return simulated result
    return { proved: false, error: 'CEC FFI not bound' };
  }
}

/** Try to locate a CEC prover binary and return a configured delegate. */
export function createCECDelegate(): CECDelegateStrategy {
  try {
    const { execSync } = require('child_process') as { execSync: (cmd: string) => string };
    const path = execSync('which cec 2>/dev/null').trim();
    return new CECDelegateStrategy(path || undefined);
  } catch { return new CECDelegateStrategy(); }
}

// ---------------------------------------------------------------------------
// T-310c — Expansion Rules (expansion_rules.py)
// ---------------------------------------------------------------------------

export interface ExpansionBranch { formulas: string[] }

export abstract class ExpansionRule {
  abstract readonly name: string;
  abstract matches(formula: string, negated: boolean): boolean;
  abstract expand(formula: string, negated: boolean): ExpansionBranch[];
}

export class AndExpansionRule extends ExpansionRule {
  readonly name = 'and-expansion';

  matches(formula: string, negated: boolean): boolean {
    return negated ? false : /∧|&&|\band\b/i.test(formula);
  }

  expand(formula: string): ExpansionBranch[] {
    const parts = formula.split(/\s*∧\s*|\s*&&\s*|\s+and\s+/i);
    return parts.map(p => ({ formulas: [p.trim()] }));
  }
}

export class OrExpansionRule extends ExpansionRule {
  readonly name = 'or-expansion';

  matches(formula: string, negated: boolean): boolean {
    return negated ? false : /∨|\|\||\bor\b/i.test(formula);
  }

  expand(formula: string): ExpansionBranch[] {
    const parts = formula.split(/\s*∨\s*|\s*\|\|\s*|\s+or\s+/i);
    return [{ formulas: parts.map(p => p.trim()) }];
  }
}

export class ImpliesExpansionRule extends ExpansionRule {
  readonly name = 'implies-expansion';

  matches(formula: string, negated: boolean): boolean {
    return !negated && /→|=>/.test(formula);
  }

  expand(formula: string): ExpansionBranch[] {
    const [ant, cons] = formula.split(/\s*→\s*|\s*=>\s*/);
    if (!ant || !cons) return [{ formulas: [formula] }];
    return [{ formulas: [`¬${ant.trim()}`] }, { formulas: [cons.trim()] }];
  }
}

export class IffExpansionRule extends ExpansionRule {
  readonly name = 'iff-expansion';

  matches(formula: string, negated: boolean): boolean {
    return !negated && /↔|<=>/.test(formula);
  }

  expand(formula: string): ExpansionBranch[] {
    const [left, right] = formula.split(/\s*↔\s*|\s*<=>\s*/);
    if (!left || !right) return [{ formulas: [formula] }];
    return [
      { formulas: [`${left.trim()} → ${right.trim()}`, `${right.trim()} → ${left.trim()}`] },
    ];
  }
}

export class NotExpansionRule extends ExpansionRule {
  readonly name = 'not-expansion';

  matches(formula: string, negated: boolean): boolean {
    return !negated && /^¬|^~/.test(formula.trim());
  }

  expand(formula: string): ExpansionBranch[] {
    const inner = formula.trim().replace(/^[¬~]\s*/, '');
    return [{ formulas: [inner] }];
  }
}

const _allRules: ExpansionRule[] = [
  new AndExpansionRule(),
  new OrExpansionRule(),
  new ImpliesExpansionRule(),
  new IffExpansionRule(),
  new NotExpansionRule(),
];

export function getAllExpansionRules(): ExpansionRule[] { return [..._allRules]; }

export function selectExpansionRule(formula: string, negated = false): ExpansionRule | null {
  return _allRules.find(r => r.matches(formula, negated)) ?? null;
}
