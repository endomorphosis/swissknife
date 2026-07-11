import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  canonicalUscCitation,
  citationSectionComponentProfile,
  citationSectionComponentSignature,
  citationSectionDelimiterKind,
  citationSectionDelimiterTokens,
  inferredCitationsFromSourceIds,
  sourceIdInferredCitation,
  titleSectionCoordinate,
} from '../../src/services/logic/modal/modal-logic-codec.js';

interface CitationResult {
  canonical: string;
  coordinate: string;
  delimiterTokens: string[];
  delimiterKinds: string[];
  signatures: string[];
  profiles: string[];
  sourceIdCitations: string[];
  inferredCitations: string[];
}

interface CitationVector {
  id: string;
  description?: string;
  title: string;
  section: string;
  delimiterSection: string;
  delimiterKinds: string[];
  signatures: Array<{ number: string; suffix?: string; suffixKind?: string }>;
  profiles: Array<{ componentCount: number; suffixComponentCount: number; isRange: boolean }>;
  sourceIds: string[];
  expected: CitationResult;
}

interface CitationCorpus {
  schemaVersion: string;
  vectors: CitationVector[];
}

interface PyResultRow extends CitationResult {
  id: string;
}

interface PyResultFile {
  schemaVersion: string;
  results: PyResultRow[];
}

function loadCorpus(): CitationCorpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-citation-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as CitationCorpus;
}

function runPythonReference(corpusPath: string): PyResultFile {
  const tempDir = mkdtempSync(join(tmpdir(), 'modal-codec-citation-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_codec_citation_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal codec citation runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function evaluateTs(vector: CitationVector): CitationResult {
  return {
    canonical: canonicalUscCitation(vector.title, vector.section),
    coordinate: titleSectionCoordinate(vector.title, vector.section),
    delimiterTokens: citationSectionDelimiterTokens(vector.delimiterSection),
    delimiterKinds: vector.delimiterKinds.map(citationSectionDelimiterKind),
    signatures: vector.signatures.map(item => citationSectionComponentSignature(item)),
    profiles: vector.profiles.map(item => citationSectionComponentProfile(item)),
    sourceIdCitations: vector.sourceIds.map(sourceIdInferredCitation),
    inferredCitations: inferredCitationsFromSourceIds(vector.sourceIds),
  };
}

describe('PORT-246 modal codec citation helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-citation-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for citation normalization and section helper slices', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(3);

    const pyResults = runPythonReference(corpusPath);
    const pyById = new Map(pyResults.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const ts = evaluateTs(vector);
      expect(ts).toEqual(vector.expected);

      const py = pyById.get(vector.id);
      expect(py).toBeDefined();
      expect(ts).toEqual({
        canonical: py?.canonical,
        coordinate: py?.coordinate,
        delimiterTokens: py?.delimiterTokens,
        delimiterKinds: py?.delimiterKinds,
        signatures: py?.signatures,
        profiles: py?.profiles,
        sourceIdCitations: py?.sourceIdCitations,
        inferredCitations: py?.inferredCitations,
      });
    }
  });
});
