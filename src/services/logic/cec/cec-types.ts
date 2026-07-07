/**
 * CEC Type Definitions — T-235
 *
 * Port of ipfs_datasets_py/logic/CEC/native/types.py
 *
 * TypeScript interfaces (equivalent to Python TypedDicts and Protocols)
 * used across the CEC implementation for type safety.
 */

// ---------------------------------------------------------------------------
// Basic type aliases
// ---------------------------------------------------------------------------

/** A formula represented as a string, e.g. "O(p)", "B(agent, φ)". */
export type FormulaString = string;

/** Name of a symbol (variable, function, predicate, …). */
export type SymbolName = string;

/** Name of a sort/type. */
export type SortName = string;

/** Generic namespace dictionary. */
export type NamespaceDict = Record<string, unknown>;

/** Symbol table mapping names to definitions. */
export type SymbolTable = Record<SymbolName, unknown>;

/** Unique identifier for a proof step. */
export type ProofStepId = number;

/** Name of an inference rule. */
export type RuleName = string;

/** Configuration value. */
export type ConfigValue = string | number | boolean | unknown[] | Record<string, unknown>;

/** Configuration dictionary. */
export type ConfigDict = Record<string, ConfigValue>;

// ---------------------------------------------------------------------------
// TypedDict equivalents (TS interfaces)
// ---------------------------------------------------------------------------

/** Dictionary representation of a formula. */
export interface FormulaDict {
  type: string;
  operator?: string;
  arguments?: unknown[];
  variables?: string[];
  boundVariables?: string[];
  body?: unknown;
  metadata?: Record<string, unknown>;
}

/** Dictionary representation of a proof result. */
export interface ProofResultDict {
  isValid: boolean;
  proofTree?: unknown;
  steps?: Array<Record<string, unknown>>;
  timeTaken?: number;
  rulesUsed?: string[];
  cached?: boolean;
  error?: string;
}

/** Dictionary representation of an NL → formula conversion result. */
export interface ConversionResultDict {
  formula: unknown;
  confidence: number;
  patternsMatched: string[];
  text: string;
  language: string;
  metadata?: Record<string, unknown>;
}

/** Dictionary representation of a namespace export. */
export interface NamespaceExport {
  sorts: Record<string, unknown>;
  variables: Record<string, unknown>;
  functions: Record<string, unknown>;
  predicates: Record<string, unknown>;
  constants?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Configuration for a grammar engine. */
export interface GrammarConfig {
  language: string;
  lexiconFile?: string;
  rulesFile?: string;
  enableCaching?: boolean;
  maxCacheSize?: number;
  strictMode?: boolean;
}

/** Configuration for a theorem prover. */
export interface ProverConfig {
  name: string;
  timeoutMs?: number;
  maxMemoryMb?: number;
  enableCache?: boolean;
  cacheMaxSize?: number;
  logLevel?: 'debug' | 'info' | 'warning' | 'error';
  extraArgs?: string[];
}

// ---------------------------------------------------------------------------
// Protocol equivalents (structural interfaces)
// ---------------------------------------------------------------------------

/**
 * Protocol for DCEC formulas.
 *
 * Any object implementing this interface can serve as a formula in CEC provers.
 */
export interface FormulaProtocol {
  /** String representation of the formula. */
  toString(): string;
  /** Whether the formula is ground (no free variables). */
  isGround(): boolean;
  /** Free variables appearing in the formula. */
  freeVariables(): Set<string>;
  /** Deep equality check. */
  equals(other: FormulaProtocol): boolean;
  /** Apply a substitution `{variable → term}`. */
  substitute(substitution: Record<string, TermProtocol>): FormulaProtocol;
}

/**
 * Protocol for DCEC terms (variables, constants, function applications).
 */
export interface TermProtocol {
  toString(): string;
  isVariable(): boolean;
  isConstant(): boolean;
  equals(other: TermProtocol): boolean;
}

// ---------------------------------------------------------------------------
// Utility: narrow a dict to FormulaDict
// ---------------------------------------------------------------------------

export function isFormulaDict(obj: unknown): obj is FormulaDict {
  return typeof obj === 'object' && obj !== null && 'type' in obj && typeof (obj as Record<string, unknown>)['type'] === 'string';
}

export function isProofResultDict(obj: unknown): obj is ProofResultDict {
  return typeof obj === 'object' && obj !== null && 'isValid' in obj && typeof (obj as Record<string, unknown>)['isValid'] === 'boolean';
}
