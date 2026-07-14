/**
 * Audited browser theorem-prover entrypoint.
 *
 * The default backend is a complete (bounded) propositional truth-table
 * prover implemented in TypeScript. Other identifiers describe integrations
 * that exist on the host or still lack an audited browser-WASM build;
 * selecting one returns a typed preflight failure and never generates a proof
 * script or imports a native/simulated runner.
 */

import { sha256Hex } from './browser-crypto.js';

export * from './browser-crypto.js';
export * from './crypto-exchange-proof-artifacts.js';

export const BROWSER_THEOREM_PROOF_SCHEMA = 'swissknife.browser-theorem-proof/v1' as const;
export const DEFAULT_BROWSER_PROVER_BACKEND = 'typescript-truth-table' as const;
export const DEFAULT_BROWSER_PROOF_MAX_VARIABLES = 12;

export type BrowserProverBackendId =
  | 'typescript-truth-table'
  | 'z3-wasm'
  | 'cvc5-wasm'
  | 'coq-jscoq'
  | 'lean4-wasm'
  | 'lurk-wasm'
  | 'dcec-native'
  | 'tdfol-native'
  | 'neural';

export interface BrowserProverReady {
  readonly kind: 'ready';
  readonly backend: 'typescript-truth-table';
  readonly execution: 'typescript';
  readonly canGenerate: true;
  readonly canVerify: true;
}

export interface BrowserProverUnavailable {
  readonly kind: 'unavailable';
  readonly code: 'BROWSER_PROVER_BACKEND_UNAVAILABLE';
  /** Echoes the rejected identifier, including unknown JavaScript inputs. */
  readonly backend: string;
  readonly phase: 'preflight';
  readonly reason: string;
  readonly retryable: boolean;
}

export type BrowserProverAvailability = BrowserProverReady | BrowserProverUnavailable;

export interface BrowserTruthTableRow {
  /** Bit i corresponds to variables[i], using 0=false and 1=true. */
  readonly assignment: string;
  readonly value: boolean;
}

interface BrowserProofArtifactBase {
  readonly schemaVersion: typeof BROWSER_THEOREM_PROOF_SCHEMA;
  readonly formula: string;
  readonly canonicalFormula: string;
  readonly variables: readonly string[];
  readonly artifactDigest: string;
}

export interface BrowserTruthTableProofArtifact extends BrowserProofArtifactBase {
  readonly backend: 'typescript-truth-table';
  readonly execution: 'typescript';
  readonly evaluations: readonly BrowserTruthTableRow[];
}

export type BrowserTheoremProofArtifact = BrowserTruthTableProofArtifact;

export interface BrowserProofRequest {
  readonly formula: string;
  readonly backend?: BrowserProverBackendId;
  /** Truth-table proofs grow as 2^n. Values above 16 are rejected. */
  readonly maxVariables?: number;
  readonly signal?: AbortSignal;
}

export interface BrowserProofProved {
  readonly kind: 'proved';
  readonly backend: 'typescript-truth-table';
  readonly artifact: BrowserTheoremProofArtifact;
  readonly elapsedMs: number;
}

export interface BrowserProofRefuted {
  readonly kind: 'refuted';
  readonly backend: 'typescript-truth-table';
  readonly counterexample: Readonly<Record<string, boolean>>;
  readonly elapsedMs: number;
}

export interface BrowserProofInvalidInput {
  readonly kind: 'invalid_input';
  readonly code: 'BROWSER_PROOF_INVALID_INPUT';
  readonly message: string;
}

export interface BrowserProofExecutionError {
  readonly kind: 'execution_error';
  readonly code:
    | 'BROWSER_PROOF_ABORTED'
    | 'BROWSER_PROOF_BACKEND_FAILED'
    | 'BROWSER_PROOF_WORKER_FAILED'
    | 'BROWSER_PROOF_WORKER_TIMEOUT'
    | 'BROWSER_PROOF_WORKER_PROTOCOL_ERROR';
  readonly backend: BrowserProverBackendId;
  readonly message: string;
}

export type BrowserProofGenerationResult =
  | BrowserProofProved
  | BrowserProofRefuted
  | BrowserProofInvalidInput
  | BrowserProverUnavailable
  | BrowserProofExecutionError;

export interface BrowserProofVerificationValid {
  readonly kind: 'valid';
  readonly valid: true;
  readonly backend: 'typescript-truth-table';
  readonly artifactDigest: string;
}

export interface BrowserProofVerificationInvalid {
  readonly kind: 'invalid';
  readonly valid: false;
  readonly code: 'BROWSER_PROOF_INVALID';
  readonly message: string;
}

export interface BrowserProofVerificationMalformed {
  readonly kind: 'malformed';
  readonly valid: false;
  readonly code: 'BROWSER_PROOF_MALFORMED';
  readonly message: string;
}

