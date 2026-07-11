import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  extractNormativeElements,
  migrateParserElement,
} from '../../src/services/logic/deontic/deontic-legal-text-engine.js';

interface ExpectedFirst {
  norm_type: string;
  deontic_operator: string;
  subject: string;
  action: string;
  conditions: string[];
  temporal_constraints: string[];
  exceptions: string[];
  cross_references: string[];
  parser_warnings: string[];
  formal_terms: Record<string, string>;
}

interface Vector {
  id: string;
  text: string;
  expected: {
    count: number;
    first: ExpectedFirst;
  };
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyResult {
  id: string;
  count: number;
  first: ExpectedFirst | null;
}

interface PyResults {
  schemaVersion: string;
  results: PyResult[];
}

function clean(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeSubject(subject: string): string {
  return clean(subject).toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[.;:,]+$/g, '');
}

function normalizeAction(action: string): string {
  return clean(action).toLowerCase().replace(/[.;:,]+$/g, '');
}

function firstField(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const cleaned = clean(String(item ?? ''));
      if (cleaned) return cleaned;
    }
    return '';
  }
  return clean(String(value ?? ''));
}

function normalizeValues(values: unknown): string[] {
  const rawValues = Array.isArray(values) ? values : [];
  const normalized: string[] = [];
  for (const item of rawValues) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const itemType = clean(String(record.type ?? '')).toLowerCase();
      const itemValue = clean(String(record.value ?? '')).toLowerCase();
      if (itemType && itemValue) {
        normalized.push(`${itemType}:${itemValue}`);
        continue;
      }
      const textValue = clean(String(record.normalized_text ?? record.raw_text ?? '')).toLowerCase();
      if (textValue) normalized.push(textValue);
      continue;
    }
    const textValue = clean(String(item ?? '')).toLowerCase();
    if (textValue) normalized.push(textValue);
  }
  return normalized;
}

function selectedFormalTerms(element: Record<string, unknown>): Record<string, string> {
  const formalTerms = (element.formal_terms && typeof element.formal_terms === 'object' && !Array.isArray(element.formal_terms))
    ? element.formal_terms as Record<string, unknown>
    : {};
  const keys = [
    'actor_id',
    'actor_predicate',
    'action_predicate',
    'object_predicate',
    'recipient_id',
    'norm_predicate',
    'category_predicate',
    'defined_term_id',
  ];
  return Object.fromEntries(keys.map(key => [key, String(formalTerms[key] ?? '')]));
}

function normalizeElement(element: Record<string, unknown>): ExpectedFirst {
  const migrated = migrateParserElement(element);
  return {
    norm_type: String(migrated.norm_type ?? ''),
    deontic_operator: String(migrated.deontic_operator ?? ''),
    subject: normalizeSubject(firstField(migrated.subject)),
    action: normalizeAction(firstField(migrated.action ?? migrated.proposition)),
    conditions: normalizeValues(migrated.conditions),
    temporal_constraints: normalizeValues(migrated.temporal_constraint_details ?? migrated.temporal_constraints),
    exceptions: normalizeValues(migrated.exceptions),
    cross_references: normalizeValues(migrated.cross_reference_details ?? migrated.cross_references),
    parser_warnings: normalizeValues(migrated.parser_warnings).sort(),
    formal_terms: selectedFormalTerms(migrated),
  };
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-parser-elements-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'deontic-elements-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_parser_elements_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], { encoding: 'utf8' });
    if (proc.status !== 0) {
      throw new Error(`Python deontic parser elements runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-248 deontic parser normalized element parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-parser-elements-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python normalized AST fields for deterministic norms', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(7);

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const tsElements = extractNormativeElements(vector.text);
      const tsFirst = tsElements[0] ? normalizeElement(tsElements[0]) : null;

      expect(tsElements.length).toBe(vector.expected.count);
      expect(tsFirst).toEqual(vector.expected.first);

      const pyRow = pyById.get(vector.id);
      expect(pyRow).toBeDefined();
      expect(tsElements.length).toBe(pyRow?.count);
      expect(tsFirst).toEqual(pyRow?.first ?? null);
    }
  });
});
