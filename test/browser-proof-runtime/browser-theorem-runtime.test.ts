import { describe, expect, it } from 'vitest';
import theoremFixtures from './fixtures/theorem-cases.json';
import {
  BROWSER_THEOREM_PROOF_SCHEMA,
  DEFAULT_BROWSER_PROVER_BACKEND,
  generateBrowserTheoremProof,
  probeBrowserProverBackend,
  verifyBrowserTheoremProof,
  type BrowserProverBackendId,
  type BrowserTruthTableProofArtifact,
} from '../../src/services/provers/provers-browser.js';
import {
  createBrowserProofEngine,
  handleBrowserProofWorkerMessage,
  runBrowserProofInWorker,
  type BrowserProofWorkerLike,
  type BrowserProofWorkerRequestMessage,
  type BrowserProofWorkerResultMessage,
} from '../../src/services/proof-engine/proof-engine-browser.js';
import {
  BROWSER_SCHNORR_BACKEND_ID,
  DEFAULT_BROWSER_ZKP_BACKEND_ID,
  BrowserSchnorrZkpBackend,
  createDefaultBrowserZkpBackend,
  generateDefaultBrowserZkpProof,
  instantiateSchnorrWasmHelper,
  verifyDefaultBrowserZkpProof,
} from '../../src/services/zkp/browser-zkp.js';

const unavailableBrowserBackends: BrowserProverBackendId[] = [
  'cvc5-wasm',
  'coq-jscoq',
  'lean4-wasm',
  'lurk-wasm',
  'dcec-native',
  'tdfol-native',
  'neural',
];