export type BrowserProofVerificationResult =
  | BrowserProofVerificationValid
  | BrowserProofVerificationInvalid
  | BrowserProofVerificationMalformed
  | BrowserProverUnavailable
  | BrowserProofExecutionError;

const UNAVAILABLE_REASONS: Readonly<Record<Exclude<BrowserProverBackendId, 'typescript-truth-table'>, string>> = {
  'z3-wasm': 'The installed Z3 package is not an audited browser-WASM build; it is excluded until browser initialization and worker failure behavior are verified.',
  'cvc5-wasm': 'No audited CVC5 WebAssembly module is bundled; the legacy injected-module and Z3-shim bridge is not a browser default.',
  'coq-jscoq': 'No jsCoq WebAssembly verifier is bundled; host coqc runners and static success paths are excluded.',
  'lean4-wasm': 'No Lean WebAssembly verifier is bundled; host Lean runners and static success paths are excluded.',
  'lurk-wasm': 'No audited Lurk WebAssembly verifier is bundled.',
  'dcec-native': 'The DCEC native bridge is not a browser backend.',
  'tdfol-native': 'The TDFOL native bridge is not a browser backend.',
  neural: 'Neural proof sketches are not proof verification and are excluded from the browser default path.',
};

const BROWSER_PROVER_BACKEND_IDS: readonly BrowserProverBackendId[] = [
  'typescript-truth-table', 'z3-wasm', 'cvc5-wasm', 'coq-jscoq', 'lean4-wasm',
  'lurk-wasm', 'dcec-native', 'tdfol-native', 'neural',
];

/** Probe a backend before proof generation. A failed probe never generates output. */
export async function probeBrowserProverBackend(backend: BrowserProverBackendId | string): Promise<BrowserProverAvailability> {
  if (!isBrowserProverBackendId(backend)) {
    return unavailable(
      String(backend),
      `Unknown browser prover backend '${String(backend)}'; simulated, Python, host-native, and mock backends cannot be selected.`,
      false,
    );
  }
  if (backend === 'typescript-truth-table') {
    return { kind: 'ready', backend, execution: 'typescript', canGenerate: true, canVerify: true };
  }
  return unavailable(backend, UNAVAILABLE_REASONS[backend], false);
}

/** Generate a genuine validity artifact, never a script, heuristic, or mock success. */
export async function generateBrowserTheoremProof(request: BrowserProofRequest): Promise<BrowserProofGenerationResult> {
  const backend = request.backend ?? DEFAULT_BROWSER_PROVER_BACKEND;
  if (request.signal?.aborted) return aborted(backend);
  const availability = await probeBrowserProverBackend(backend);
  if (availability.kind === 'unavailable') return availability;
  if (request.signal?.aborted) return aborted(backend);

  let parsed: ParsedFormula;
  try {
    parsed = parseFormula(request.formula);
  } catch (error) {
    return invalidInput(error);
  }

  const maxVariables = request.maxVariables ?? DEFAULT_BROWSER_PROOF_MAX_VARIABLES;
  if (!Number.isInteger(maxVariables) || maxVariables < 0 || maxVariables > 16) {
    return invalidInput('maxVariables must be an integer between 0 and 16');
  }
  if (parsed.variables.length > maxVariables) {
    return invalidInput(`formula has ${parsed.variables.length} variables; configured maximum is ${maxVariables}`);
  }

  return generateTruthTableProof(request.formula, parsed, request.signal);
}

/** Recompute the proof independently; the artifact's claimed verdict is never trusted. */
export async function verifyBrowserTheoremProof(artifact: unknown): Promise<BrowserProofVerificationResult> {
  const shape = validateArtifactShape(artifact);
  if (typeof shape === 'string') return malformed(shape);
  let parsed: ParsedFormula;
  try {
    parsed = parseFormula(shape.formula);
  } catch (error) {
    return malformed(errorMessage(error));
  }
  if (parsed.variables.length > 16) return malformed('artifact formula exceeds the 16-variable verification limit');
  if (shape.canonicalFormula !== parsed.canonical || !sameStrings(shape.variables, parsed.variables)) {
    return invalid('canonical formula or variable list does not match the claimed formula');
  }

  const expected = truthTableRows(parsed);
  if (!sameRows(shape.evaluations, expected)) return invalid('truth-table evaluations are incomplete or incorrect');
  if (expected.some(row => !row.value)) return invalid('artifact does not prove a tautology');
  const digest = truthTableDigest(shape.formula, parsed, expected);
  if (shape.artifactDigest !== digest) return invalid('artifact digest mismatch');
  return { kind: 'valid', valid: true, backend: shape.backend, artifactDigest: digest };
}

