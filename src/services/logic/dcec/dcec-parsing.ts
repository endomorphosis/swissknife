/**
 * DCEC Parsing Utilities — T-245 (Sprint 54)
 *
 * Port of ipfs_datasets_py/logic/CEC/native/dcec_parsing.py
 *
 * Provides a `ParseToken` tree structure and string-manipulation helpers
 * for parsing DCEC S-expression / F-expression formulas.
 */

// ---------------------------------------------------------------------------
// ParseToken
// ---------------------------------------------------------------------------

/**
 * A node in a parsed DCEC formula tree.
 *
 * TypeScript port of `ParseToken` from
 * `ipfs_datasets_py/logic/CEC/native/dcec_parsing.py`.
 */
export class ParseToken {
  funcName: string;
  args: Array<string | ParseToken>;

  private _depth?: number;
  private _width?: number;
  private _sExpr?: string;
  private _fExpr?: string;

  constructor(funcName: string, args: Array<string | ParseToken> = []) {
    this.funcName = funcName;
    this.args = args;
  }

  /** Maximum depth from this node to any leaf. */
  depthOf(): number {
    if (this._depth !== undefined) return this._depth;
    const childTokens = this.args.filter((a): a is ParseToken => a instanceof ParseToken);
    this._depth = childTokens.length === 0 ? 1 : 1 + Math.max(...childTokens.map(c => c.depthOf()));
    return this._depth;
  }

  /** Total number of leaf nodes (string args). */
  widthOf(): number {
    if (this._width !== undefined) return this._width;
    let count = 0;
    for (const arg of this.args) {
      count += arg instanceof ParseToken ? arg.widthOf() : 1;
    }
    this._width = count;
    return this._width;
  }

  /** S-expression: `(funcName arg1 arg2 …)`. */
  createSExpression(): string {
    if (this._sExpr !== undefined) return this._sExpr;
    const argStrs = this.args.map(a => a instanceof ParseToken ? a.createSExpression() : a);
    this._sExpr = `(${this.funcName} ${argStrs.join(' ')})`;
    return this._sExpr;
  }

  /** F-expression: `funcName(arg1, arg2, …)`. */
  createFExpression(): string {
    if (this._fExpr !== undefined) return this._fExpr;
    const argStrs = this.args.map(a => a instanceof ParseToken ? a.createFExpression() : a);
    this._fExpr = `${this.funcName}(${argStrs.join(', ')})`;
    return this._fExpr;
  }

  /** Invalidate cached expressions (called after mutation). */
  invalidateCache(): void {
    this._depth = undefined;
    this._width = undefined;
    this._sExpr = undefined;
    this._fExpr = undefined;
  }

  toString(): string { return this.createFExpression(); }
}

// ---------------------------------------------------------------------------
// removeComments
// ---------------------------------------------------------------------------

/**
 * Remove DCEC comments (semicolon-to-EOL and C-style block comments)
 * from an expression.
 *
 * Port of `remove_comments()` from `dcec_parsing.py`.
 */
export function removeComments(expression: string): string {
  // Remove /* ... */ style comments
  let result = expression.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove ; to end-of-line comments
  result = result.replace(/;[^\n]*/g, ' ');
  return result.trim();
}

// ---------------------------------------------------------------------------
// functorizeSymbols
// ---------------------------------------------------------------------------

/**
 * Convert bare symbols to functor notation: `sym` → `sym()`.
 *
 * Port of `functorize_symbols()` from `dcec_parsing.py`.
 */
export function functorizeSymbols(expression: string): string {
  // Replace word-token that is NOT followed by `(` with `token()`
  return expression.replace(/\b([A-Za-z_]\w*)(?!\s*\()/g, '$1()');
}

// ---------------------------------------------------------------------------
// replaceSynonyms
// ---------------------------------------------------------------------------

const SYNONYM_MAP: Record<string, string> = {
  'and':        '∧',
  'or':         '∨',
  'not':        '¬',
  'implies':    '→',
  'iff':        '↔',
  'forall':     '∀',
  'exists':     '∃',
  'always':     '□',
  'eventually': '◊',
  'obligated':  'O',
  'permitted':  'P',
  'forbidden':  'F',
  'believes':   'B',
  'knows':      'K',
  'intends':    'I',
  'perceives':  'Perceives',
};

/**
 * Replace English synonym keywords with their logical operator symbols.
 *
 * Port of `replace_synonyms()` from `dcec_parsing.py`.
 */
export function replaceSynonyms(args: Array<string | ParseToken>): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg === 'string') {
      const replacement = SYNONYM_MAP[arg.toLowerCase()];
      if (replacement) args[i] = replacement;
    } else {
      // Recurse
      replaceSynonyms(arg.args);
    }
  }
}

