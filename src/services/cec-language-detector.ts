/**
 * CEC Language Detector — T-279 (Sprint 61)
 * Port of CEC/nl/language_detector.py (413L)
 */

export enum Language {
  EN = 'en', DE = 'de', FR = 'fr', ES = 'es', IT = 'it',
  PT = 'pt', NL = 'nl', PL = 'pl', JA = 'ja', ZH = 'zh',
  UNKNOWN = 'unknown',
}

// Heuristic keyword sets for detection
const LANG_KEYWORDS: Record<Language, string[]> = {
  [Language.EN]: ['the','a','an','is','are','was','were','must','shall','may','can','will','have','has','not','and','or'],
  [Language.DE]: ['der','die','das','ist','sind','muss','soll','darf','kann','wird','nicht','und','oder','eine','ein'],
  [Language.FR]: ['le','la','les','est','sont','doit','peut','sera','ne','pas','et','ou','une','un'],
  [Language.ES]: ['el','la','los','las','es','son','debe','puede','será','no','y','o','un','una'],
  [Language.IT]: ['il','la','è','sono','deve','può','non','e','o','un','una'],
  [Language.PT]: ['o','a','os','as','é','são','deve','pode','não','e','ou','um','uma'],
  [Language.NL]: ['de','het','is','zijn','moet','kan','zal','niet','en','of','een'],
  [Language.PL]: ['jest','są','musi','może','nie','i','lub'],
  [Language.JA]: ['は','が','を','に','で','の','と','も','から','まで'],
  [Language.ZH]: ['的','是','在','不','了','有','和','我','他','这'],
  [Language.UNKNOWN]: [],
};

export interface DetectionResult {
  language: Language;
  confidence: number;
  scores: Partial<Record<Language, number>>;
}

export class LanguageDetector {
  detect(text: string): DetectionResult {
    const lower = text.toLowerCase();
    const words = new Set(lower.split(/\W+/).filter(w => w.length > 1));

    const scores: Partial<Record<Language, number>> = {};
    let bestLang: Language = Language.UNKNOWN;
    let bestScore = 0;

    for (const [lang, keywords] of Object.entries(LANG_KEYWORDS) as [Language, string[]][]) {
      if (lang === Language.UNKNOWN) continue;
      // For CJK languages, use character presence instead of words
      if (lang === Language.JA || lang === Language.ZH) {
        const charHits = keywords.filter(k => text.includes(k)).length;
        scores[lang] = charHits / keywords.length;
      } else {
        const hits = keywords.filter(k => words.has(k)).length;
        scores[lang] = hits / Math.max(keywords.length, 1);
      }
      if (scores[lang]! > bestScore) { bestScore = scores[lang]!; bestLang = lang; }
    }

    const confidence = Math.min(1, bestScore * 2); // scale to ~[0,1]
    return { language: bestLang, confidence, scores };
  }

  detectBatch(texts: string[]): DetectionResult[] { return texts.map(t => this.detect(t)); }

  getConfidence(text: string, lang: Language): number {
    const result = this.detect(text);
    return result.language === lang ? result.confidence : (result.scores[lang] ?? 0);
  }
}
