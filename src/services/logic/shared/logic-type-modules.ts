/**
 * Namespaced Logic Type Modules — PORT-207
 *
 * Collects common, translation, deontic, and FOL-facing types in one place
 * while leaving existing service-local exports intact.
 */

export namespace CommonTypes {
  export interface Metadata {
    source?: string;
    version?: string;
    tags?: string[];
    extra?: Record<string, unknown>;
  }

  export interface ResultEnvelope<T = unknown> {
    ok: boolean;
    value?: T;
    errors: string[];
    warnings: string[];
    metadata: Metadata;
  }

  export type Confidence = number;
}

export namespace TranslationTypes {
  export type LogicLanguage = 'dcec' | 'tdfol' | 'fol' | 'tptp' | 'prolog' | 'coq' | 'lean4' | 'smt2';

  export interface TranslationRequest {
    input: string;
    source: LogicLanguage;
    target: LogicLanguage;
    metadata?: CommonTypes.Metadata;
  }

  export interface TranslationResult extends CommonTypes.ResultEnvelope<string> {
    source: LogicLanguage;
    target: LogicLanguage;
    confidence: CommonTypes.Confidence;
  }
}

export namespace DeonticTypes {
  export type Modality = 'obligation' | 'permission' | 'prohibition' | 'waiver' | 'claim';

  export interface NormParty {
    id: string;
    role?: string;
    displayName?: string;
  }

  export interface DeonticClause {
    modality: Modality;
    actor?: NormParty;
    action: string;
    condition?: string;
    temporal?: string;
    provenance?: CommonTypes.Metadata;
  }
}

export namespace FOLTypes {
  export type Quantifier = 'forall' | 'exists';
  export type Connective = 'and' | 'or' | 'not' | 'implies' | 'iff';

  export interface Term {
    name: string;
    args?: Term[];
  }

  export interface Predicate {
    name: string;
    terms: Term[];
    negated?: boolean;
  }

  export interface Formula {
    predicates: Predicate[];
    quantifiers?: Array<{ quantifier: Quantifier; variable: string }>;
    connectives?: Connective[];
  }
}
