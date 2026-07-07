const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  mkdtempSync: (prefix: string) => string;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  rmSync: (path: string, options: { recursive?: boolean; force?: boolean }) => void;
  writeFileSync: (path: string, data: string) => void;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for conformance tests');
}

import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  DecodedModalPhrase,
  DecodedModalText,
  decodeModalIRDocument,
  decodedModalPhraseSlotTextMap,
  modalIrFormulaToText,
  modalTextTokenSimilarity,
  type ModalIRDocument,
} from '../../src/services/logic/modal/modal-ir-decompiler';

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
  formulaRenderCases: Array<{
    id: string;
    formula: {
      formulaId: string;
      operator: {
        family: string;
        system: string;
        symbol: string;
        label: string;
      };
      predicate: {
        name: string;
        arguments: string[];
        role?: string;
      };
      provenance: Record<string, unknown>;
    };
    expected: string;
  }>;
  decodedDocumentCases: Array<{
    id: string;
    document: ModalIRDocument & { source?: string };
    slotSubsetKeys: string[];
    expected: DecodedDocumentSummary;
  }>;
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
  formulaRenderResults: Array<{ id: string; text: string }>;
  decodedDocumentResults: Array<{ id: string; summary: DecodedDocumentSummary }>;
}

interface DecodedDocumentSummary {
  source_id: string;
  text: string;
  support_span: number[];
  reconstruction_similarity: number;
  modal_span_coverage: number;
  reconstruction_strategy: string;
  parser_warnings: string[];
  missing_slots: string[];
  formulas: string[];
  slot_subset: Record<string, string[]>;
}

function loadCorpus(): DecompilerCorpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-decompiler-vectors.json');
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as DecompilerCorpus;
}

function runPythonReference(corpusPath: string): PyResultFile {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'modal-decompiler-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_decompiler_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], { encoding: 'utf8' });
    if (proc.status !== 0) {
      throw new Error(`Python decompiler runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function decodedDocumentSummary(document: ModalIRDocument, slotSubsetKeys: string[]): DecodedDocumentSummary {
  const decoded = decodeModalIRDocument(document);
  const slotMap = decodedModalPhraseSlotTextMap(decoded);
  return {
    source_id: decoded.sourceId,
    text: decoded.text,
    support_span: decoded.supportSpan,
    reconstruction_similarity: decoded.reconstructionSimilarity,
    modal_span_coverage: decoded.modalSpanCoverage,
    reconstruction_strategy: decoded.reconstructionStrategy,
    parser_warnings: decoded.parserWarnings,
    missing_slots: decoded.missingSlots,
    formulas: decoded.formulas,
    slot_subset: Object.fromEntries(
      slotSubsetKeys
        .filter(key => key in slotMap)
        .map(key => [key, slotMap[key]])
    ),
  };
}

describe('PORT-247 modal decompiler decoded-document parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-decompiler-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for helper and decoded-document summaries', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const pyResults = runPythonReference(corpusPath);
    const pySimilarityById = new Map(pyResults.similarityResults.map(row => [row.id, row.similarity]));
    const pySlotMapById = new Map(pyResults.slotMapResults.map(row => [row.id, row.slotMap]));
    const pyFormulaRenderById = new Map(pyResults.formulaRenderResults.map(row => [row.id, row.text]));
    const pyDecodedDocumentById = new Map(pyResults.decodedDocumentResults.map(row => [row.id, row.summary]));

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

    for (const testCase of corpus.formulaRenderCases) {
      const tsText = modalIrFormulaToText({
        formulaType: 'modal',
        formulaId: testCase.formula.formulaId,
        operator: testCase.formula.operator,
        predicate: testCase.formula.predicate,
        provenance: {
          sourceId: String(testCase.formula.provenance.sourceId ?? ''),
          startChar: Number(testCase.formula.provenance.startChar ?? 0),
          endChar: Number(testCase.formula.provenance.endChar ?? 0),
          citation: testCase.formula.provenance.citation as string | null | undefined,
        },
      });
      expect(tsText).toBe(testCase.expected);
      expect(tsText).toBe(pyFormulaRenderById.get(testCase.id));
    }

    for (const testCase of corpus.decodedDocumentCases) {
      const tsSummary = decodedDocumentSummary(testCase.document, testCase.slotSubsetKeys);
      expect(tsSummary).toEqual(testCase.expected);
      expect(tsSummary).toEqual(pyDecodedDocumentById.get(testCase.id));
    }
  });
});
