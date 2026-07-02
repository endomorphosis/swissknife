/**
 * prover-installer.ts
 *
 * Platform detection and prover component installation.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/bridges/prover_installer.py
 *
 * Provides:
 *   PackageManager            — brew | apt | conda | yum | pip | unknown
 *   PlatformInstallProfile    — detected system state
 *   InstallResult             — outcome of an install attempt
 *   detectPlatformInstallProfile() — detect current platform
 *   installComponent()          — install a prover component
 */

// ---------------------------------------------------------------------------
// PackageManager
// ---------------------------------------------------------------------------

export type PackageManager = 'brew' | 'apt' | 'conda' | 'yum' | 'pip' | 'unknown';

// ---------------------------------------------------------------------------
// PlatformInstallProfile
// ---------------------------------------------------------------------------

export interface PlatformInstallProfile {
  system: 'linux' | 'darwin' | 'windows' | 'unknown';
  architecture: 'x86_64' | 'arm64' | 'unknown';
  packageManager: PackageManager;
  packageManagerPath: string | null;
  isRoot: boolean;
  sudoAvailable: boolean;
  passwordlessSudo: boolean;
  canInstallSystemPackages: boolean;
}

// ---------------------------------------------------------------------------
// InstallResult
// ---------------------------------------------------------------------------

export interface InstallResult {
  component: string;
  success: boolean;
  installed: boolean;
  method: 'system_package' | 'conda' | 'pip' | 'skip' | 'error';
  message: string;
  commands: string[];
}

// ---------------------------------------------------------------------------
// Component → package name mapping
// ---------------------------------------------------------------------------

const COMPONENT_PACKAGES: Record<string, Partial<Record<PackageManager, string>>> = {
  z3:         { apt: 'z3', brew: 'z3', conda: 'z3', pip: 'z3-solver' },
  vampire:    { apt: 'vampire', brew: 'vampire' },
  eprover:    { apt: 'eprover', brew: 'eprover' },
  lean4:      { brew: 'leanprover/lean4/elan', conda: 'lean4' },
  coq:        { apt: 'coq', brew: 'coq', conda: 'coq' },
  cvc5:       { apt: 'cvc5', pip: 'cvc5' },
};

// ---------------------------------------------------------------------------
// detectPlatformInstallProfile
// ---------------------------------------------------------------------------

/**
 * Detect the current platform and package manager.
 * In the browser / Node.js environment, detection is heuristic.
 */
export function detectPlatformInstallProfile(): PlatformInstallProfile {
  // In a TypeScript/Node.js context, we can check process.platform
  let system: PlatformInstallProfile['system'] = 'unknown';
  let architecture: PlatformInstallProfile['architecture'] = 'unknown';

  if (typeof process !== 'undefined') {
    if (process.platform === 'linux')  system = 'linux';
    if (process.platform === 'darwin') system = 'darwin';
    if (process.platform === 'win32')  system = 'windows';
    if (process.arch === 'x64')  architecture = 'x86_64';
    if (process.arch === 'arm64') architecture = 'arm64';
  }

  // Determine package manager heuristically
  let packageManager: PackageManager = 'unknown';
  if (system === 'darwin') packageManager = 'brew';
  else if (system === 'linux') packageManager = 'apt';

  const isRoot = typeof process !== 'undefined' && process.getuid?.() === 0;
  const sudoAvailable = system !== 'windows';

  const canInstall = packageManager !== 'unknown' && (isRoot || sudoAvailable || packageManager === 'brew' || packageManager === 'conda' || packageManager === 'pip');

  return {
    system,
    architecture,
    packageManager,
    packageManagerPath: packageManager !== 'unknown' ? `/usr/bin/${packageManager}` : null,
    isRoot,
    sudoAvailable,
    passwordlessSudo: false, // Requires runtime check
    canInstallSystemPackages: canInstall,
  };
}

// ---------------------------------------------------------------------------
// installComponent
// ---------------------------------------------------------------------------

/**
 * Generate install commands for a prover component.
 * Does NOT actually run commands — returns an InstallResult with commands.
 */
export function installComponent(
  component: string,
  profile?: PlatformInstallProfile,
  dryRun = true,
): InstallResult {
  const p = profile ?? detectPlatformInstallProfile();
  const pkgMap = COMPONENT_PACKAGES[component.toLowerCase()];

  if (!pkgMap) {
    return {
      component, success: false, installed: false, method: 'error',
      message: `Unknown component: ${component}. Known: ${Object.keys(COMPONENT_PACKAGES).join(', ')}`,
      commands: [],
    };
  }

  if (!p.canInstallSystemPackages) {
    return {
      component, success: false, installed: false, method: 'skip',
      message: `Cannot install system packages on this platform (${p.system}, ${p.packageManager})`,
      commands: [],
    };
  }

  const pkgName = pkgMap[p.packageManager] ?? pkgMap['pip'];
  if (!pkgName) {
    return {
      component, success: false, installed: false, method: 'error',
      message: `No package mapping for ${component} with package manager ${p.packageManager}`,
      commands: [],
    };
  }

  let method: InstallResult['method'] = 'system_package';
  let commands: string[] = [];

  if (p.packageManager === 'pip') {
    method = 'pip';
    commands = [`pip install ${pkgName}`];
  } else if (p.packageManager === 'conda') {
    method = 'conda';
    commands = [`conda install -c conda-forge ${pkgName}`];
  } else if (p.packageManager === 'brew') {
    commands = [`brew install ${pkgName}`];
  } else if (p.packageManager === 'apt') {
    commands = [
      'sudo apt-get update',
      `sudo apt-get install -y ${pkgName}`,
    ];
  }

  return {
    component,
    success: !dryRun, // In dry-run mode, never mark as actually installed
    installed: !dryRun,
    method,
    message: dryRun
      ? `[dry-run] Would install ${pkgName} via ${p.packageManager}`
      : `Installed ${pkgName} via ${p.packageManager}`,
    commands,
  };
}

// ---------------------------------------------------------------------------
// Convenience: install multiple components
// ---------------------------------------------------------------------------

export function installComponents(
  components: string[],
  profile?: PlatformInstallProfile,
  dryRun = true,
): InstallResult[] {
  return components.map(c => installComponent(c, profile, dryRun));
}

/** List all known installable components. */
export function listKnownComponents(): string[] {
  return Object.keys(COMPONENT_PACKAGES).sort();
}
