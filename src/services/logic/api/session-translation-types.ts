/**
 * Session and Translation Types
 * Ports of: fol/interactive_fol_types.py (101L),
 *           fol/interactive_fol_utils.py (107L),
 *           CEC/nl/bridge_types.py (100L),
 *           common/input_validation.py (96L),
 *           CEC/nl/translation_types.py (89L),
 *           TDFOL/tdfol_proof_cache.py (84L)
 */

// ---------------------------------------------------------------------------
// T-316a — Interactive FOL Types (interactive_fol_types.py)
// ---------------------------------------------------------------------------

export interface StatementRecord {
  id:          string;
  formula:     string;
  role:        'axiom' | 'hypothesis' | 'conjecture' | 'lemma';
  addedAt:     number;
  provedAt?:   number;
  source?:     string;
}

export interface SessionMetadata {
  sessionId:   string;
  domain:      string;
  createdAt:   number;
  updatedAt:   number;
  statements:  StatementRecord[];
}

export function createSession(domain = 'general'): SessionMetadata {
  const now = Date.now();
  return { sessionId: `sess-${now}`, domain, createdAt: now, updatedAt: now, statements: [] };
}

export function addStatement(session: SessionMetadata, formula: string, role: StatementRecord['role'] = 'axiom'): StatementRecord {
  const record: StatementRecord = { id: `s-${session.statements.length + 1}`, formula, role, addedAt: Date.now() };
  session.statements.push(record);
  session.updatedAt = Date.now();
  return record;
}

// ---------------------------------------------------------------------------
// T-316b — Bridge Types (bridge_types.py)
// ---------------------------------------------------------------------------

export enum BridgeCapability {
  DEONTIC_TO_UCAN = 'deontic_to_ucan',
  FOL_TO_DCEC     = 'fol_to_dcec',
  NL_TO_DCEC      = 'nl_to_dcec',
  DCEC_TO_TPTP    = 'dcec_to_tptp',
}

export enum ConversionStatus {
  SUCCESS    = 'success',
  PARTIAL    = 'partial',
  FAILED     = 'failed',
  UNSUPPORTED = 'unsupported',
}

export interface BridgeMetadata {
  sourceFormat: string;
  targetFormat: string;
  version:      string;
  capabilities: BridgeCapability[];
}

export interface BridgeConversionResult {
  status:  ConversionStatus;
  output:  string;
  errors:  string[];
  warnings: string[];
}

export interface BridgeConfig {
  maxTokens:    number;
  timeoutMs:    number;
  strictMode:   boolean;
  capabilities: BridgeCapability[];
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  maxTokens:    4096,
  timeoutMs:    30_000,
  strictMode:   false,
  capabilities: [BridgeCapability.DEONTIC_TO_UCAN, BridgeCapability.DCEC_TO_TPTP],
};

export interface ProverRecommendation {
  proverName: string;
  confidence: number;
  reason:     string;
}

// ---------------------------------------------------------------------------
// T-316c — Input Validation (input_validation.py)
// ---------------------------------------------------------------------------

export const MAX_TEXT_LENGTH   = 100_000;
export const MAX_FORMULA_LENGTH = 10_000;

export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}

export function validateText(text: string, maxLength = MAX_TEXT_LENGTH): void {
  if (typeof text !== 'string') throw new ValidationError('Text must be a string');
  if (text.length > maxLength) throw new ValidationError(`Text exceeds max length of ${maxLength}`);
}

export function validateFormula(formula: string): void {
  validateText(formula, MAX_FORMULA_LENGTH);
  if (!formula.trim()) throw new ValidationError('Formula must not be empty');
  let depth = 0;
  for (const ch of formula) {
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) throw new ValidationError('Unbalanced parentheses in formula'); }
  }
  if (depth !== 0) throw new ValidationError('Unbalanced parentheses in formula');
}

export function validateFormulaList(formulas: Iterable<string>): void {
  for (const f of formulas) validateFormula(f);
}

export class InputValidator {
  validate(text: string): void { validateText(text); }
  validateFormula(formula: string): void { validateFormula(formula); }
  isValid(text: string): boolean {
    try { validateText(text); return true; } catch { return false; }
  }
}

// ---------------------------------------------------------------------------
// T-316d — Translation Types (translation_types.py)
// ---------------------------------------------------------------------------

export enum LogicTranslationTarget {
  DCEC  = 'dcec',
  TPTP  = 'tptp',
  FOL   = 'fol',
  CEC   = 'cec',
  UCAN  = 'ucan',
  JSON  = 'json',
}

export interface TranslationResult {
  source:   string;
  target:   LogicTranslationTarget;
  output:   string;
  success:  boolean;
  errors:   string[];
}

export abstract class AbstractLogicFormula {
  constructor(protected readonly raw: string) {}
  abstract toTPTP(): string;
  abstract toDCEC(): string;
  getRaw(): string { return this.raw; }
}

// ---------------------------------------------------------------------------
// T-316e — TDFOL Proof Cache (tdfol_proof_cache.py)
// ---------------------------------------------------------------------------

export interface TDFOLProofResult {
  formula:    string;
  isProved:   boolean;
  proof?:     string;
  derivation?: string[];
  cachedAt:   number;
  ttl:        number;  // ms
}

class TDFOLProofCache {
  private readonly cache = new Map<string, TDFOLProofResult>();

  set(formula: string, result: Omit<TDFOLProofResult, 'formula' | 'cachedAt'>): TDFOLProofResult {
    const entry: TDFOLProofResult = { ...result, formula, cachedAt: Date.now() };
    this.cache.set(formula, entry);
    return entry;
  }

  get(formula: string): TDFOLProofResult | null {
    const entry = this.cache.get(formula);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > entry.ttl) { this.cache.delete(formula); return null; }
    return entry;
  }

  clear(): void { this.cache.clear(); }
  size(): number { return this.cache.size; }
}

let _globalCache: TDFOLProofCache | null = null;

export function getGlobalProofCache(): TDFOLProofCache {
  if (!_globalCache) _globalCache = new TDFOLProofCache();
  return _globalCache;
}

export function clearGlobalProofCache(): void {
  if (_globalCache) _globalCache.clear();
}
