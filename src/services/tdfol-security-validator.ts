/**
 * TDFOL Security Validator — input security validation for the prover stack.
 *
 * Mirrors ipfs_datasets_py/logic/TDFOL/security_validator.py (777 lines):
 *   SecurityLevel, ThreatType, ValidationResult, AuditResult, SecurityConfig,
 *   SecurityValidator, validate_formula(), audit_proof()
 *
 * Protects the prover stack against:
 *   - Oversized formula inputs (DoS)
 *   - Deep nesting (recursive bomb / stack overflow)
 *   - Injection patterns (script injection in formula strings)
 *   - Malformed unicode (invalid characters)
 *   - Blocked keyword patterns
 *
 * Sprint 22, T-114.
 * Reference: ipfs_datasets_py/logic/TDFOL/security_validator.py §SecurityValidator
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type SecurityLevel = 'low' | 'medium' | 'high' | 'paranoid';

export type ThreatType =
  | 'injection'
  | 'dos'
  | 'resource_exhaustion'
  | 'malformed_input'
  | 'side_channel'
  | 'recursive_bomb'
  | 'invalid_zkp';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SecurityValidationResult {
  readonly valid:    boolean;
  readonly errors:   string[];
  readonly warnings: string[];
  readonly threats:  ThreatType[];
  readonly metadata: Record<string, unknown>;
}

export interface AuditResult {
  readonly passed:           boolean;
  readonly vulnerabilities:  string[];
  readonly recommendations:  string[];
  readonly risk_level:       'low' | 'medium' | 'high' | 'critical';
  readonly audit_time_ms:    number;
}

// ---------------------------------------------------------------------------
// SecurityConfig
// ---------------------------------------------------------------------------

export interface SecurityConfig {
  /** Maximum characters in a formula string. */
  maxFormulaSize:    number;
  /** Maximum nesting depth (matching parentheses). */
  maxFormulaDepth:   number;
  /** Maximum number of variables per formula. */
  maxVariables:      number;
  /** Maximum number of operators in a formula. */
  maxOperators:      number;
  /** Security level — higher = more aggressive blocking. */
  securityLevel:     SecurityLevel;
  /** Regex patterns that are always blocked. */
  blocklist:         RegExp[];
}

