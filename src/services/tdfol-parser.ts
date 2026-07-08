/**
 * tdfol-parser.ts
 *
 * TDFOL formula text → AST parser.
 * TypeScript port of ipfs_datasets_py/logic/TDFOL/tdfol_parser.py
 *
 * Provides:
 *   parseTdfol(text)     → Formula  (throws on syntax error)
 *   parseTdfolSafe(text) → Formula | null  (returns null on error)
 */

import {
  Formula,
  Term,
  LogicOperator,
  QuantifierKind,
  TDFOLDeonticOp,
  TDFOLTemporalOp,
  SortKind,
  mkVariable,
  mkConstant,
  mkFuncApp,
  mkPredicate,
  mkBinary,
  mkUnary,
  mkQuantified,
  mkDeontic,
  mkTemporal,
} from './tdfol-core.js';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

const enum TT {
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  IMPLIES = 'IMPLIES',
  IFF = 'IFF',
  XOR = 'XOR',
  FORALL = 'FORALL',
  EXISTS = 'EXISTS',
  OBLIGATION = 'OBLIGATION',
  PERMISSION = 'PERMISSION',
  PROHIBITION = 'PROHIBITION',
  ALWAYS = 'ALWAYS',
  EVENTUALLY = 'EVENTUALLY',
  NEXT = 'NEXT',
  UNTIL = 'UNTIL',
  SINCE = 'SINCE',
  WEAK_UNTIL = 'WEAK_UNTIL',
  RELEASE = 'RELEASE',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  COMMA = 'COMMA',
  DOT = 'DOT',
  COLON = 'COLON',
  IDENTIFIER = 'IDENTIFIER',
  NUMBER = 'NUMBER',
  EOF = 'EOF',
}

type TokenType = TT;

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

const MULTI_CHAR_SYMBOLS: Record<string, TokenType> = {
  '<->': TT.IFF,
  '<=>': TT.IFF,
  '->': TT.IMPLIES,
  '=>': TT.IMPLIES,
  '[]': TT.ALWAYS,
  '<>': TT.EVENTUALLY,
};

const SINGLE_CHAR_SYMBOLS: Record<string, TokenType> = {
  '∧': TT.AND,
  '&': TT.AND,
  '^': TT.AND,
  '∨': TT.OR,
  '|': TT.OR,
  '¬': TT.NOT,
  '~': TT.NOT,
  '!': TT.NOT,
  '→': TT.IMPLIES,
  '↔': TT.IFF,
  '⊕': TT.XOR,
  '∀': TT.FORALL,
  '∃': TT.EXISTS,
  '□': TT.ALWAYS,
  '◊': TT.EVENTUALLY,
  '(': TT.LPAREN,
  ')': TT.RPAREN,
  ',': TT.COMMA,
  '.': TT.DOT,
  ':': TT.COLON,
};

const KEYWORD_MAP: Record<string, TokenType> = {
  and: TT.AND,
  or: TT.OR,
  not: TT.NOT,
  implies: TT.IMPLIES,
  iff: TT.IFF,
  xor: TT.XOR,
  forall: TT.FORALL,
  exists: TT.EXISTS,
  always: TT.ALWAYS,
  eventually: TT.EVENTUALLY,
  next: TT.NEXT,
  until: TT.UNTIL,
  since: TT.SINCE,
  weak_until: TT.WEAK_UNTIL,
  weakuntil: TT.WEAK_UNTIL,
  release: TT.RELEASE,
};

// Single-letter reserved operators (only when followed by '(')
const SINGLE_LETTER_OPS: Record<string, TokenType> = {
  O: TT.OBLIGATION,
  P: TT.PERMISSION,
  F: TT.PROHIBITION,
  G: TT.ALWAYS,
  X: TT.NEXT,
  U: TT.UNTIL,
  S: TT.SINCE,
  W: TT.WEAK_UNTIL,
  R: TT.RELEASE,
};

const KNOWN_SORTS = new Set<string>(['AGENT', 'ACTION', 'EVENT', 'TIME', 'PROPOSITION', 'OBJECT', 'STATE', 'CONDITION']);