describe('TypeScript theorem proof artifacts', () => {
  it('preflights the real default backend', async () => {
    expect(DEFAULT_BROWSER_PROVER_BACKEND).toBe('typescript-truth-table');
    await expect(probeBrowserProverBackend(DEFAULT_BROWSER_PROVER_BACKEND)).resolves.toEqual({
      kind: 'ready',
      backend: 'typescript-truth-table',
      execution: 'typescript',
      canGenerate: true,
      canVerify: true,
    });
  });

  it('generates and independently verifies a complete truth-table fixture', async () => {
    const generated = await generateBrowserTheoremProof({ formula: theoremFixtures.valid.formula });
    expect(generated.kind).toBe('proved');
    if (generated.kind !== 'proved') throw new Error(`fixture was not proved: ${generated.kind}`);

    expect(generated.artifact).toMatchObject({
      schemaVersion: BROWSER_THEOREM_PROOF_SCHEMA,
      backend: 'typescript-truth-table',
      execution: 'typescript',
      formula: theoremFixtures.valid.formula,
      variables: ['p', 'q'],
    });
    const artifact = generated.artifact as BrowserTruthTableProofArtifact;
    expect(artifact.evaluations).toHaveLength(4);
    expect(artifact.evaluations.map(row => row.assignment)).toEqual(['00', '01', '10', '11']);
    expect(artifact.evaluations.every(row => row.value)).toBe(true);
    expect(artifact.artifactDigest).toMatch(/^[0-9a-f]{64}$/);

    await expect(verifyBrowserTheoremProof(artifact)).resolves.toEqual({
      kind: 'valid',
      valid: true,
      backend: 'typescript-truth-table',
      artifactDigest: artifact.artifactDigest,
    });
  });

  it('returns a genuine counterexample for a refuted fixture', async () => {
    const generated = await generateBrowserTheoremProof({ formula: theoremFixtures.refuted.formula });
    expect(generated).toMatchObject({
      kind: 'refuted',
      backend: 'typescript-truth-table',
      counterexample: { p: false, q: true },
    });
    expect(generated).not.toHaveProperty('artifact');
  });

  it('detects artifact tampering instead of trusting a proof-shaped object', async () => {
    const generated = await generateBrowserTheoremProof({ formula: theoremFixtures.valid.formula });
    if (generated.kind !== 'proved' || generated.artifact.backend !== 'typescript-truth-table') {
      throw new Error('expected a TypeScript truth-table artifact');
    }
    const artifact = generated.artifact;

    await expect(verifyBrowserTheoremProof({
      ...artifact,
      evaluations: artifact.evaluations.map((row, index) => index === 0 ? { ...row, value: false } : row),
    })).resolves.toMatchObject({ kind: 'invalid', valid: false, code: 'BROWSER_PROOF_INVALID' });
    await expect(verifyBrowserTheoremProof({
      ...artifact,
      artifactDigest: '0'.repeat(64),
    })).resolves.toMatchObject({ kind: 'invalid', valid: false, code: 'BROWSER_PROOF_INVALID' });
    await expect(verifyBrowserTheoremProof({
      ...artifact,
      formula: theoremFixtures.refuted.formula,
    })).resolves.toMatchObject({ kind: 'invalid', valid: false, code: 'BROWSER_PROOF_INVALID' });
  });

  it('returns typed outcomes for malformed requests and proof envelopes', async () => {
    await expect(generateBrowserTheoremProof({
      formula: theoremFixtures.malformed.formula,
    })).resolves.toMatchObject({ kind: 'invalid_input', code: 'BROWSER_PROOF_INVALID_INPUT' });
    await expect(generateBrowserTheoremProof({
      formula: 'a && b && c',
      maxVariables: 2,
    })).resolves.toMatchObject({ kind: 'invalid_input', code: 'BROWSER_PROOF_INVALID_INPUT' });
    await expect(verifyBrowserTheoremProof(null)).resolves.toMatchObject({
      kind: 'malformed', valid: false, code: 'BROWSER_PROOF_MALFORMED',
    });
    await expect(verifyBrowserTheoremProof({ kind: 'proved' })).resolves.toMatchObject({
      kind: 'malformed', valid: false, code: 'BROWSER_PROOF_MALFORMED',
    });
  });

  it.each(unavailableBrowserBackends)('%s is typed unavailable before generation', async backend => {
    await expect(probeBrowserProverBackend(backend)).resolves.toMatchObject({
      kind: 'unavailable',
      code: 'BROWSER_PROVER_BACKEND_UNAVAILABLE',
      backend,
      phase: 'preflight',
    });
    const result = await generateBrowserTheoremProof({
      backend,
      formula: theoremFixtures.valid.formula,
    });
    expect(result).toMatchObject({
      kind: 'unavailable',
      code: 'BROWSER_PROVER_BACKEND_UNAVAILABLE',
      backend,
      phase: 'preflight',
    });
    expect(result).not.toHaveProperty('artifact');
  });

  it.each(['simulated', 'python-reference-runner', 'host-native', 'mock-success'])(
    'does not allow JavaScript callers to select forbidden backend %s',
    async backend => {
      const result = await generateBrowserTheoremProof({
        backend: backend as BrowserProverBackendId,
        formula: theoremFixtures.valid.formula,
      });
      expect(result).toMatchObject({
        kind: 'unavailable',
        code: 'BROWSER_PROVER_BACKEND_UNAVAILABLE',
        backend,
        phase: 'preflight',
      });
      expect(result).not.toHaveProperty('artifact');
    },
  );

  it('either runs a real Z3 WASM proof or reports typed preflight unavailability', async () => {
    const availability = await probeBrowserProverBackend('z3-wasm');
    if (availability.kind === 'unavailable') {
      expect(availability).toMatchObject({
        code: 'BROWSER_PROVER_BACKEND_UNAVAILABLE',
        backend: 'z3-wasm',
        phase: 'preflight',
      });
      return;
    }

    const generated = await generateBrowserTheoremProof({
      backend: 'z3-wasm',
      formula: theoremFixtures.valid.formula,
    });
    expect(generated.kind).toBe('proved');
    if (generated.kind !== 'proved') throw new Error(`Z3 did not prove fixture: ${generated.kind}`);
    await expect(verifyBrowserTheoremProof(generated.artifact)).resolves.toMatchObject({
      kind: 'valid', valid: true, backend: 'z3-wasm',
    });
  }, 30_000);
});

