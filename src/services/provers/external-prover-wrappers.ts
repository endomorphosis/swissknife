/**
 * External Prover Wrappers
 * Ports of: external_provers/talos_wrapper.py (379L),
 *           CEC/nl/eng_dcec_wrapper.py (345L),
 *           CEC/native/dcec_wrapper.py (314L),
 *           zkp/zkp_verifier.py (313L)
 */

// ---------------------------------------------------------------------------
// T-314a — Talos Wrapper (talos_wrapper.py)
// ---------------------------------------------------------------------------

export enum ProofResultStatus {
  PROVED      = 'proved',
  DISPROVED   = 'disproved',
  UNKNOWN     = 'unknown',
  TIMEOUT     = 'timeout',
  ERROR       = 'error',
}

export interface ProofAttempt {
  attemptId:  string;
  formula:    string;
  axioms:     string[];
  startedAt:  number;
  finishedAt: number;
  status:     ProofResultStatus;
  proofText?: string;
  error?:     string;
}

export interface TalosConfig {
  timeoutMs?: number;
  maxDepth?:  number;
  strategy?:  string;
}

export class TalosWrapper {
  private readonly config: Required<TalosConfig>;
  private counter = 0;

  constructor(config: TalosConfig = {}) {
    this.config = { timeoutMs: 10_000, maxDepth: 20, strategy: 'default', ...config };
  }

  isAvailable(): boolean {
    try {
      const { execSync } = require('child_process') as { execSync: (cmd: string) => string };
      execSync('talos --version 2>/dev/null');
      return true;
    } catch { return false; }
  }

  async prove(formula: string, axioms: string[] = []): Promise<ProofAttempt> {
    const id = `talos-${++this.counter}`;
    const startedAt = Date.now();

    if (!this.isAvailable()) {
      return {
        attemptId: id, formula, axioms, startedAt, finishedAt: Date.now(),
        status: ProofResultStatus.ERROR, error: 'Talos binary not found',
      };
    }

    return {
      attemptId: id, formula, axioms, startedAt, finishedAt: Date.now(),
      status: ProofResultStatus.UNKNOWN, error: 'Talos FFI not bound',
    };
  }

  async batchProve(problems: Array<{ formula: string; axioms?: string[] }>): Promise<ProofAttempt[]> {
    return Promise.all(problems.map(p => this.prove(p.formula, p.axioms ?? [])));
  }
}

// ---------------------------------------------------------------------------
// T-314b — English DCEC Wrapper (eng_dcec_wrapper.py)
// ---------------------------------------------------------------------------

export interface EngConversionResult {
  success:   boolean;
  dcecText:  string;
  clauses:   string[];
  errors:    string[];
}

export class EngDCECWrapper {
  convert(englishText: string): EngConversionResult {
    const errors: string[] = [];
    const clauses: string[] = [];

    if (!englishText.trim()) {
      errors.push('Input text is empty');
      return { success: false, dcecText: '', clauses, errors };
    }

    // Rule-based heuristic conversion: detect deontic keywords
    const lower = englishText.toLowerCase();
    let dcec = '';

    if (lower.includes('must') && !lower.includes('must not')) {
      const agent  = 'Agent';
      const action = 'Action';
      dcec = `O(${agent}, ${action})`;
      clauses.push(dcec);
    } else if (lower.includes('may') || lower.includes('can')) {
      dcec = 'P(Agent, Action)';
      clauses.push(dcec);
    } else if (lower.includes('must not') || lower.includes('forbidden')) {
      dcec = 'F(Agent, Action)';
      clauses.push(dcec);
    } else {
      dcec = `unknown(${englishText.trim()})`;
      errors.push('Could not determine deontic modality');
    }

    return { success: errors.length === 0, dcecText: dcec, clauses, errors };
  }

  convertBatch(texts: string[]): EngConversionResult[] {
    return texts.map(t => this.convert(t));
  }
}

// ---------------------------------------------------------------------------
// T-314c — DCEC Library Wrapper (dcec_wrapper.py)
// ---------------------------------------------------------------------------

export interface DCECStatement {
  statementId: string;
  formula:     string;
  operator:    string;   // 'O', 'P', 'F', 'K', 'B', etc.
  agent:       string;
  action:      string;
}

export class DCECLibraryWrapper {
  private readonly statements = new Map<string, DCECStatement>();
  private counter = 0;

  addStatement(formula: string): DCECStatement | null {
    // Parse simple operator pattern: OP(agent, action)
    const m = formula.match(/^([A-Z])\(([^,)]+),\s*([^)]+)\)$/);
    if (!m) return null;
    const stmt: DCECStatement = {
      statementId: `stmt-${++this.counter}`,
      formula,
      operator: m[1]!,
      agent:    m[2]!.trim(),
      action:   m[3]!.trim(),
    };
    this.statements.set(stmt.statementId, stmt);
    return stmt;
  }

  getStatement(id: string): DCECStatement | null { return this.statements.get(id) ?? null; }
  listStatements(): DCECStatement[] { return [...this.statements.values()]; }
  removeStatement(id: string): boolean { return this.statements.delete(id); }
  clear(): void { this.statements.clear(); }

  checkConsistency(): boolean {
    const stmts = this.listStatements();
    for (let i = 0; i < stmts.length; i++) {
      for (let j = i + 1; j < stmts.length; j++) {
        const s1 = stmts[i]!;
        const s2 = stmts[j]!;
        if (s1.agent === s2.agent && s1.action === s2.action) {
          // O+F conflict
          if ((s1.operator === 'O' && s2.operator === 'F') ||
              (s1.operator === 'F' && s2.operator === 'O')) return false;
        }
      }
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// T-314d — ZKP Verifier (zkp_verifier.py)
// ---------------------------------------------------------------------------

export interface VerificationResult {
  isValid:   boolean;
  proofHash: string;
  error?:    string;
}

export interface ZKPVerifierStats { verified: number; passed: number; failed: number }

export class ZKPVerifier {
  private readonly stats: ZKPVerifierStats = { verified: 0, passed: 0, failed: 0 };

  async verify(proofJson: string, vkHash: string): Promise<VerificationResult> {
    this.stats.verified++;
    try {
      const proof = JSON.parse(proofJson) as Record<string, unknown>;
      if (proof['type'] === 'groth16' || proof['type'] === 'groth16-backup') {
        if (proof['verified'] === true) {
          this.stats.passed++;
          return { isValid: true, proofHash: vkHash };
        }
      }
      this.stats.failed++;
      return { isValid: false, proofHash: vkHash, error: 'Proof verification failed' };
    } catch {
      this.stats.failed++;
      return { isValid: false, proofHash: vkHash, error: 'Invalid proof JSON' };
    }
  }

  async batchVerify(proofs: Array<{ proofJson: string; vkHash: string }>): Promise<VerificationResult[]> {
    return Promise.all(proofs.map(p => this.verify(p.proofJson, p.vkHash)));
  }

  getStats(): Readonly<ZKPVerifierStats> { return { ...this.stats }; }
}
