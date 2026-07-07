/**
 * Host-native prover installer/availability helpers.
 *
 * TypeScript compatibility surface for integration/bridges/prover_installer.py.
 * These helpers probe availability and support injected installers; they do not
 * run package-manager installs unless the caller provides an installer callback.
 */

import * as fs from 'fs';
import { delimiter, join } from 'path';

export type PlatformSystem = 'linux' | 'darwin' | 'windows' | 'unknown';
export type PackageManager = 'apt' | 'brew' | 'choco' | 'unknown';
export type InstallMethod = PackageManager | 'skip' | 'error' | 'manual';

export interface PlatformInstallProfile {
  system: PlatformSystem;
  architecture: string;
  packageManager: PackageManager;
  canInstallSystemPackages: boolean;
}

export interface InstallComponentResult {
  component: string;
  success: boolean;
  installed: boolean;
  method: InstallMethod;
  message: string;
  commands: string[];
}

export interface EnsureProverOptions {
  yes?: boolean;
  strict?: boolean;
  allowSudo?: boolean;
  which?: (command: string) => string | null;
  moduleAvailable?: (moduleName: string) => boolean;
  install?: (component: string) => boolean | Promise<boolean>;
}

const KNOWN_COMPONENTS: Record<string, { commands: string[]; packages: Partial<Record<Exclude<PackageManager, 'unknown'>, string>> }> = {
  coq: { commands: ['coqc'], packages: { apt: 'coq', brew: 'coq', choco: 'coq' } },
  cvc5: { commands: ['cvc5'], packages: { apt: 'cvc5', brew: 'cvc5', choco: 'cvc5' } },
  eprover: { commands: ['eprover', 'eprover-ho'], packages: { apt: 'eprover', brew: 'eprover', choco: 'eprover' } },
  ergoai: { commands: ['ergo', 'ergoai', 'runErgo.sh', 'runergo'], packages: { apt: 'ergoai', brew: 'ergoai', choco: 'ergoai' } },
  lean4: { commands: ['lean'], packages: { apt: 'elan', brew: 'elan', choco: 'elan' } },
  symbolicai: { commands: ['symai'], packages: { apt: 'symbolicai', brew: 'symbolicai', choco: 'symbolicai' } },
  vampire: { commands: ['vampire'], packages: { apt: 'vampire', brew: 'vampire', choco: 'vampire' } },
  z3: { commands: ['z3'], packages: { apt: 'z3', brew: 'z3', choco: 'z3' } },
};

export function detectPlatformInstallProfile(): PlatformInstallProfile {
  const system = normalizeSystem(process.platform);
  const packageManager = detectPackageManager(system);
  return {
    system,
    architecture: process.arch || 'unknown',
    packageManager,
    canInstallSystemPackages: packageManager !== 'unknown',
  };
}

export const detect_platform_install_profile = detectPlatformInstallProfile;

export function listKnownComponents(): string[] {
  return Object.keys(KNOWN_COMPONENTS).sort();
}

export function installComponent(
  component: string,
  profile: PlatformInstallProfile = detectPlatformInstallProfile(),
  dryRun = false,
): InstallComponentResult {
  const spec = KNOWN_COMPONENTS[component];
  if (!spec) {
    return {
      component,
      success: false,
      installed: false,
      method: 'error',
      message: `Unknown prover component: ${component}`,
      commands: [],
    };
  }

  const installedPath = spec.commands.map(command => whichSync(command)).find(Boolean) ?? null;
  if (installedPath) {
    return {
      component,
      success: true,
      installed: true,
      method: 'skip',
      message: `${component} is already available at ${installedPath}`,
      commands: [],
    };
  }

  const commands = installCommands(component, profile);
  if (!commands.length) {
    return {
      component,
      success: false,
      installed: false,
      method: 'manual',
      message: `No package-manager install recipe is available for ${component}`,
      commands: [],
    };
  }

  return {
    component,
    success: false,
    installed: false,
    method: profile.packageManager,
    message: dryRun
      ? `Dry run: ${component} would be installed with ${profile.packageManager}`
      : `Automatic installation is not executed by this helper; run the returned commands manually`,
    commands,
  };
}

export const install_component = installComponent;

export function installComponents(
  components: string[],
  profile: PlatformInstallProfile = detectPlatformInstallProfile(),
  dryRun = false,
): InstallComponentResult[] {
  return components.map(component => installComponent(component, profile, dryRun));
}

export const install_components = installComponents;

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

function normalizeSystem(platform: NodeJS.Platform): PlatformSystem {
  if (platform === 'linux') return 'linux';
  if (platform === 'darwin') return 'darwin';
  if (platform === 'win32') return 'windows';
  return 'unknown';
}

function detectPackageManager(system: PlatformSystem): PackageManager {
  if (system === 'linux') return 'apt';
  if (system === 'darwin') return 'brew';
  if (system === 'windows') return 'choco';
  return 'unknown';
}

function installCommands(component: string, profile: PlatformInstallProfile): string[] {
  const packageName = KNOWN_COMPONENTS[component]?.packages[profile.packageManager as Exclude<PackageManager, 'unknown'>];
  if (!packageName) return [];
  if (profile.packageManager === 'apt') return ['sudo apt-get update', `sudo apt-get install -y ${packageName}`];
  if (profile.packageManager === 'brew') return [`brew install ${packageName}`];
  if (profile.packageManager === 'choco') return [`choco install ${packageName} -y`];
  return [];
}

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
    if (!fs.existsSync(candidate)) continue;
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111)) return candidate;
    } catch {
      // Ignore inaccessible PATH entries.
    }
  }
  return null;
}
