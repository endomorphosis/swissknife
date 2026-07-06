/**
 * CEC Base Parser Contract — PORT-181 (Sprint 84)
 *
 * Port of ipfs_datasets_py/logic/CEC/nl/base_parser.py.
 *
 * Defines a shared parser/result contract for language-specific CEC/NL parsers
 * and lightweight adapter helpers for existing parser implementations.
 */

export interface ParseMatch {
  type: string;
  operator: string;
  groups: string[];
  span: [number, number];
  text: string;
}

export interface ParseClause {
  operator: string;
  type: string;
  subject: string;
  predicate: string;
  confidence: number;
}

export interface ParseResult {
  text: string;
  clauses: ParseClause[];
  matches: ParseMatch[];
  confidence: number;
  language: string;
  errors: string[];
}

export interface ParserContract<Result extends ParseResult = ParseResult> {
  readonly language: string;
  parse(text: string): Result;
  parseAll(texts: string[]): Result[];
  getLanguage(): string;
}

export abstract class BaseParser<Result extends ParseResult = ParseResult> implements ParserContract<Result> {
  constructor(readonly language: string = 'en') {}

  abstract parse(text: string): Result;

  parseAll(texts: string[]): Result[] {
    return texts.map(text => this.parse(text));
  }

  getLanguage(): string {
    return this.language;
  }

  protected buildResult(partial: Omit<ParseResult, 'language' | 'confidence' | 'errors'> & Partial<Pick<ParseResult, 'language' | 'confidence' | 'errors'>>): ParseResult {
    const confidence = partial.confidence ?? averageConfidence(partial.clauses);
    return {
      text: partial.text,
      clauses: partial.clauses,
      matches: partial.matches,
      confidence,
      language: partial.language ?? this.language,
      errors: partial.errors ?? (partial.clauses.length === 0 ? ['No clauses extracted'] : []),
    };
  }
}

export function normalizeParseResult(
  result: { text: string; clauses?: Array<Partial<ParseClause>>; matches?: Array<Partial<ParseMatch>> },
  language = 'unknown',
): ParseResult {
  const clauses = (result.clauses ?? []).map(clause => ({
    operator: String(clause.operator ?? ''),
    type: String(clause.type ?? 'unknown'),
    subject: String(clause.subject ?? ''),
    predicate: String(clause.predicate ?? ''),
    confidence: clamp01(Number(clause.confidence ?? 0)),
  }));
  const matches = (result.matches ?? []).map(match => ({
    type: String(match.type ?? 'unknown'),
    operator: String(match.operator ?? ''),
    groups: Array.isArray(match.groups) ? match.groups.map(String) : [],
    span: Array.isArray(match.span) && match.span.length === 2
      ? [Number(match.span[0]), Number(match.span[1])] as [number, number]
      : [0, 0] as [number, number],
    text: String(match.text ?? ''),
  }));
  return {
    text: result.text,
    clauses,
    matches,
    confidence: averageConfidence(clauses),
    language,
    errors: clauses.length === 0 ? ['No clauses extracted'] : [],
  };
}

export function makeParserAdapter(
  language: string,
  parser: { parse(text: string): { text: string; clauses?: Array<Partial<ParseClause>>; matches?: Array<Partial<ParseMatch>> } },
): ParserContract {
  return new ParserAdapter(language, parser);
}

class ParserAdapter extends BaseParser {
  constructor(language: string, private readonly parser: { parse(text: string): { text: string; clauses?: Array<Partial<ParseClause>>; matches?: Array<Partial<ParseMatch>> } }) {
    super(language);
  }

  parse(text: string): ParseResult {
    return normalizeParseResult(this.parser.parse(text), this.language);
  }
}

export class KeywordBaseParser extends BaseParser {
  constructor(
    language = 'en',
    private readonly keywords: Record<string, string[]> = {
      obligation: ['must', 'shall', 'required'],
      permission: ['may', 'can', 'permitted'],
      prohibition: ['must not', 'shall not', 'forbidden'],
    },
  ) {
    super(language);
  }

  parse(text: string): ParseResult {
    const lower = text.toLowerCase();
    const clauses: ParseClause[] = [];
    for (const [type, words] of Object.entries(this.keywords)) {
      for (const word of words) {
        const idx = lower.indexOf(word.toLowerCase());
        if (idx < 0) continue;
        clauses.push({
          operator: type,
          type: 'deontic',
          subject: text.slice(0, idx).trim(),
          predicate: text.slice(idx + word.length).trim(),
          confidence: 0.7,
        });
        break;
      }
    }
    return this.buildResult({
      text,
      clauses,
      matches: clauses.map((clause, idx) => ({
        type: clause.type,
        operator: clause.operator,
        groups: [clause.subject, clause.predicate],
        span: [idx, idx] as [number, number],
        text: clause.predicate,
      })),
    }) as ParseResult;
  }
}

export function getParser(language: string): ParserContract {
  return new KeywordBaseParser(language);
}

function averageConfidence(clauses: Array<{ confidence: number }>): number {
  return clauses.length ? clauses.reduce((sum, clause) => sum + clause.confidence, 0) / clauses.length : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
