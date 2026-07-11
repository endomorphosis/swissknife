import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  ErgoAIWrapper,
  type ErgoAIConfig,
  type ErgoAIProcessRunner,
} from '../../src/services/integrations/flogic-ergoai-wrapper.js';

interface ErgoCorpusVector {
  id: string;
  description?: string;
  query: string;
  config: ErgoAIConfig;
  runner: {
    mode: 'unused' | 'always-success' | 'retry-then-success' | 'always-fail';
    stdout?: string;
    stderr?: string;
  };
  expected: {
    success: boolean;
    result?: string;
    bindings?: Array<Record<string, string>>;
    errorIncludes?: string;
    attempts: number;
  };
}

interface ErgoCorpusFile {
  schemaVersion: string;
  vectors: ErgoCorpusVector[];
}

function loadErgoCorpus(): ErgoCorpusFile {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/ergoai-vectors.json');
  return JSON.parse(readFileSync(corpusPath, 'utf8')) as ErgoCorpusFile;
}

function makeFakeBinaryPath(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'ergoai-conformance-'));
  const binaryPath = join(dir, 'ergo');
  writeFileSync(binaryPath, '#!/bin/sh\nexit 0\n', 'utf8');
  return {
    path: binaryPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function runnerForVector(vector: ErgoCorpusVector, calls: { count: number }): ErgoAIProcessRunner {
  return () => {
    calls.count += 1;
    switch (vector.runner.mode) {
      case 'always-success':
        return { status: 0, stdout: vector.runner.stdout ?? 'proved', stderr: '' };
      case 'retry-then-success':
        if (calls.count === 1) {
          return { status: 1, stdout: '', stderr: vector.runner.stderr ?? 'temporary failure' };
        }
        return { status: 0, stdout: vector.runner.stdout ?? 'proved-after-retry', stderr: '' };
      case 'always-fail':
        return { status: 1, stdout: '', stderr: vector.runner.stderr ?? 'hard failure' };
      case 'unused':
      default:
        throw new Error('Runner should not be called for this vector');
    }
  };
}

describe('PORT-254 ErgoAI subprocess parity corpus', () => {
  const corpus = loadErgoCorpus();

  it('has a valid corpus schema and required vectors', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(11);
    expect(new Set(corpus.vectors.map(vector => vector.id)).size).toBe(corpus.vectors.length);
  });

  it('matches expected corpus behaviors across transport and output semantics', async () => {
    const cleanups: Array<() => void> = [];
    try {
      for (const vector of corpus.vectors) {
        const calls = { count: 0 };

        let config: ErgoAIConfig = { ...vector.config };
        let runner: ErgoAIProcessRunner;

        if (vector.config.binaryPath === '__FAKE_BINARY__') {
          const fakeBinary = makeFakeBinaryPath();
          cleanups.push(fakeBinary.cleanup);
          config = { ...vector.config, binaryPath: fakeBinary.path };
          runner = runnerForVector(vector, calls);
        } else {
          runner = runnerForVector(vector, calls);
        }

        const wrapper = new ErgoAIWrapper(config, runner);
        const result = await wrapper.query(vector.query);

        expect(result.success).toBe(vector.expected.success);
        expect(calls.count).toBe(vector.expected.attempts);
        if (vector.expected.result !== undefined) {
          expect(result.result).toBe(vector.expected.result);
        }
        if (vector.expected.bindings !== undefined) {
          expect(result.bindings).toEqual(vector.expected.bindings);
        }
        if (vector.expected.errorIncludes !== undefined) {
          expect(result.error ?? '').toContain(vector.expected.errorIncludes);
        }
      }
    } finally {
      cleanups.forEach(cleanup => cleanup());
    }
  });
});
