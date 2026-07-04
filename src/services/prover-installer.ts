/**
 * Host-native prover installer/availability helpers.
 *
 * TypeScript compatibility surface for integration/bridges/prover_installer.py.
 * These helpers probe availability and support injected installers; they do not
 * run package-manager installs unless the caller provides an installer callback.
 */

import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export interface EnsureProverOptions {
  yes?: boolean;
  strict?: boolean;
  allowSudo?: boolean;
  which?: (command: string) => string | null;
  moduleAvailable?: (moduleName: string) => boolean;
  install?: (component: string) => boolean | Promise<boolean>;
}

export function ensureCvc5(options: EnsureProverOptions = {}): boolean | Promise<boolean> {
  return ensureComponent('cvc5', ['cvc5'], 'cvc5', options);
}

export function ensureLean(options: EnsureProverOptions = {}): boolean | Promise<boolean> {
  return ensureComponent('lean', ['lean'], 'lean', options);
}

export function ensureCoq(options: EnsureProverOptions = {}): boolean | Promise<boolean> {
  void options.allowSudo;
  return ensureComponent('coq', ['coqc'], 'coq', options);
}

export function ensureErgoai(options: EnsureProverOptions = {}): boolean | Promise<boolean> {
  return ensureComponent('ergoai', ['ergo', 'ergoai', 'runErgo.sh', 'runergo'], null, options);
}

export function ensureSymbolicai(options: EnsureProverOptions = {}): boolean | Promise<boolean> {
  return ensureComponent('symbolicai', ['symai'], 'symai', options);
}

export const ensure_cvc5 = ensureCvc5;
export const ensure_lean = ensureLean;
export const ensure_coq = ensureCoq;
export const ensure_ergoai = ensureErgoai;
export const ensure_symbolicai = ensureSymbolicai;

function ensureComponent(
  component: string,
  commands: string[],
  moduleName: string | null,
  options: EnsureProverOptions,
): boolean | Promise<boolean> {
  const which = options.which ?? whichSync;
  if (commands.some(command => Boolean(which(command)))) return true;
  if (moduleName && options.moduleAvailable?.(moduleName)) return true;
  if (!options.yes) return false;
  if (!options.install) {
    if (options.strict) throw new Error(`${component} unavailable and no installer callback was provided`);
    return false;
  }
  try {
    const installed = options.install(component);
    if (installed instanceof Promise) {
      return installed.then(ok => ok || commands.some(command => Boolean(which(command))) || Boolean(moduleName && options.moduleAvailable?.(moduleName)));
    }
    return installed || commands.some(command => Boolean(which(command))) || Boolean(moduleName && options.moduleAvailable?.(moduleName));
  } catch (error) {
    if (options.strict) throw error;
    return false;
  }
}

function whichSync(command: string): string | null {
  const pathEnv = process.env.PATH ?? '';
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, command);
    if (!existsSync(candidate)) continue;
    try {
      const stat = statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111)) return candidate;
    } catch {
      // Ignore inaccessible PATH entries.
    }
  }
  return null;
}
