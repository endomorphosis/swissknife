/**
 * ErgoAI wrapper availability helpers.
 *
 * TypeScript compatibility surface for flogic/ergoai_wrapper.py.
 */

import * as fs from 'fs';
import { delimiter, join, resolve } from 'node:path';

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as typeof fs | undefined;
const runtimeFs = nodeFs ?? fs;

export interface ResolveErgoBinaryOptions {
  binary?: string | null;
  lazyInstall?: boolean;
  reason?: string;
  env?: Record<string, string | undefined>;
  which?: (command: string) => string | null;
  lazyInstaller?: (reason: string) => string | null;
}

export function resolveErgoBinary(options: ResolveErgoBinaryOptions = {}): string | null {
  if (options.binary) {
    const candidate = resolve(options.binary);
    return ergoBinaryIsConfigured(candidate) ? candidate : null;
  }

  const envBinary = options.env?.ERGOAI_BINARY ?? process.env.ERGOAI_BINARY;
  if (envBinary && ergoBinaryIsConfigured(envBinary)) return resolve(envBinary);

  const which = options.which ?? whichSync;
  for (const command of ['ergo', 'ergoai', 'runErgo.sh', 'runergo']) {
    const found = which(command);
    if (found && ergoBinaryIsConfigured(found)) return found;
  }

  if (options.lazyInstall ?? true) {
    return options.lazyInstaller?.(options.reason ?? 'ErgoAIWrapper requested') ?? null;
  }
  return null;
}

export const resolve_ergo_binary = resolveErgoBinary;

function ergoBinaryIsConfigured(path: string): boolean {
  if (!runtimeFs.existsSync(path)) return false;
  try {
    const stat = runtimeFs.statSync(path);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function whichSync(command: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, command);
    if (ergoBinaryIsConfigured(candidate)) return candidate;
  }
  return null;
}
