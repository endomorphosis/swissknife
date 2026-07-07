/**
 * CEC NL Converter — T-266 (Sprint 59)
 * Port of CEC/native/nl_converter.py (445L)
 */

import { PatternMatcher, PatternType, PatternMatch } from '../tdfol/tdfol-nl-patterns';

export interface CECConversionResult {
  text:         string;
  formula:      string;
  confidence:   number;
  method:       'pattern' | 'grammar' | 'hybrid';
  patterns:     string[];
  errors:       string[];
}

export interface NLConverterStats {
  totalConverted: number; succeeded: number; failed: number; avgConfidence: number;
}

export class NaturalLanguageConverter {
  private readonly matcher = new PatternMatcher();
  private readonly stats: NLConverterStats = { totalConverted: 0, succeeded: 0, failed: 0, avgConfidence: 0 };

  convert(text: string): CECConversionResult {
    this.stats.totalConverted++;
    const matches = this.matcher.match(text);
    const errors: string[] = [];
    const patternNames: string[] = [];
    let formula = '';
    let confidence = 0;

    if (matches.length === 0) {
      errors.push('No patterns matched');
      this.stats.failed++;
      return { text, formula: '', confidence: 0, method: 'pattern', patterns: [], errors };
    }

    // Build formula from strongest match
    const best = matches.reduce((a, b) => a.confidence > b.confidence ? a : b);
    patternNames.push(best.pattern.name);

    const agent  = best.entities['agent']  ?? 'Agent';
    const action = best.entities['action'] ?? 'Act';

    switch (best.pattern.type) {
      case PatternType.OBLIGATION:
        formula = `O(${_camel(action)}(${_camel(agent)}))`;
        confidence = best.confidence * 0.9;
        break;
      case PatternType.PERMISSION:
        formula = `P(${_camel(action)}(${_camel(agent)}))`;
        confidence = best.confidence * 0.85;
        break;
      case PatternType.PROHIBITION:
        formula = `F(${_camel(action)}(${_camel(agent)}))`;
        confidence = best.confidence * 0.9;
        break;
      case PatternType.UNIVERSAL_QUANTIFICATION:
        formula = `∀x.(${_camel(agent)}(x) → ${_camel(action)}(x))`;
        confidence = best.confidence * 0.8;
        break;
      case PatternType.TEMPORAL:
        formula = `□${_camel(action)}`;
        confidence = best.confidence * 0.75;
        break;
      case PatternType.CONDITIONAL:
        formula = `(${_camel(best.entities['condition'] ?? 'P')} → ${_camel(best.entities['consequence'] ?? 'Q')})`;
        confidence = best.confidence * 0.75;
        break;
      default:
        formula = `P(${_camel(text.slice(0, 20))})`;
        confidence = 0.3;
    }

    this.stats.succeeded++;
    const n = this.stats.totalConverted;
    this.stats.avgConfidence = ((n - 1) * this.stats.avgConfidence + confidence) / n;

    return { text, formula, confidence, method: 'pattern', patterns: patternNames, errors };
  }

  convertBatch(texts: string[]): CECConversionResult[] { return texts.map(t => this.convert(t)); }
  getStats(): Readonly<NLConverterStats> { return { ...this.stats }; }
}

function _camel(s: string): string {
  return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

export function createEnhancedNlConverter(_useGrammar = true): NaturalLanguageConverter {
  return new NaturalLanguageConverter();
}
