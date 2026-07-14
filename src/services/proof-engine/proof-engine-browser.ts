/**
 * Browser proof execution facade.
 *
 * This entrypoint deliberately does not re-export the legacy synchronous
 * ProofEngine: that implementation selects simulated provers. Browser callers
 * receive only the audited TypeScript/WASM runtime and explicit worker
 * transport below.
 */

import {
  DEFAULT_BROWSER_PROOF_MAX_VARIABLES,
  DEFAULT_BROWSER_PROVER_BACKEND,
  generateBrowserTheoremProof,
  probeBrowserProverBackend,
  verifyBrowserTheoremProof,
  type BrowserProofExecutionError,
  type BrowserProofGenerationResult,
  type BrowserProofRequest,
  type BrowserProofVerificationResult,
  type BrowserProverAvailability,
  type BrowserProverBackendId,
} from '../provers/provers-browser.js';

export {
  BROWSER_THEOREM_PROOF_SCHEMA,
  DEFAULT_BROWSER_PROOF_MAX_VARIABLES,
  DEFAULT_BROWSER_PROVER_BACKEND,
  generateBrowserTheoremProof,
  probeBrowserProverBackend,
  verifyBrowserTheoremProof,
} from '../provers/provers-browser.js';

export type {
  BrowserProofExecutionError,
  BrowserProofGenerationResult,
  BrowserProofInvalidInput,
  BrowserProofProved,
  BrowserProofRefuted,
  BrowserProofRequest,
  BrowserProofVerificationInvalid,
  BrowserProofVerificationMalformed,
  BrowserProofVerificationResult,
  BrowserProofVerificationValid,
  BrowserProverAvailability,
  BrowserProverBackendId,
  BrowserProverReady,
  BrowserProverUnavailable,
  BrowserTheoremProofArtifact,
  BrowserTruthTableProofArtifact,
  BrowserTruthTableRow,
} from '../provers/provers-browser.js';

export interface BrowserProofWorkerLike {
  postMessage(message: BrowserProofWorkerRequestMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  terminate?(): void;
}

export interface BrowserProofWorkerRequestMessage {
  readonly type: 'swissknife:browser-proof:generate';
  readonly requestId: string;
  readonly request: Omit<BrowserProofRequest, 'signal'>;
}

export interface BrowserProofWorkerResultMessage {
  readonly type: 'swissknife:browser-proof:result';
  readonly requestId: string;
  readonly result: BrowserProofGenerationResult;
}

export interface BrowserProofWorkerOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Terminate an owned one-shot worker after this request settles. */
  readonly terminateAfterRequest?: boolean;
}

export interface BrowserProofEngineOptions {
  readonly backend?: BrowserProverBackendId;
  readonly maxVariables?: number;
  /** Optional real Worker transport. Local TypeScript execution is the default. */
  readonly worker?: BrowserProofWorkerLike;
  readonly workerTimeoutMs?: number;
}

let workerRequestSequence = 0;

export class BrowserProofEngine {
  readonly backend: BrowserProverBackendId;
  readonly maxVariables: number;
  private readonly worker?: BrowserProofWorkerLike;
  private readonly workerTimeoutMs: number;

  constructor(options: BrowserProofEngineOptions = {}) {
    this.backend = options.backend ?? DEFAULT_BROWSER_PROVER_BACKEND;
    this.maxVariables = options.maxVariables ?? DEFAULT_BROWSER_PROOF_MAX_VARIABLES;
    this.worker = options.worker;
    this.workerTimeoutMs = options.workerTimeoutMs ?? 30_000;
  }

  availability(): Promise<BrowserProverAvailability> {
    return probeBrowserProverBackend(this.backend);
  }

  generate(request: string | Omit<BrowserProofRequest, 'backend' | 'maxVariables'>): Promise<BrowserProofGenerationResult> {
    const normalized: BrowserProofRequest = typeof request === 'string'
      ? { formula: request, backend: this.backend, maxVariables: this.maxVariables }
      : { ...request, backend: this.backend, maxVariables: this.maxVariables };
    if (!this.worker) return generateBrowserTheoremProof(normalized);
    return runBrowserProofInWorker(this.worker, normalized, {
      timeoutMs: this.workerTimeoutMs,
      signal: normalized.signal,
    });
  }

  verify(artifact: unknown): Promise<BrowserProofVerificationResult> {
    return verifyBrowserTheoremProof(artifact);
  }
}

export function createBrowserProofEngine(options: BrowserProofEngineOptions = {}): BrowserProofEngine {
  return new BrowserProofEngine(options);
}

/**
 * Execute through a Worker and authenticate any returned success by verifying
 * its proof artifact on the caller side. A worker cannot manufacture a mock
 * success result merely by posting `{ kind: "proved" }`.
 */