// ---------------------------------------------------------------------------
// prefixLogicalFunctions
// ---------------------------------------------------------------------------

/**
 * Convert infix expressions to prefix (S-expression) form.
 *
 * E.g. `P and Q` → `(∧ P Q)`.
 *
 * Port of `prefix_logical_functions()` from `dcec_parsing.py`.
 */
export function prefixLogicalFunctions(expression: string): string {
  // Simple heuristic: replace `A and B` → `(and A B)` etc.
  return expression
    .replace(/\(([^()]+)\s+and\s+([^()]+)\)/gi, '(∧ $1 $2)')
    .replace(/\(([^()]+)\s+or\s+([^()]+)\)/gi,  '(∨ $1 $2)')
    .replace(/not\s+\(([^()]+)\)/gi, '(¬ $1)')
    .replace(/\(([^()]+)\s+implies\s+([^()]+)\)/gi, '(→ $1 $2)');
}

// ---------------------------------------------------------------------------
// prefixEmdas
// ---------------------------------------------------------------------------

/**
 * Convert EMDAS (Exponents, Multiplication, Division, Addition, Subtraction)
 * arithmetic expressions to prefix form.
 *
 * Port of `prefix_emdas()` from `dcec_parsing.py`.
 */
export function prefixEmdas(expression: string): string {
  // Minimal arithmetic prefix conversion
  return expression
    .replace(/\(([^()]+)\s*\*\s*([^()]+)\)/g, '(* $1 $2)')
    .replace(/\(([^()]+)\s*\/\s*([^()]+)\)/g, '(/ $1 $2)')
    .replace(/\(([^()]+)\s*\+\s*([^()]+)\)/g, '(+ $1 $2)')
    .replace(/\(([^()]+)\s*-\s*([^()]+)\)/g,  '(- $1 $2)');
}

// ---------------------------------------------------------------------------
// parseDcecExpression (top-level convenience)
// ---------------------------------------------------------------------------

/**
 * Parse a DCEC expression string into a `ParseToken` tree.
 *
 * Performs the full pipeline:
 *   removeComments → replace synonyms → prefix logical functions → tokenize.
 */
export function parseDcecExpression(expression: string): ParseToken | string {
  let cleaned = removeComments(expression);
  cleaned = prefixLogicalFunctions(cleaned).trim();

  // Tokenize: simple recursive S-expression parser
  return _parseToken(cleaned.trim());
}

function _parseToken(s: string): ParseToken | string {
  s = s.trim();
  if (!s.startsWith('(')) return s;

  // Strip outer parens
  const inner = s.slice(1, -1).trim();
  // Split on first whitespace for func name
  const spaceIdx = inner.search(/\s/);
  if (spaceIdx < 0) return new ParseToken(inner, []);

  const funcName = inner.slice(0, spaceIdx).trim();
  const rest = inner.slice(spaceIdx).trim();
  const args = _tokenizeArgs(rest);
  return new ParseToken(funcName, args);
}

function _tokenizeArgs(s: string): Array<string | ParseToken> {
  const args: Array<string | ParseToken> = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;

    if (s[i] === '(') {
      // Find matching close paren
      let depth = 0;
      const start = i;
      while (i < s.length) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') { depth--; if (depth === 0) { i++; break; } }
        i++;
      }
      args.push(_parseToken(s.slice(start, i)));
    } else {
      // Read until whitespace or paren
      const start = i;
      while (i < s.length && !/[\s()]/.test(s[i])) i++;
      const token = s.slice(start, i).trim();
      if (token) args.push(token);
    }
  }
  return args;
}