class TDFOLLexer {
  private pos = 0;
  constructor(private text: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.text.length) {
      this.skipWs();
      if (this.pos >= this.text.length) break;

      // Try 3-char then 2-char multi-char symbols
      let matched = false;
      for (const len of [3, 2]) {
        const sub = this.text.slice(this.pos, this.pos + len);
        if (sub in MULTI_CHAR_SYMBOLS) {
          tokens.push({ type: MULTI_CHAR_SYMBOLS[sub], value: sub, pos: this.pos });
          this.pos += len;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      const ch = this.text[this.pos];

      // Single-letter ops: treat as operator only when next char is '(' (or end/whitespace)
      if (ch in SINGLE_LETTER_OPS) {
        const next = this.pos + 1 < this.text.length ? this.text[this.pos + 1] : '';
        if (next === '' || next === ' ' || next === '\t' || next === '\n' || next === '(') {
          // emit as operator token only when not part of a longer identifier
          tokens.push({ type: SINGLE_LETTER_OPS[ch], value: ch, pos: this.pos });
          this.pos++;
          continue;
        }
        // Otherwise: read full identifier
        const id = this.readIdent();
        const kw = KEYWORD_MAP[id.toLowerCase()];
        tokens.push({ type: kw ?? TT.IDENTIFIER, value: id, pos: this.pos - id.length });
        continue;
      }

      // Unicode / ASCII single-char symbols
      if (ch in SINGLE_CHAR_SYMBOLS) {
        tokens.push({ type: SINGLE_CHAR_SYMBOLS[ch], value: ch, pos: this.pos });
        this.pos++;
        continue;
      }

      // Identifier / keyword
      if (/[a-zA-Z_]/.test(ch)) {
        const id = this.readIdent();
        const kw = KEYWORD_MAP[id.toLowerCase()];
        tokens.push({ type: kw ?? TT.IDENTIFIER, value: id, pos: this.pos - id.length });
        continue;
      }

      // Number (or ISO date literal)
      if (/\d/.test(ch)) {
        // Check for ISO date YYYY-MM-DD
        const isoMatch = /^\d{4}-\d{2}-\d{2}/.exec(this.text.slice(this.pos));
        if (isoMatch) {
          tokens.push({ type: TT.IDENTIFIER, value: isoMatch[0], pos: this.pos });
          this.pos += isoMatch[0].length;
        } else {
          const num = this.readNum();
          tokens.push({ type: TT.NUMBER, value: num, pos: this.pos - num.length });
        }
        continue;
      }

      // Unknown character — skip
      this.pos++;
    }
    tokens.push({ type: TT.EOF, value: '', pos: this.pos });
    return tokens;
  }

  private skipWs(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
  }

  private readIdent(): string {
    const start = this.pos;
    while (
      this.pos < this.text.length &&
      (/[a-zA-Z0-9_]/.test(this.text[this.pos]) ||
        (this.text[this.pos] === '-' && this.pos + 1 < this.text.length && /[a-zA-Z0-9]/.test(this.text[this.pos + 1])))
    ) {
      this.pos++;
    }
    return this.text.slice(start, this.pos);
  }

  private readNum(): string {
    const start = this.pos;
    while (this.pos < this.text.length && /[0-9.]/.test(this.text[this.pos])) this.pos++;
    return this.text.slice(start, this.pos);
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const BINARY_TEMPORAL_OPS = new Map<TokenType, TDFOLTemporalOp>([
  [TT.UNTIL, 'U'],
  [TT.SINCE, 'S'],
  [TT.WEAK_UNTIL, 'W'],
  [TT.RELEASE, 'R'],
]);

const LOGICAL_PREFIX_OPS = new Map<TokenType, LogicOperator>([
  [TT.AND, '∧'],
  [TT.OR, '∨'],
  [TT.IMPLIES, '→'],
  [TT.IFF, '↔'],
  [TT.XOR, '⊕'],
]);

const FORMULA_START = new Set<TokenType>([
  TT.IDENTIFIER,
  TT.FORALL,
  TT.EXISTS,
  TT.OBLIGATION,
  TT.PERMISSION,
  TT.PROHIBITION,
  TT.ALWAYS,
  TT.EVENTUALLY,
  TT.NEXT,
  TT.NOT,
  TT.LPAREN,
]);

const RESERVED_MODAL_TOKENS = new Set<TokenType>([
  TT.OBLIGATION,
  TT.PERMISSION,
  TT.PROHIBITION,
  TT.ALWAYS,
  TT.EVENTUALLY,
  TT.NEXT,
  TT.UNTIL,
  TT.SINCE,
  TT.WEAK_UNTIL,
  TT.RELEASE,
]);

class TDFOLParser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  parse(): Formula {
    const f = this.parseFormula();
    if (this.cur().type !== TT.EOF) {
      throw new Error(`Unexpected token ${this.cur().type} at position ${this.cur().pos}`);
    }
    return f;
  }

  private cur(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  private peek(offset = 1): Token {
    const i = this.pos + offset;
    return this.tokens[i] ?? this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const t = this.cur();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private expect(type: TokenType): Token {
    const t = this.cur();
    if (t.type !== type) throw new Error(`Expected ${type} got ${t.type} at pos ${t.pos}`);
    return this.advance();
  }

  // Precedence: IFF < IMPLIES < OR < AND < NOT < quantified < modal < atomic
  private parseFormula(): Formula { return this.parseIff(); }

  private parseIff(): Formula {
    let left = this.parseImplies();
    while (this.cur().type === TT.IFF) {
      this.advance();
      left = mkBinary('↔', left, this.parseImplies());
    }
    return left;
  }

  private parseImplies(): Formula {
    let left = this.parseOr();
    while (this.cur().type === TT.IMPLIES) {
      this.advance();
      left = mkBinary('→', left, this.parseOr());
    }
    return left;
  }

  private parseOr(): Formula {
    let left = this.parseAnd();
    while (this.cur().type === TT.OR) {
      this.advance();
      left = mkBinary('∨', left, this.parseAnd());
    }
    return left;
  }

  private parseAnd(): Formula {
    let left = this.parseNot();
    while (this.cur().type === TT.AND) {
      this.advance();
      left = mkBinary('∧', left, this.parseNot());
    }
    return left;
  }

  private parseNot(): Formula {
    if (this.cur().type === TT.NOT) {
      this.advance();
      return mkUnary(this.parseNot());
    }
    return this.parseQuantified();
  }

  private parseQuantified(): Formula {
    if (this.cur().type === TT.FORALL) {
      this.advance();
      const v = this.parseVariable();
      if (this.cur().type === TT.DOT) this.advance();
      return mkQuantified('∀', v.name, this.parseFormula(), v.sort as SortKind | undefined);
    }
    if (this.cur().type === TT.EXISTS) {
      this.advance();
      const v = this.parseVariable();
      if (this.cur().type === TT.DOT) this.advance();
      return mkQuantified('∃', v.name, this.parseFormula(), v.sort as SortKind | undefined);
    }
    return this.parseModal();
  }

  private parseModal(): Formula {
    const t = this.cur();

    // Reserved modal tokens without '(' → treat as nullary predicate
    if (RESERVED_MODAL_TOKENS.has(t.type) && this.peek().type !== TT.LPAREN) {
      this.advance();
      return mkPredicate(t.value);
    }

    if (t.type === TT.OBLIGATION) { this.advance(); return this.parseDeontic('O'); }
    if (t.type === TT.PERMISSION)  { this.advance(); return this.parseDeontic('P'); }
    if (t.type === TT.PROHIBITION) { this.advance(); return this.parseDeontic('F'); }
    if (t.type === TT.ALWAYS)      { this.advance(); return this.parseTemporal('□'); }
    if (t.type === TT.EVENTUALLY)  { this.advance(); return this.parseTemporal('◊'); }
    if (t.type === TT.NEXT)        { this.advance(); return this.parseTemporal('X'); }

    return this.parseAtomic();
  }

  private parseDeontic(op: TDFOLDeonticOp): Formula {
    this.expect(TT.LPAREN);
    const body = this.parseFormula();
    this.expect(TT.RPAREN);
    return mkDeontic(op, body);
  }

  private parseTemporal(op: TDFOLTemporalOp): Formula {
    this.expect(TT.LPAREN);
    const body = this.parseFormula();
    this.expect(TT.RPAREN);
    return mkTemporal(op, body);
  }

  private parseAtomic(): Formula {
    if (this.cur().type === TT.LPAREN) {
      this.advance();

      // Prefix logical operator: (→ p q)
      const prefixLogical = LOGICAL_PREFIX_OPS.get(this.cur().type);
      if (prefixLogical !== undefined) {
        this.advance();
        const left = this.parseFormula();
        const right = this.parseFormula();
        this.expect(TT.RPAREN);
        return mkBinary(prefixLogical, left, right);
      }

      // Prefix binary temporal: (U φ ψ)
      const prefixTemporal = BINARY_TEMPORAL_OPS.get(this.cur().type);
      if (prefixTemporal !== undefined) {
        this.advance();
        const left = this.parseFormula();
        const right = this.parseFormula();
        this.expect(TT.RPAREN);
        return mkTemporal(prefixTemporal, left, right);
      }

      const inner = this.parseFormula();

      // Infix binary temporal: (φ U ψ)
      const infixTemporal = BINARY_TEMPORAL_OPS.get(this.cur().type);
      if (infixTemporal !== undefined) {
        this.advance();
        const right = this.parseFormula();
        this.expect(TT.RPAREN);
        return mkTemporal(infixTemporal, inner, right);
      }

      this.expect(TT.RPAREN);
      return inner;
    }

    return this.parsePredicate();
  }

  private parsePredicate(): Formula {
    const nameTok = this.expect(TT.IDENTIFIER);
    let name = nameTok.value;
    if (this.cur().type === TT.COLON) name = this.parseColonQualified(name);

    if (this.cur().type === TT.LPAREN) {
      this.advance();
      const args = this.parseTermList();
      this.expect(TT.RPAREN);
      return mkPredicate(name, args);
    }
    return mkPredicate(name, []);
  }

  private parseTermList(): Term[] {
    const terms: Term[] = [this.parseTerm()];
    while (this.cur().type === TT.COMMA) {
      this.advance();
      terms.push(this.parseTerm());
    }
    return terms;
  }

  private parseTerm(): Term {
    const t = this.cur();
    if (t.type === TT.NUMBER) {
      this.advance();
      return mkConstant(t.value, t.value);
    }
    if (t.type === TT.IDENTIFIER) {
      const name = t.value;
      this.advance();

      // Function application
      if (this.cur().type === TT.LPAREN) {
        this.advance();
        const args = this.parseTermList();
        this.expect(TT.RPAREN);
        return mkFuncApp(name, args);
      }

      // Colon-qualified: variable with sort or qualified constant
      if (this.cur().type === TT.COLON) {
        this.advance();
        const suffix = this.cur();
        if (suffix.type !== TT.IDENTIFIER && suffix.type !== TT.NUMBER) {
          throw new Error(`Unexpected token in term at pos ${suffix.pos}`);
        }
        this.advance();
        const upperSuffix = suffix.value.toUpperCase();
        if (KNOWN_SORTS.has(upperSuffix) && this.cur().type !== TT.COLON) {
          return mkVariable(name, upperSuffix.charAt(0) + upperSuffix.slice(1).toLowerCase() as SortKind);
        }
        let qualified = `${name}:${suffix.value}`;
        if (this.cur().type === TT.COLON) qualified = this.parseColonQualified(qualified);
        return mkConstant(qualified);
      }

      // Dates / numerics embedded in identifiers → constant
      if (name[0] >= '0' && name[0] <= '9' || name.includes('-')) {
        return mkConstant(name);
      }
      return mkVariable(name);
    }
    throw new Error(`Unexpected token in term: ${t.type} at pos ${t.pos}`);
  }

  private parseVariable(): { name: string; sort?: string } {
    const nameTok = this.expect(TT.IDENTIFIER);
    const name = nameTok.value;
    if (this.cur().type === TT.COLON) {
      // Look ahead: if next after colon is IDENTIFIER followed by '(', it's a formula separator
      const afterColon = this.peek(1);
      if (afterColon.type !== TT.IDENTIFIER || this.peek(2).type === TT.LPAREN) {
        // colon is formula separator — do not consume
      } else {
        this.advance(); // consume ':'
        const sortTok = this.expect(TT.IDENTIFIER);
        return { name, sort: sortTok.value };
      }
    }
    return { name };
  }

  private parseColonQualified(base: string): string {
    let sym = base;
    while (this.cur().type === TT.COLON) {
      this.advance();
      const suffix = this.cur();
      if (suffix.type !== TT.IDENTIFIER && suffix.type !== TT.NUMBER) {
        throw new Error(`Expected identifier after ':' at pos ${suffix.pos}`);
      }
      sym = `${sym}:${suffix.value}`;
      this.advance();
    }
    return sym;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a TDFOL formula string into an AST node.
 * Throws `Error` on syntax errors.
 *
 * @example
 *   parseTdfol("P(x)")           // Predicate
 *   parseTdfol("∀x. P(x) → Q(x)") // QuantifiedFormula
 *   parseTdfol("O(P(x))")        // DeonticFormulaTDFOL
 *   parseTdfol("□(P(x))")        // TemporalFormulaTDFOL
 */
export function parseTdfol(text: string): Formula {
  const lexer = new TDFOLLexer(text);
  const tokens = lexer.tokenize();
  const parser = new TDFOLParser(tokens);
  return parser.parse();
}

/**
 * Safely parse a TDFOL formula, returning `null` on any error.
 */
export function parseTdfolSafe(text: string): Formula | null {
  try {
    return parseTdfol(text);
  } catch {
    return null;
  }
}