export function runBrowserProofInWorker(
  worker: BrowserProofWorkerLike,
  request: BrowserProofRequest,
  options: BrowserProofWorkerOptions = {},
): Promise<BrowserProofGenerationResult> {
  const backend = request.backend ?? DEFAULT_BROWSER_PROVER_BACKEND;
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.resolve(workerError('BROWSER_PROOF_WORKER_PROTOCOL_ERROR', backend, 'worker timeoutMs must be positive'));
  }
  const signal = options.signal ?? request.signal;
  if (request.signal) {
    // AbortSignal cannot be structured-cloned consistently, so it stays on the caller.
    request = { ...request, signal: undefined };
  }
  if (signal?.aborted) return Promise.resolve(workerAborted(backend));

  const requestId = `proof-${Date.now().toString(36)}-${(++workerRequestSequence).toString(36)}`;
  const message: BrowserProofWorkerRequestMessage = {
    type: 'swissknife:browser-proof:generate',
    requestId,
    request: { formula: request.formula, backend: request.backend, maxVariables: request.maxVariables },
  };

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: BrowserProofGenerationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onFailure);
      worker.removeEventListener('messageerror', onMessageError);
      signal?.removeEventListener('abort', onAbort);
      if (options.terminateAfterRequest) worker.terminate?.();
      resolve(result);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      const response = event.data;
      if (!isWorkerResultMessage(response) || response.requestId !== requestId) return;
      if (!isGenerationResult(response.result)) {
        finish(workerError('BROWSER_PROOF_WORKER_PROTOCOL_ERROR', backend, 'worker returned a malformed proof result'));
        return;
      }
      if (response.result.kind !== 'proved') {
        finish(response.result);
        return;
      }
      void verifyBrowserTheoremProof(response.result.artifact).then(verification => {
        if (verification.kind !== 'valid') {
          finish(workerError('BROWSER_PROOF_WORKER_PROTOCOL_ERROR', backend, 'worker proof artifact failed caller-side verification'));
          return;
        }
        finish(response.result);
      }, error => finish(workerError('BROWSER_PROOF_WORKER_FAILED', backend, errorMessage(error))));
    };
    const onFailure = (event: Event) => {
      const message = typeof (event as Event & { message?: unknown }).message === 'string'
        ? (event as Event & { message: string }).message
        : '';
      finish(workerError('BROWSER_PROOF_WORKER_FAILED', backend, `proof worker failed${message ? `: ${message}` : ''}`));
    };
    const onMessageError = () => finish(workerError('BROWSER_PROOF_WORKER_PROTOCOL_ERROR', backend, 'proof worker response could not be deserialized'));
    const onAbort = () => finish(workerAborted(backend));
    const timer = setTimeout(
      () => finish(workerError('BROWSER_PROOF_WORKER_TIMEOUT', backend, `proof worker exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onFailure);
    worker.addEventListener('messageerror', onMessageError);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      worker.postMessage(message);
    } catch (error) {
      finish(workerError('BROWSER_PROOF_WORKER_FAILED', backend, errorMessage(error)));
    }
  });
}

/** Install this as a Worker's message handler to execute the genuine runtime. */
export async function handleBrowserProofWorkerMessage(
  event: MessageEvent<unknown>,
  postResult: (message: BrowserProofWorkerResultMessage) => void,
): Promise<boolean> {
  if (!isWorkerRequestMessage(event.data)) return false;
  const result = await generateBrowserTheoremProof(event.data.request);
  postResult({ type: 'swissknife:browser-proof:result', requestId: event.data.requestId, result });
  return true;
}

function isWorkerRequestMessage(value: unknown): value is BrowserProofWorkerRequestMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.type !== 'swissknife:browser-proof:generate' || typeof v.requestId !== 'string') return false;
  if (!v.request || typeof v.request !== 'object') return false;
  const request = v.request as Record<string, unknown>;
  return typeof request.formula === 'string'
    && (request.backend === undefined || typeof request.backend === 'string')
    && (request.maxVariables === undefined || typeof request.maxVariables === 'number');
}

function isWorkerResultMessage(value: unknown): value is BrowserProofWorkerResultMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.type === 'swissknife:browser-proof:result' && typeof v.requestId === 'string' && 'result' in v;
}

function isGenerationResult(value: unknown): value is BrowserProofGenerationResult {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as Record<string, unknown>).kind;
  return kind === 'proved' || kind === 'refuted' || kind === 'invalid_input'
    || kind === 'unavailable' || kind === 'execution_error';
}

function workerError(
  code: BrowserProofExecutionError['code'],
  backend: BrowserProverBackendId,
  message: string,
): BrowserProofExecutionError {
  return { kind: 'execution_error', code, backend, message };
}

function workerAborted(backend: BrowserProverBackendId): BrowserProofExecutionError {
  return workerError('BROWSER_PROOF_ABORTED', backend, 'proof worker request was aborted');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