async function generateTruthTableProof(
  formula: string,
  parsed: ParsedFormula,
  signal?: AbortSignal,
): Promise<BrowserProofGenerationResult> {
  const started = now();
  const rows = truthTableRows(parsed, signal);
  if (signal?.aborted) return aborted('typescript-truth-table');
  const failedIndex = rows.findIndex(row => !row.value);
  if (failedIndex >= 0) {
    return {
      kind: 'refuted', backend: 'typescript-truth-table',
      counterexample: assignmentRecord(parsed.variables, rows[failedIndex]!.assignment), elapsedMs: now() - started,
    };
  }
  const artifact: BrowserTruthTableProofArtifact = {
    schemaVersion: BROWSER_THEOREM_PROOF_SCHEMA,
    backend: 'typescript-truth-table', execution: 'typescript', formula,
    canonicalFormula: parsed.canonical, variables: parsed.variables, evaluations: rows,
    artifactDigest: truthTableDigest(formula, parsed, rows),
  };
  return { kind: 'proved', backend: artifact.backend, artifact, elapsedMs: now() - started };
}

type FormulaAst =
  | { readonly type: 'atom'; readonly name: string }
  | { readonly type: 'constant'; readonly value: boolean }
  | { readonly type: 'not'; readonly child: FormulaAst }
  | { readonly type: 'and' | 'or' | 'implies' | 'iff'; readonly left: FormulaAst; readonly right: FormulaAst };

interface ParsedFormula { readonly ast: FormulaAst; readonly canonical: string; readonly variables: readonly string[] }
type TokenKind = 'atom' | 'true' | 'false' | 'not' | 'and' | 'or' | 'implies' | 'iff' | 'lparen' | 'rparen' | 'eof';
interface Token { readonly kind: TokenKind; readonly text: string; readonly offset: number }

function parseFormula(source: string): ParsedFormula {
  if (typeof source !== 'string' || source.trim() === '') throw new Error('formula must be a non-empty string');
  if (source.length > 16_384) throw new Error('formula exceeds 16384 characters');
  const tokens = tokenize(source);
  let cursor = 0;
  const peek = () => tokens[cursor]!;
  const take = () => tokens[cursor++]!;
  const binary = (next: () => FormulaAst, kinds: readonly TokenKind[]): FormulaAst => {
    let node = next();
    while (kinds.includes(peek().kind)) {
      const operator = take().kind as 'and' | 'or' | 'implies' | 'iff';
      node = { type: operator, left: node, right: next() };
    }
    return node;
  };
  const primary = (): FormulaAst => {
    const token = take();
    if (token.kind === 'atom') return { type: 'atom', name: token.text };
    if (token.kind === 'true' || token.kind === 'false') return { type: 'constant', value: token.kind === 'true' };
    if (token.kind === 'not') return { type: 'not', child: primary() };
    if (token.kind === 'lparen') {
      const node = iff();
      if (take().kind !== 'rparen') throw new Error(`expected ')' at offset ${peek().offset}`);
      return node;
    }
    throw new Error(`expected atom, negation, or '(' at offset ${token.offset}`);
  };
  const conjunction = () => binary(primary, ['and']);
  const disjunction = () => binary(conjunction, ['or']);
  const implication = (): FormulaAst => {
    const left = disjunction();
    if (peek().kind !== 'implies') return left;
    take();
    return { type: 'implies', left, right: implication() };
  };
  const iff = () => binary(implication, ['iff']);
  const ast = iff();
  if (peek().kind !== 'eof') throw new Error(`unexpected token '${peek().text}' at offset ${peek().offset}`);
  const variables = [...collectVariables(ast)].sort();
  return { ast, variables, canonical: canonical(ast) };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const symbols: readonly [string, TokenKind][] = [
    ['<=>', 'iff'], ['<->', 'iff'], ['↔', 'iff'], ['=>', 'implies'], ['->', 'implies'], ['→', 'implies'],
    ['&&', 'and'], ['∧', 'and'], ['&', 'and'], ['||', 'or'], ['∨', 'or'], ['|', 'or'],
    ['!', 'not'], ['~', 'not'], ['¬', 'not'], ['(', 'lparen'], [')', 'rparen'],
  ];
  while (i < source.length) {
    if (/\s/u.test(source[i]!)) { i++; continue; }
    const found = symbols.find(([symbol]) => source.startsWith(symbol, i));
    if (found) { tokens.push({ kind: found[1], text: found[0], offset: i }); i += found[0].length; continue; }
    const match = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(source.slice(i));
    if (!match) throw new Error(`invalid character '${source[i]}' at offset ${i}`);
    const lower = match[0].toLowerCase();
    tokens.push({ kind: lower === 'true' ? 'true' : lower === 'false' ? 'false' : 'atom', text: match[0], offset: i });
    i += match[0].length;
  }
  tokens.push({ kind: 'eof', text: '', offset: source.length });
  return tokens;
}

