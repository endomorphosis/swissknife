/**
 * F-logic Semantic Normalizer — PORT-191 (Sprint 92)
 *
 * Rule-based semantic normalization for frame-logic text and triples. This is
 * broader than the round-trip optimizer: it rewrites symbols, aliases,
 * relation names, class names, and frame syntax into a canonical form.
 */

export interface FLogicTriple {
  subject: string;
  predicate: string;
  object: string;
}

export interface NormalizationRule {
  readonly name: string;
  apply(input: string): string;
}

export interface NormalizationResult {
  input: string;
  normalized: string;
  rulesApplied: string[];
  triples: FLogicTriple[];
}

export class LowercaseSymbolsRule implements NormalizationRule {
  readonly name = 'lowercase-symbols';
  apply(input: string): string {
    return input.replace(/\b[A-Za-z_][\w:-]*\b/g, token => token.toLowerCase());
  }
}

export class WhitespaceRule implements NormalizationRule {
  readonly name = 'canonical-whitespace';
  apply(input: string): string {
    return input.replace(/\s+/g, ' ').replace(/\s*([()[\],.;])\s*/g, '$1').trim();
  }
}

export class AliasRule implements NormalizationRule {
  readonly name = 'alias-rewrite';
  constructor(private readonly aliases: Record<string, string>) {}
  apply(input: string): string {
    let output = input;
    for (const [from, to] of Object.entries(this.aliases)) {
      output = output.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi'), to);
    }
    return output;
  }
}

export class PredicateSynonymRule implements NormalizationRule {
  readonly name = 'predicate-synonyms';
  private readonly synonyms: Record<string, string> = {
    owns: 'has',
    owner_of: 'has',
    member_of: 'in',
    type: 'isa',
    rdf_type: 'isa',
    subclassof: 'subclass_of',
  };
  apply(input: string): string {
    let output = input;
    for (const [from, to] of Object.entries(this.synonyms)) {
      output = output.replace(new RegExp(`\\b${escapeRegExp(from)}\\b(?=\\s*(?:\\(|->))`, 'g'), to);
    }
    return output;
  }
}

export class FrameSyntaxRule implements NormalizationRule {
  readonly name = 'frame-syntax';
  apply(input: string): string {
    return input
      .replace(/\b([a-z_][\w:-]*)\s*\(\s*([^,()]+)\s*,\s*([^)]+)\)/g, (_, pred: string, subj: string, obj: string) => `${subj}[${pred}->${obj}]`)
      .replace(/::/g, ':')
      .replace(/\s*->\s*/g, '->');
  }
}

export class SlotOrderingRule implements NormalizationRule {
  readonly name = 'slot-ordering';
  apply(input: string): string {
    return input.split(/[.;]\s*/).map(frame => normalizeFrameSlots(frame)).filter(Boolean).join('.');
  }
}

export class ClassPrefixRule implements NormalizationRule {
  readonly name = 'class-prefix';
  apply(input: string): string {
    return input.replace(/\b([a-z_][\w:-]*)\s+([a-z_][\w:-]*)\[([^\]]+)\]/g, (_, className: string, subject: string, slots: string) => {
      const slotText = slots.trim();
      const suffix = slotText ? `${slotText},type->${className}` : `type->${className}`;
      return `${subject}[${suffix}]`;
    });
  }
}

export class FLogicSemanticNormalizer {
  private readonly rules: NormalizationRule[];

  constructor(opts: { aliases?: Record<string, string>; rules?: NormalizationRule[] } = {}) {
    this.rules = opts.rules ?? [
      new AliasRule(opts.aliases ?? {}),
      new LowercaseSymbolsRule(),
      new PredicateSynonymRule(),
      new FrameSyntaxRule(),
      new ClassPrefixRule(),
      new WhitespaceRule(),
      new SlotOrderingRule(),
    ];
  }

  normalize(input: string): NormalizationResult {
    let current = input;
    const rulesApplied: string[] = [];
    for (const rule of this.rules) {
      const next = rule.apply(current);
      if (next !== current) rulesApplied.push(rule.name);
      current = next;
    }
    return {
      input,
      normalized: current,
      rulesApplied,
      triples: parseNormalizedTriples(current),
    };
  }

  normalizeBatch(inputs: string[]): NormalizationResult[] {
    return inputs.map(input => this.normalize(input));
  }
}

export function normalizeFLogic(input: string, aliases: Record<string, string> = {}): string {
  return new FLogicSemanticNormalizer({ aliases }).normalize(input).normalized;
}

export function parseNormalizedTriples(input: string): FLogicTriple[] {
  const triples: FLogicTriple[] = [];
  for (const frame of input.split(/[.;]+/).map(part => part.trim()).filter(Boolean)) {
    const match = frame.match(/^([a-z_][\w:-]*)\[([^\]]+)\]$/);
    if (!match) continue;
    const subject = match[1]!;
    for (const slot of match[2]!.split(',').map(part => part.trim()).filter(Boolean)) {
      const [predicate, object] = slot.split('->').map(part => part.trim());
      if (predicate && object) triples.push({ subject, predicate, object });
    }
  }
  return triples;
}

function normalizeFrameSlots(frame: string): string {
  const match = frame.trim().match(/^([a-z_][\w:-]*)\[([^\]]+)\]$/);
  if (!match) return frame.trim();
  const slots = match[2]!.split(',').map(slot => slot.trim()).filter(Boolean).sort();
  return `${match[1]}[${slots.join(',')}]`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
