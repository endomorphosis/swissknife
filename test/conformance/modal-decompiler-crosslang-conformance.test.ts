import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  DecodedModalPhrase,
  DecodedModalText,
  decodedModalPhraseSlotTextMap,
  modalTextTokenSimilarity,
} from '../../src/services/modal-ir-decompiler';

interface SimilarityCase {
  id: string;
  left: string;
  right: string;
  expected: number;
}

interface SlotPhrase {
  text: string;
  slot: string;
  spans?: number[][];
  fixed?: boolean;
  provenanceOnly?: boolean;
}

interface SlotDecoded {
  sourceId: string;
  text: string;
  phrases: SlotPhrase[];
  supportSpan?: number[];
}

interface SlotCase {
  id: string;
  includeFixed: boolean;
  includeProvenanceOnly: boolean;
  decoded: SlotDecoded;
  expected: Record<string, string[]>;
}

interface DecompilerCorpus {
  schemaVersion: string;
  similarityCases: SimilarityCase[];
  slotMapCases: SlotCase[];
}

interface PySimilarityRow {
  id: string;
  similarity: number;
}

interface PySlotMapRow {
  id: string;
  slotMap: Record<string, string[]>;
}

interface PyResultFile {
  schemaVersion: string;
  similarityResults: PySimilarityRow[];
  slotMapResults: PySlotMapRow[];
}

function loadCorpus(): DecompilerCorpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-decompiler-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as DecompilerCorpus;
}

function runPythonReference(corpusPath: string): PyResultFile {
  const tempDir = mkdtempSync(join(tmpdir(), 'modal-decompiler-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_decompiler_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], { encoding: 'utf8' });
    if (proc.status !== 0) {
      throw new Error(`Python decompiler runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-247 modal decompiler helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-decompiler-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for similarity + slot map helpers', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const pyResults = runPythonReference(corpusPath);
    const pySimilarityById = new Map(pyResults.similarityResults.map(row => [row.id, row.similarity]));
    const pySlotMapById = new Map(pyResults.slotMapResults.map(row => [row.id, row.slotMap]));

    for (const testCase of corpus.similarityCases) {
      const tsSimilarity = modalTextTokenSimilarity(testCase.left, testCase.right);
      expect(tsSimilarity).toBe(testCase.expected);
      expect(tsSimilarity).toBe(pySimilarityById.get(testCase.id));
    }

    for (const testCase of corpus.slotMapCases) {
      const decoded = new DecodedModalText({
        sourceId: testCase.decoded.sourceId,
        text: testCase.decoded.text,
        phrases: testCase.decoded.phrases.map(phrase => new DecodedModalPhrase({
          text: phrase.text,
          slot: phrase.slot,
          spans: phrase.spans,
          fixed: phrase.fixed,
          provenanceOnly: phrase.provenanceOnly,
        })),
        supportSpan: testCase.decoded.supportSpan,
      });

      const tsMap = decodedModalPhraseSlotTextMap(decoded, {
        includeFixed: testCase.includeFixed,
        includeProvenanceOnly: testCase.includeProvenanceOnly,
      });
      expect(tsMap).toEqual(testCase.expected);
      expect(tsMap).toEqual(pySlotMapById.get(testCase.id));
    }
  });
});