function collectVariables(ast: FormulaAst, found = new Set<string>()): Set<string> {
  if (ast.type === 'atom') found.add(ast.name);
  else if (ast.type === 'not') collectVariables(ast.child, found);
  else if (ast.type !== 'constant') { collectVariables(ast.left, found); collectVariables(ast.right, found); }
  return found;
}

function canonical(ast: FormulaAst): string {
  if (ast.type === 'atom') return ast.name;
  if (ast.type === 'constant') return ast.value ? 'true' : 'false';
  if (ast.type === 'not') return `(!${canonical(ast.child)})`;
  const op = { and: '&&', or: '||', implies: '->', iff: '<->' }[ast.type];
  return `(${canonical(ast.left)}${op}${canonical(ast.right)})`;
}

function evaluate(ast: FormulaAst, values: Readonly<Record<string, boolean>>): boolean {
  if (ast.type === 'atom') return values[ast.name] === true;
  if (ast.type === 'constant') return ast.value;
  if (ast.type === 'not') return !evaluate(ast.child, values);
  const left = evaluate(ast.left, values);
  const right = evaluate(ast.right, values);
  if (ast.type === 'and') return left && right;
  if (ast.type === 'or') return left || right;
  if (ast.type === 'implies') return !left || right;
  return left === right;
}

function truthTableRows(parsed: ParsedFormula, signal?: AbortSignal): BrowserTruthTableRow[] {
  const count = 2 ** parsed.variables.length;
  const rows: BrowserTruthTableRow[] = [];
  for (let row = 0; row < count; row++) {
    if (signal?.aborted) break;
    const assignment = parsed.variables.map((_, index) => (row & (1 << (parsed.variables.length - index - 1))) ? '1' : '0').join('');
    rows.push({ assignment, value: evaluate(parsed.ast, assignmentRecord(parsed.variables, assignment)) });
  }
  return rows;
}

function assignmentRecord(variables: readonly string[], assignment: string): Record<string, boolean> {
  return Object.fromEntries(variables.map((variable, index) => [variable, assignment[index] === '1']));
}

function truthTableDigest(formula: string, parsed: ParsedFormula, rows: readonly BrowserTruthTableRow[]): string {
  return sha256Hex(JSON.stringify([BROWSER_THEOREM_PROOF_SCHEMA, 'typescript-truth-table', formula, parsed.canonical, parsed.variables, rows]));
}

function validateArtifactShape(value: unknown): BrowserTheoremProofArtifact | string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'artifact must be an object';
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== BROWSER_THEOREM_PROOF_SCHEMA) return 'unsupported or missing schemaVersion';
  if (v.backend !== 'typescript-truth-table') return 'unsupported or missing backend';
  if (typeof v.formula !== 'string' || typeof v.canonicalFormula !== 'string' || typeof v.artifactDigest !== 'string') return 'artifact string fields are missing';
  if (!Array.isArray(v.variables) || !v.variables.every(item => typeof item === 'string')) return 'variables must be a string array';
  if (v.execution !== 'typescript' || !Array.isArray(v.evaluations) || !v.evaluations.every(validRow)) return 'truth-table evaluations are malformed';
  return value as BrowserTheoremProofArtifact;
}

function validRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return typeof r.assignment === 'string' && /^[01]*$/.test(r.assignment) && typeof r.value === 'boolean';
}

function sameRows(left: readonly BrowserTruthTableRow[], right: readonly BrowserTruthTableRow[]): boolean {
  return left.length === right.length && left.every((row, i) => row.assignment === right[i]!.assignment && row.value === right[i]!.value);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function unavailable(backend: string, reason: string, retryable: boolean): BrowserProverUnavailable {
  return { kind: 'unavailable', code: 'BROWSER_PROVER_BACKEND_UNAVAILABLE', backend, phase: 'preflight', reason, retryable };
}

function isBrowserProverBackendId(backend: string): backend is BrowserProverBackendId {
  return (BROWSER_PROVER_BACKEND_IDS as readonly string[]).includes(backend);
}

function invalidInput(error: unknown): BrowserProofInvalidInput {
  return { kind: 'invalid_input', code: 'BROWSER_PROOF_INVALID_INPUT', message: errorMessage(error) };
}

function invalid(message: string): BrowserProofVerificationInvalid {
  return { kind: 'invalid', valid: false, code: 'BROWSER_PROOF_INVALID', message };
}

function malformed(message: string): BrowserProofVerificationMalformed {
  return { kind: 'malformed', valid: false, code: 'BROWSER_PROOF_MALFORMED', message };
}

function aborted(backend: BrowserProverBackendId): BrowserProofExecutionError {
  return { kind: 'execution_error', code: 'BROWSER_PROOF_ABORTED', backend, message: 'proof request was aborted' };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
