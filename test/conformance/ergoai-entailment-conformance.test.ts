import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { FLogicProvingMethod, ZKPFLogicProver } from '../../src/services/integrations/flogic-ergoai-wrapper.js';

interface EntailmentVector {
  id: string;
  description?: string;
  formula: string;
  axioms: string[];
  expected: {
    isProved: boolean;
  };
}

interface EntailmentCorpus {
  schemaVersion: string;
  vectors: EntailmentVector[];
}

function loadEntailmentCorpus(): EntailmentCorpus {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/ergoai-entailment-vectors.json');
  return JSON.parse(readFileSync(corpusPath, 'utf8')) as EntailmentCorpus;
}

describe('PORT-254 ErgoAI entailment parity corpus (standard fragment)', () => {
  const corpus = loadEntailmentCorpus();

  it('has valid schema and expected vector count', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(5);
    expect(new Set(corpus.vectors.map(vector => vector.id)).size).toBe(corpus.vectors.length);
  });

  it('matches expected entailment outcomes for each corpus vector', async () => {
    const prover = new ZKPFLogicProver();

    for (const vector of corpus.vectors) {
      const result = await prover.prove(vector.formula, vector.axioms, FLogicProvingMethod.STANDARD);
      expect(result.method).toBe(FLogicProvingMethod.STANDARD);
      expect(result.proof).toBeNull();
      expect(result.isProved).toBe(vector.expected.isProved);
    }
  });
});
