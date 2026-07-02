/**
 * Domain Vocabulary — T-265 (Sprint 59)
 * Port of CEC/nl/domain_vocabularies/domain_vocab.py (465L)
 */

export interface DomainTerm { term: string; synonyms: string[]; domain: string; description?: string; }

export interface DomainVocabulary {
  readonly domain: string;
  lookupTerm(term: string): DomainTerm | null;
  getTerms(): DomainTerm[];
  expand(term: string): string[];
}

class BaseDomainVocabulary implements DomainVocabulary {
  protected readonly terms = new Map<string, DomainTerm>();
  constructor(readonly domain: string) {}

  addTerm(t: DomainTerm): void {
    this.terms.set(t.term.toLowerCase(), t);
    for (const s of t.synonyms) this.terms.set(s.toLowerCase(), t);
  }

  lookupTerm(term: string): DomainTerm | null { return this.terms.get(term.toLowerCase()) ?? null; }
  getTerms(): DomainTerm[] { return [...new Set(this.terms.values())]; }
  expand(term: string): string[] {
    const t = this.lookupTerm(term);
    return t ? [t.term, ...t.synonyms] : [term];
  }
}

export class LegalVocabulary extends BaseDomainVocabulary {
  constructor() {
    super('legal');
    const terms: DomainTerm[] = [
      { term: 'obligation', synonyms: ['duty', 'must', 'shall', 'required'], domain: 'legal' },
      { term: 'permission', synonyms: ['may', 'allowed', 'entitled', 'authorized'], domain: 'legal' },
      { term: 'prohibition', synonyms: ['forbidden', 'banned', 'must not', 'shall not'], domain: 'legal' },
      { term: 'contract',    synonyms: ['agreement', 'deed', 'indenture'], domain: 'legal' },
      { term: 'liability',   synonyms: ['responsibility', 'culpability', 'accountability'], domain: 'legal' },
      { term: 'jurisdiction', synonyms: ['authority', 'competence', 'venue'], domain: 'legal' },
      { term: 'tort',        synonyms: ['wrong', 'civil wrong', 'delict'], domain: 'legal' },
      { term: 'statute',     synonyms: ['law', 'act', 'legislation', 'code'], domain: 'legal' },
    ];
    for (const t of terms) this.addTerm(t);
  }
}

export class MedicalVocabulary extends BaseDomainVocabulary {
  constructor() {
    super('medical');
    const terms: DomainTerm[] = [
      { term: 'patient',    synonyms: ['individual', 'subject', 'beneficiary'], domain: 'medical' },
      { term: 'consent',    synonyms: ['agreement', 'authorization', 'assent'], domain: 'medical' },
      { term: 'diagnosis',  synonyms: ['assessment', 'evaluation', 'finding'], domain: 'medical' },
      { term: 'treatment',  synonyms: ['therapy', 'intervention', 'procedure'], domain: 'medical' },
      { term: 'data',       synonyms: ['record', 'information', 'PHI'], domain: 'medical' },
      { term: 'disclosure', synonyms: ['sharing', 'release', 'dissemination'], domain: 'medical' },
    ];
    for (const t of terms) this.addTerm(t);
  }
}

export class TechnicalVocabulary extends BaseDomainVocabulary {
  constructor() {
    super('technical');
    const terms: DomainTerm[] = [
      { term: 'access',     synonyms: ['connect', 'enter', 'use'], domain: 'technical' },
      { term: 'data',       synonyms: ['information', 'content', 'payload'], domain: 'technical' },
      { term: 'system',     synonyms: ['platform', 'service', 'infrastructure'], domain: 'technical' },
      { term: 'credential', synonyms: ['token', 'key', 'certificate', 'secret'], domain: 'technical' },
      { term: 'deploy',     synonyms: ['release', 'publish', 'install'], domain: 'technical' },
      { term: 'endpoint',   synonyms: ['API', 'route', 'URL', 'service'], domain: 'technical' },
    ];
    for (const t of terms) this.addTerm(t);
  }
}

export class DomainVocabularyManager {
  private readonly registries = new Map<string, DomainVocabulary>();

  constructor() {
    this.register(new LegalVocabulary());
    this.register(new MedicalVocabulary());
    this.register(new TechnicalVocabulary());
  }

  register(vocab: DomainVocabulary): void { this.registries.set(vocab.domain, vocab); }

  lookup(term: string, domain?: string): DomainTerm | null {
    if (domain) return this.registries.get(domain)?.lookupTerm(term) ?? null;
    for (const v of this.registries.values()) {
      const t = v.lookupTerm(term);
      if (t) return t;
    }
    return null;
  }

  expand(term: string, domain?: string): string[] {
    const t = this.lookup(term, domain);
    return t ? [t.term, ...t.synonyms] : [term];
  }

  getDomains(): string[] { return [...this.registries.keys()]; }
  getVocabulary(domain: string): DomainVocabulary | null { return this.registries.get(domain) ?? null; }
}
