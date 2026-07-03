/**
 * TDFOL NL Preprocessor — PORT-186 (Sprint 90)
 *
 * Provides entity/context tracking, simple coreference resolution, sentence
 * segmentation, token/POS hints, and temporal normalization for NL -> TDFOL.
 */

export type NLEntityType = 'agent' | 'object' | 'event' | 'time' | 'location' | 'organization';

export interface EntityMention {
  sentenceIndex: number;
  start: number;
  end: number;
  text: string;
}

export interface NLEntity {
  id: string;
  text: string;
  type: NLEntityType;
  aliases: string[];
  mentions: EntityMention[];
}

export interface NLToken {
  text: string;
  lemma: string;
  pos: 'PROPN' | 'NOUN' | 'VERB' | 'PRON' | 'NUM' | 'PUNCT' | 'OTHER';
  sentenceIndex: number;
}

export interface TemporalExpression {
  text: string;
  normalized: string;
  sentenceIndex: number;
  start: number;
}

export interface ProcessedSentence {
  text: string;
  resolvedText: string;
  tokens: NLToken[];
  entities: NLEntity[];
  temporalExpressions: TemporalExpression[];
}

export interface ProcessedDocument {
  text: string;
  sentences: ProcessedSentence[];
  entities: NLEntity[];
  temporalExpressions: TemporalExpression[];
}

const PRONOUNS = new Set(['he', 'she', 'it', 'they', 'him', 'her', 'them', 'its', 'their', 'they']);
const AGENT_WORDS = new Set(['contractor', 'vendor', 'employee', 'user', 'party', 'controller', 'processor', 'buyer', 'seller']);

export class NLContext {
  private readonly entities = new Map<string, NLEntity>();
  private focus: NLEntity | null = null;

  addEntity(text: string, type: NLEntityType, mention?: EntityMention): NLEntity {
    const id = normalizeId(text);
    const existing = this.entities.get(id);
    if (existing) {
      if (mention) existing.mentions.push(mention);
      this.focus = existing;
      return existing;
    }
    const entity: NLEntity = {
      id,
      text: titleCase(text),
      type,
      aliases: [text.toLowerCase()],
      mentions: mention ? [mention] : [],
    };
    this.entities.set(id, entity);
    this.focus = entity;
    return entity;
  }

  resolvePronoun(pronoun: string): NLEntity | null {
    return PRONOUNS.has(pronoun.toLowerCase()) ? this.focus : null;
  }

  resolveReferences(text: string): string {
    return text.split(/\b/).map(part => {
      const entity = this.resolvePronoun(part);
      return entity ? entity.text : part;
    }).join('');
  }

  getEntity(text: string): NLEntity | null {
    return this.entities.get(normalizeId(text)) ?? null;
  }

  getFocus(): NLEntity | null {
    return this.focus;
  }

  getEntities(): NLEntity[] {
    return [...this.entities.values()];
  }
}

export class TDFOLNLPreprocessor {
  constructor(private readonly context = new NLContext()) {}

  preprocess(text: string): ProcessedDocument {
    const rawSentences = splitSentences(text);
    const sentences: ProcessedSentence[] = [];
    const temporals: TemporalExpression[] = [];

    rawSentences.forEach((sentence, sentenceIndex) => {
      const resolvedText = this.context.resolveReferences(sentence);
      const tokens = tokenize(resolvedText, sentenceIndex);
      const sentenceEntities = extractEntities(resolvedText, sentenceIndex, this.context);
      const temporalExpressions = extractTemporalExpressions(resolvedText, sentenceIndex);
      temporals.push(...temporalExpressions);
      sentences.push({ text: sentence, resolvedText, tokens, entities: sentenceEntities, temporalExpressions });
    });

    return {
      text,
      sentences,
      entities: this.context.getEntities(),
      temporalExpressions: temporals,
    };
  }

  getContext(): NLContext {
    return this.context;
  }
}

export function preprocessTdfolNaturalLanguage(text: string): ProcessedDocument {
  return new TDFOLNLPreprocessor().preprocess(text);
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map(sentence => sentence.replace(/[.!?]+$/, '').trim()).filter(Boolean);
}

function tokenize(sentence: string, sentenceIndex: number): NLToken[] {
  return sentence.split(/(\W+)/).filter(part => part.trim()).map(part => {
    const lower = part.toLowerCase();
    return {
      text: part,
      lemma: lower.replace(/s$/, ''),
      pos: PRONOUNS.has(lower) ? 'PRON'
        : /^\d+$/.test(part) ? 'NUM'
        : /^[A-Z]/.test(part) ? 'PROPN'
        : /\b(?:must|shall|may|can|should|notify|deliver|pay|delete|retain)\b/i.test(part) ? 'VERB'
        : /^[.,;:!?]$/.test(part) ? 'PUNCT'
        : /[A-Za-z]/.test(part) ? 'NOUN'
        : 'OTHER',
      sentenceIndex,
    };
  });
}

function extractEntities(sentence: string, sentenceIndex: number, context: NLContext): NLEntity[] {
  const entities: NLEntity[] = [];
  for (const match of sentence.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g)) {
    entities.push(context.addEntity(match[1]!, classifyEntity(match[1]!), {
      sentenceIndex,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[1]!.length,
      text: match[1]!,
    }));
  }
  for (const match of sentence.matchAll(/\b(contractor|vendor|employee|user|party|controller|processor|buyer|seller)\b/gi)) {
    entities.push(context.addEntity(match[1]!, 'agent', {
      sentenceIndex,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[1]!.length,
      text: match[1]!,
    }));
  }
  return [...new Map(entities.map(entity => [entity.id, entity])).values()];
}

function extractTemporalExpressions(sentence: string, sentenceIndex: number): TemporalExpression[] {
  const expressions: TemporalExpression[] = [];
  const temporalPattern = /\b(within\s+(\d+)\s+(days?|hours?|weeks?|months?)|by\s+(\d{4}-\d{2}-\d{2})|before\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4}))\b/gi;
  for (const match of sentence.matchAll(temporalPattern)) {
    expressions.push({
      text: match[0],
      normalized: normalizeTemporal(match),
      sentenceIndex,
      start: match.index ?? 0,
    });
  }
  return expressions;
}

function normalizeTemporal(match: RegExpMatchArray): string {
  if (match[2] && match[3]) {
    const unit = match[3].toLowerCase();
    const prefix = unit.startsWith('hour') ? 'PT' : 'P';
    const suffix = unit.startsWith('day') ? 'D' : unit.startsWith('week') ? 'W' : unit.startsWith('month') ? 'M' : 'H';
    return `${prefix}${match[2]}${suffix}`;
  }
  if (match[4]) return match[4];
  return match[0].toLowerCase();
}

function classifyEntity(text: string): NLEntityType {
  return AGENT_WORDS.has(text.toLowerCase()) ? 'agent' : /^[A-Z]/.test(text) ? 'organization' : 'object';
}

function normalizeId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, ch => ch.toUpperCase());
}
