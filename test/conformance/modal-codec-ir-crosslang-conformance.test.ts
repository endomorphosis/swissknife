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
  decodeModalIrText,
  targetFamilyDistributionForModalIr,
  targetFamilyForModalIr,
  type ModalIRDocument,
} from '../../src/services/logic/modal/modal-logic-codec';

interface ModalCodecVector {
  id: string;
  description?: string;
  modalIr: ModalIRDocument;
  expected: {
    decodedText: string;
    targetFamily: string;
    targetFamilyDistribution: Record<string, number>;
  };
}

interface ModalCodecCorpus {
  schemaVersion: string;
  vectors: ModalCodecVector[];
}

interface PyResultRow {
  id: string;
  decodedText: string;
  targetFamily: string;
  targetFamilyDistribution: Record<string, number>;
}

interface PyResultFile {
  schemaVersion: string;
  results: PyResultRow[];
}

function loadCorpus(): ModalCodecCorpus {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-ir-vectors.json');
  return JSON.parse(nodeFs.readFileSync(corpusPath, 'utf8')) as ModalCodecCorpus;
}

function runPythonReference(corpusPath: string): PyResultFile {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'modal-codec-ir-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_codec_ir_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], { encoding: 'utf8' });
    if (proc.status !== 0) {
      throw new Error(`Python modal codec IR runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-246 modal codec IR helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-ir-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for decode text + family distribution', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(3);

    const pyResults = runPythonReference(corpusPath);
    const pyById = new Map(pyResults.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const tsDecodedText = decodeModalIrText(vector.modalIr);
      const tsTargetFamily = targetFamilyForModalIr(vector.modalIr);
      const tsFamilyDistribution = targetFamilyDistributionForModalIr(vector.modalIr);

      expect(tsDecodedText).toBe(vector.expected.decodedText);
      expect(tsTargetFamily).toBe(vector.expected.targetFamily);
      expect(tsFamilyDistribution).toEqual(vector.expected.targetFamilyDistribution);

      const pyRow = pyById.get(vector.id);
      expect(pyRow).toBeDefined();
      expect(tsDecodedText).toBe(pyRow?.decodedText);
      expect(tsTargetFamily).toBe(pyRow?.targetFamily);
      expect(tsFamilyDistribution).toEqual(pyRow?.targetFamilyDistribution);
    }
  });
});
