/**
 * DCEC Error Handling — PORT-176 (Sprint 83)
 *
 * Port of ipfs_datasets_py/logic/CEC/native/error_handling.py.
 *
 * TypeScript-friendly wrappers/decorator equivalents for parser/prover code
 * that should return stable error envelopes instead of throwing raw errors.
 */

import { LogicError } from './logic-errors.js';

export enum DCECErrorCode {
  PARSE_ERROR = 'parse_error',
  VALIDATION_ERROR = 'validation_error',
  PROOF_ERROR = 'proof_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

export interface DCECErrorEnvelope {
  ok: false;
  code: DCECErrorCode;
  message: string;
  operation: string;
  input?: unknown;
  recoverable: boolean;
  timestamp: number;
  stack?: string;
}

export interface DCECSuccessEnvelope<T> {
  ok: true;
  value: T;
  operation: string;
  timestamp: number;
}

export type DCECResult<T> = DCECSuccessEnvelope<T> | DCECErrorEnvelope;

export class DCECHandledError extends LogicError {
  constructor(
    message: string,
    readonly code: DCECErrorCode = DCECErrorCode.UNKNOWN,
    readonly input?: unknown,
    readonly recoverable = true,
  ) {
    super(message, { code, input, recoverable });
    this.name = 'DCECHandledError';
  }
}

export function makeErrorEnvelope(
  err: unknown,
  operation: string,
  input?: unknown,
  code?: DCECErrorCode,
): DCECErrorEnvelope {
  const handled = err instanceof DCECHandledError ? err : null;
  const error = err instanceof Error ? err : new Error(String(err));
  return {
    ok: false,
    code: code ?? handled?.code ?? inferErrorCode(error),
    message: error.message,
    operation,
    input: input ?? handled?.input,
    recoverable: handled?.recoverable ?? true,
    timestamp: Date.now(),
    stack: error.stack,
  };
}

export function makeSuccessEnvelope<T>(value: T, operation: string): DCECSuccessEnvelope<T> {
  return { ok: true, value, operation, timestamp: Date.now() };
}

export function safeDcecCall<T>(
  operation: string,
  fn: () => T,
  input?: unknown,
): DCECResult<T> {
  try {
    return makeSuccessEnvelope(fn(), operation);
  } catch (err) {
    return makeErrorEnvelope(err, operation, input);
  }
}

export async function safeDcecCallAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  input?: unknown,
): Promise<DCECResult<T>> {
  try {
    return makeSuccessEnvelope(await fn(), operation);
  } catch (err) {
    return makeErrorEnvelope(err, operation, input);
  }
}

export function withDcecErrorHandling<Args extends unknown[], T>(
  operation: string,
  fn: (...args: Args) => T,
): (...args: Args) => DCECResult<T> {
  return (...args: Args) => safeDcecCall(operation, () => fn(...args), args);
}

export function withAsyncDcecErrorHandling<Args extends unknown[], T>(
  operation: string,
  fn: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<DCECResult<T>> {
  return (...args: Args) => safeDcecCallAsync(operation, () => fn(...args), args);
}

export function throwValidationError(message: string, input?: unknown): never {
  throw new DCECHandledError(message, DCECErrorCode.VALIDATION_ERROR, input, true);
}

export function throwParseError(message: string, input?: unknown): never {
  throw new DCECHandledError(message, DCECErrorCode.PARSE_ERROR, input, true);
}

function inferErrorCode(error: Error): DCECErrorCode {
  const text = `${error.name} ${error.message}`.toLowerCase();
  if (text.includes('parse')) return DCECErrorCode.PARSE_ERROR;
  if (text.includes('valid')) return DCECErrorCode.VALIDATION_ERROR;
  if (text.includes('proof') || text.includes('prove')) return DCECErrorCode.PROOF_ERROR;
  if (text.includes('timeout') || text.includes('timed out')) return DCECErrorCode.TIMEOUT;
  return DCECErrorCode.UNKNOWN;
}