describe('browser proof-engine facade and worker failure boundary', () => {
  it('uses the real local engine and verifies its own artifact', async () => {
    const engine = createBrowserProofEngine();
    await expect(engine.availability()).resolves.toMatchObject({ kind: 'ready', execution: 'typescript' });
    const generated = await engine.generate(theoremFixtures.valid.formula);
    expect(generated.kind).toBe('proved');
    if (generated.kind !== 'proved') throw new Error('proof engine did not generate the fixture proof');
    await expect(engine.verify(generated.artifact)).resolves.toMatchObject({ kind: 'valid', valid: true });
  });

  it('executes a genuine proof inside the worker message handler', async () => {
    const messages: BrowserProofWorkerResultMessage[] = [];
    const handled = await handleBrowserProofWorkerMessage(new MessageEvent('message', {
      data: {
        type: 'swissknife:browser-proof:generate',
        requestId: 'fixture-request',
        request: { formula: theoremFixtures.valid.formula },
      } satisfies BrowserProofWorkerRequestMessage,
    }), message => messages.push(message));

    expect(handled).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: 'swissknife:browser-proof:result',
      requestId: 'fixture-request',
      result: { kind: 'proved', backend: 'typescript-truth-table' },
    });
    const result = messages[0]!.result;
    if (result.kind !== 'proved') throw new Error('worker handler did not produce a proof artifact');
    await expect(verifyBrowserTheoremProof(result.artifact)).resolves.toMatchObject({ kind: 'valid', valid: true });
  });

  it('returns a typed execution failure when a Worker crashes', async () => {
    const worker = new FailureWorker((self) => queueMicrotask(() => self.emit('error', new ErrorEvent('error', {
      message: 'WASM worker crashed',
    }))));

    await expect(runBrowserProofInWorker(worker, {
      formula: theoremFixtures.valid.formula,
    })).resolves.toMatchObject({
      kind: 'execution_error',
      code: 'BROWSER_PROOF_WORKER_FAILED',
      backend: 'typescript-truth-table',
      message: expect.stringContaining('WASM worker crashed'),
    });
  });

  it('rejects a worker mock-success response whose artifact cannot be verified', async () => {
    const worker = new FailureWorker((self, request) => queueMicrotask(() => self.emit('message', new MessageEvent('message', {
      data: {
        type: 'swissknife:browser-proof:result',
        requestId: request.requestId,
        result: {
          kind: 'proved',
          backend: 'typescript-truth-table',
          artifact: { mock: true },
          elapsedMs: 0,
        },
      },
    }))));

    await expect(runBrowserProofInWorker(worker, {
      formula: theoremFixtures.valid.formula,
    })).resolves.toMatchObject({
      kind: 'execution_error',
      code: 'BROWSER_PROOF_WORKER_PROTOCOL_ERROR',
      message: expect.stringContaining('failed caller-side verification'),
    });
  });

  it('returns typed timeout, message deserialization, and postMessage failures', async () => {
    const timeoutWorker = new FailureWorker(() => undefined);
    await expect(runBrowserProofInWorker(timeoutWorker, {
      formula: theoremFixtures.valid.formula,
    }, { timeoutMs: 5 })).resolves.toMatchObject({
      kind: 'execution_error', code: 'BROWSER_PROOF_WORKER_TIMEOUT',
    });

    const messageErrorWorker = new FailureWorker(self => queueMicrotask(() => self.emit('messageerror', new Event('messageerror'))));
    await expect(runBrowserProofInWorker(messageErrorWorker, {
      formula: theoremFixtures.valid.formula,
    })).resolves.toMatchObject({
      kind: 'execution_error', code: 'BROWSER_PROOF_WORKER_PROTOCOL_ERROR',
    });

    const throwingWorker = new FailureWorker(() => { throw new DOMException('worker is terminated', 'InvalidStateError'); });
    await expect(runBrowserProofInWorker(throwingWorker, {
      formula: theoremFixtures.valid.formula,
    })).resolves.toMatchObject({
      kind: 'execution_error', code: 'BROWSER_PROOF_WORKER_FAILED',
      message: expect.stringContaining('worker is terminated'),
    });
  });
});