const DEFAULT_CONFIG: SecurityConfig = {
  maxFormulaSize:    10_000,
  maxFormulaDepth:   100,
  maxVariables:      1_000,
  maxOperators:      5_000,
  securityLevel:     'medium',
  blocklist: [
    /<script/i,
    /javascript:/i,
    /eval\s*\(/i,
    /\$\{/,           // template injection
    /\bexec\b/i,
    /\bos\.system\b/i,
  ],
};

// ---------------------------------------------------------------------------
// SecurityValidator
// ---------------------------------------------------------------------------

/**
 * SecurityValidator — validates formula/KB inputs before passing to provers.
 *
 * Python ref: `SecurityValidator` class in security_validator.py.
 */
export class SecurityValidator {
  private readonly config: SecurityConfig;

  constructor(config?: Partial<SecurityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Formula validation
  // ---------------------------------------------------------------------------

  /**
   * Validate a single formula string for security issues.
   *
   * Python ref: `SecurityValidator.validate_formula(formula)`.
   */
  validateFormula(formula: string): SecurityValidationResult {
    const errors:   string[]   = [];
    const warnings: string[]   = [];
    const threats:  ThreatType[] = [];

    if (typeof formula !== 'string') {
      return { valid: false, errors: ['formula must be a string'], warnings, threats, metadata: {} };
    }

    // 1. Size check — DoS protection
    if (formula.length > this.config.maxFormulaSize) {
      errors.push(`formula exceeds maximum size (${formula.length} > ${this.config.maxFormulaSize} chars)`);
      threats.push('dos');
    }

    // 2. Nesting depth — recursive bomb protection
    const depth = this._maxNestingDepth(formula);
    if (depth > this.config.maxFormulaDepth) {
      errors.push(`formula nesting depth (${depth}) exceeds limit (${this.config.maxFormulaDepth})`);
      threats.push('recursive_bomb');
    }

    // 3. Operator count
    const opCount = (formula.match(/[∀∃∧∨¬→↔□◊]/g) ?? []).length;
    if (opCount > this.config.maxOperators) {
      errors.push(`formula has too many operators (${opCount} > ${this.config.maxOperators})`);
      threats.push('resource_exhaustion');
    }

    // 4. Blocklist patterns — injection protection
    for (const pattern of this.config.blocklist) {
      if (pattern.test(formula)) {
        errors.push(`formula contains blocked pattern: ${pattern.source}`);
        threats.push('injection');
        break;
      }
    }

    // 5. Invalid characters (paranoid mode)
    if (this.config.securityLevel === 'paranoid') {
      const allowed = new Set(
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' +
        '()[]{}∀∃∧∨¬→↔=≠<>≤≥+-*/,.:_\' □◊XUS',
      );
      const invalid = [...formula].filter(c => !allowed.has(c) && c.charCodeAt(0) > 127);
      if (invalid.length > 0) {
        warnings.push(`formula contains potentially unsafe unicode characters: ${[...new Set(invalid)].join(', ')}`);
        threats.push('malformed_input');
      }
    }

    // 6. Bracket balance warning
    const opens  = (formula.match(/\(/g) ?? []).length;
    const closes = (formula.match(/\)/g) ?? []).length;
    if (opens !== closes) {
      warnings.push(`unbalanced parentheses (${opens} open, ${closes} close) — formula may be malformed`);
    }

    return {
      valid:    errors.length === 0,
      errors,
      warnings,
      threats:  [...new Set(threats)],
      metadata: { formula_length: formula.length, nesting_depth: depth, operator_count: opCount },
    };
  }

  /**
   * Validate an array of KB formulas.
   * Python ref: `SecurityValidator.validate_kb(kb)`.
   */
  validateKb(formulas: string[]): SecurityValidationResult {
    const allErrors:   string[]   = [];
    const allWarnings: string[]   = [];
    const allThreats:  ThreatType[] = [];

    if (!Array.isArray(formulas)) {
      return { valid: false, errors: ['kb must be an array'], warnings: [], threats: [], metadata: {} };
    }

    for (let i = 0; i < formulas.length; i++) {
      const r = this.validateFormula(formulas[i]);
      for (const e of r.errors)   allErrors.push(`[${i}] ${e}`);
      for (const w of r.warnings) allWarnings.push(`[${i}] ${w}`);
      allThreats.push(...r.threats);
    }

    return {
      valid:    allErrors.length === 0,
      errors:   allErrors,
      warnings: allWarnings,
      threats:  [...new Set(allThreats)],
      metadata: { formula_count: formulas.length },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _maxNestingDepth(s: string): number {
    let depth = 0; let max = 0;
    for (const c of s) {
      if (c === '(') { depth++; if (depth > max) max = depth; }
      else if (c === ')') { depth--; }
    }
    return max;
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/**
 * Create a `SecurityValidator` with the given security level.
 * Python ref: `create_validator()`.
 */
export function createValidator(level: SecurityLevel = 'medium'): SecurityValidator {
  const sizeByLevel: Record<SecurityLevel, number> = {
    low:      50_000,
    medium:   10_000,
    high:      5_000,
    paranoid:  2_000,
  };
  const depthByLevel: Record<SecurityLevel, number> = {
    low:      500,
    medium:   100,
    high:      50,
    paranoid:  20,
  };
  return new SecurityValidator({
    securityLevel:  level,
    maxFormulaSize: sizeByLevel[level],
    maxFormulaDepth: depthByLevel[level],
  });
}

/**
 * Validate a single formula at the given security level.
 * Python ref: `validate_formula()`.
 */
export function validateFormula(formula: string, level: SecurityLevel = 'medium'): SecurityValidationResult {
  return createValidator(level).validateFormula(formula);
}

// PORT-080: Additional security methods
export function sanitizeFormula(formula: string): string {
  // Remove potential injection strings while preserving logic symbols
  return formula
    .replace(/[<>"'`\x00-\x1f]/g, '')
    .replace(/javascript:/gi, '')
    .slice(0, 10_000);
}

export interface ZkpProofValidationResult { valid: boolean; reason: string }

export function validateZkpProof(proofJson: string): ZkpProofValidationResult {
  try {
    const proof = JSON.parse(proofJson) as Record<string, unknown>;
    if (!proof['type']) return { valid: false, reason: 'missing type field' };
    if (typeof proof['verified'] !== 'boolean') return { valid: false, reason: 'missing verified field' };
    return { valid: proof['verified'] === true, reason: proof['verified'] ? 'ok' : 'unverified' };
  } catch { return { valid: false, reason: 'invalid JSON' }; }
}
