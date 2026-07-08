/**
 * Browser-safe runtime helpers shared by service modules.
 */

export function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  const abortSignal = globalThis.AbortSignal as typeof AbortSignal & {
    timeout?: (timeoutMs: number) => AbortSignal;
  } | undefined;
  if (typeof abortSignal?.timeout === 'function') return abortSignal.timeout(timeoutMs);

  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export function readRuntimeEnv(name: string): string | undefined {
  const maybeProcess = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return maybeProcess?.env?.[name];
}