describe('browser WASM ZKP backend', () => {
  const witness = JSON.stringify(theoremFixtures.zkp.validWitness);

  it('selects the audited browser-WASM backend by default and instantiates its WebAssembly module', async () => {
    expect(DEFAULT_BROWSER_ZKP_BACKEND_ID).toBe(BROWSER_SCHNORR_BACKEND_ID);
    const selected = createDefaultBrowserZkpBackend();
    expect(selected).toBeInstanceOf(BrowserSchnorrZkpBackend);

    // This is deliberately not a mocked WebAssembly API: the helper is the
    // committed WASM binary used by the production browser backend.
    const wasm = await instantiateSchnorrWasmHelper();
    expect(wasm.add_mod(0x7fff_fffe, 3, 0x7fff_ffff)).toBe(2);
    // This vector distinguishes true modular addition from a wrapped i32
    // addition followed by a remainder operation.
    expect(wasm.add_mod(0xffff_ffff, 0xffff_ffff, 10)).toBe(0);
  });

  it('generates, verifies, and records deterministic public inputs using the real WASM-backed ZKP backend', async () => {
    const backend = new BrowserSchnorrZkpBackend();
    const first = await backend.generateProof(witness, theoremFixtures.zkp.seed);
    const second = await backend.generateProof(witness, theoremFixtures.zkp.seed);

    // Deterministic input normalization and seeded Fiat-Shamir nonce produce
    // stable proof bytes. This makes the release evidence independently
    // reproducible without making an unseeded production call deterministic.
    expect(first.proofData).toEqual(second.proofData);
    expect(first.publicInputs).toEqual(second.publicInputs);
    expect(first.publicInputs).toMatchObject(theoremFixtures.zkp.expectedPublicInputs);
    expect(first.metadata).toMatchObject({
      backend: BROWSER_SCHNORR_BACKEND_ID,
      verifier_id: 'browser-schnorr-zkp-v0.1',
      proof_system: 'schnorr-fiat-shamir',
      wasm_artifact: expect.stringContaining('schnorr-field.wasm'),
      wasm_artifact_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(first.payload()).toMatchObject({
      backend: BROWSER_SCHNORR_BACKEND_ID,
      proofSystem: 'schnorr-fiat-shamir',
      statement: theoremFixtures.zkp.validWitness.statement,
      publicInputs: theoremFixtures.zkp.expectedPublicInputs,
    });

    await expect(backend.verifyProof(JSON.stringify(first.toDict()))).resolves.toBe(true);
    await expect(verifyDefaultBrowserZkpProof(JSON.stringify(first.toDict()))).resolves.toBe(true);
    expect(backend.getStats()).toMatchObject({ proofsGenerated: 2, proofsVerified: 1, failures: 0, wasmLoads: 1 });
  });

  it('rejects tampered, malformed, and fabricated ZKP proof envelopes', async () => {
    const backend = new BrowserSchnorrZkpBackend();
    const proof = await backend.generateProof(witness, theoremFixtures.zkp.seed);
    const payload = proof.payload();

    await expect(backend.verifyProof(JSON.stringify({
      ...payload,
      statement: 'O(write)',
    }))).resolves.toBe(false);
    await expect(backend.verifyProof(JSON.stringify({
      ...payload,
      response: '1',
    }))).resolves.toBe(false);
    await expect(backend.verifyProof('{not valid JSON')).resolves.toBe(false);
    await expect(backend.verifyProof(JSON.stringify({
      schema: 'browser-schnorr-zkp-v1', backend: 'fabricated-proof-result',
    }))).resolves.toBe(false);
    await expect(backend.generateProof('{not valid JSON', theoremFixtures.zkp.seed)).rejects.toThrow();
  });

  it('does not permit browser defaults to select simulated, Python, host-native, or fabricated ZKP backends', () => {
    for (const backend of [
      'simulated',
      'python-reference-runner',
      'host-native',
      'mock-success',
      'fabricated-proof-result',
    ]) {
      expect(() => createDefaultBrowserZkpBackend({ backend })).toThrow(/browser production ZKP backend/i);
    }
  });

  it('runs the public default generation path rather than an injected or fabricated result', async () => {
    const proof = await generateDefaultBrowserZkpProof(witness, { seed: theoremFixtures.zkp.seed });
    expect(proof.metadata).toMatchObject({ backend: BROWSER_SCHNORR_BACKEND_ID });
    await expect(verifyDefaultBrowserZkpProof(JSON.stringify(proof.toDict()))).resolves.toBe(true);
  });
});

type WorkerListener = (event: any) => void;

class FailureWorker implements BrowserProofWorkerLike {
  private readonly listeners = new Map<string, Set<WorkerListener>>();

  constructor(
    private readonly onPost: (self: FailureWorker, request: BrowserProofWorkerRequestMessage) => void,
  ) {}

  postMessage(message: BrowserProofWorkerRequestMessage): void {
    this.onPost(this, message);
  }

  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: WorkerListener): void {
    const listeners = this.listeners.get(type) ?? new Set<WorkerListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  removeEventListener(type: 'message' | 'error' | 'messageerror', listener: WorkerListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: 'message' | 'error' | 'messageerror', event: Event | MessageEvent<unknown>): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}
