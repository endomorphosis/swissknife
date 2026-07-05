import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  decompilerCanonicalUscCitation,
  decompilerCitationSectionComponentProfile,
  decompilerCitationSectionComponentSignature,
  decompilerCitationSectionDelimiterKind,
  decompilerCitationSectionDelimiterTokens,
  decompilerInferredCitationsFromSourceIds,
  decompilerSourceIdInferredCitation,
  decompilerTitleSectionCoordinate,
} from '../../src/services/modal-ir-decompiler';

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
  const tempDir = mkdtempSync(join(tmpdir(), 'modal-decompiler-citation-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_decompiler_citation_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal decompiler citation runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function evaluateTs(vector: CitationVector): CitationResult {
  return {
    canonical: decompilerCanonicalUscCitation(vector.title, vector.section),
    coordinate: decompilerTitleSectionCoordinate(vector.title, vector.section),
    delimiterTokens: decompilerCitationSectionDelimiterTokens(vector.delimiterSection),
    delimiterKinds: vector.delimiterKinds.map(decompilerCitationSectionDelimiterKind),
    signatures: vector.signatures.map(item => decompilerCitationSectionComponentSignature(item)),
    profiles: vector.profiles.map(item => decompilerCitationSectionComponentProfile(item)),
    sourceIdCitations: vector.sourceIds.map(decompilerSourceIdInferredCitation),
    inferredCitations: decompilerInferredCitationsFromSourceIds(vector.sourceIds),
  };
}

describe('PORT-247 modal decompiler citation helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-citation-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for citation normalization and source-id helper slices', () => {
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
