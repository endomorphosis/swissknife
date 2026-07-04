/**
 * Artifact manifests for ProveKit-backed ZKP circuits.
 *
 * TypeScript port of ipfs_datasets_py/logic/zkp/provekit/artifacts.py.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

import {
  DEFAULT_PROVEKIT_CIRCUIT_VERSION,
  DEFAULT_PROVEKIT_HASH_BACKEND,
  DEFAULT_PROVEKIT_RULESET_ID,
} from './zkp-provekit-public-inputs.js';
import {
  formatCircuitRef,
  parseCircuitRefLenient,
} from './zkp-statement.js';

export const PROVEKIT_ARTIFACT_MANIFEST_SCHEMA_VERSION = 'provekit-artifact-manifest-v1';
export const DEFAULT_PROVEKIT_MANIFEST_FILENAME = 'provekit-artifacts.json';

const DEFAULT_EXCLUDE_DIRS = ['target', '.git', '__pycache__'];
const DEFAULT_EXCLUDE_SUFFIXES = ['.pkp', '.pkv', '.np', '.pyc'];

export interface ProveKitKeyPairInput {
  proverKeyPath: string;
  verifierKeyPath: string;
}

export class ProveKitKeyPair {
  readonly proverKeyPath: string;
  readonly verifierKeyPath: string;

  constructor(input: ProveKitKeyPairInput) {
    this.proverKeyPath = input.proverKeyPath;
    this.verifierKeyPath = input.verifierKeyPath;
  }

  static fromPaths(proverKeyPath: string, verifierKeyPath: string): ProveKitKeyPair {
    return new ProveKitKeyPair({
      proverKeyPath: resolve(proverKeyPath),
      verifierKeyPath: resolve(verifierKeyPath),
    });
  }

  toDict(): Record<string, string> {
    return {
      prover_key_path: this.proverKeyPath,
      verifier_key_path: this.verifierKeyPath,
    };
  }
}

export interface ProveKitArtifactManifestInput {
  circuitId: string;
  circuitVersion: number;
  circuitRef?: string;
  rulesetId: string;
  hashBackend: string;
  noirPackagePath: string;
  proverKeyPath: string;
  verifierKeyPath: string;
  provekitBranch: string;
  provekitCommit: string;
  noirPackageSha256: string;
  proverKeySha256: string;
  verifierKeySha256: string;
  schemaVersion?: string;
  provekitBinaryPath?: string;
  provekitBinarySha256?: string;
  metadata?: Record<string, unknown>;
}

export interface BuildProveKitArtifactManifestOptions {
  circuitId: string;
  noirPackagePath: string;
  proverKeyPath: string;
  verifierKeyPath: string;
  provekitBranch: string;
  provekitCommit: string;
  circuitVersion?: number;
  rulesetId?: string;
  hashBackend?: string;
  provekitBinaryPath?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class ProveKitArtifactManifest {
  readonly circuitId: string;
  readonly circuitVersion: number;
  readonly circuitRef: string;
  readonly rulesetId: string;
  readonly hashBackend: string;
  readonly noirPackagePath: string;
  readonly proverKeyPath: string;
  readonly verifierKeyPath: string;
  readonly provekitBranch: string;
  readonly provekitCommit: string;
  readonly noirPackageSha256: string;
  readonly proverKeySha256: string;
  readonly verifierKeySha256: string;
  readonly schemaVersion: string;
  readonly provekitBinaryPath: string;
  readonly provekitBinarySha256: string;
  readonly metadata: Record<string, unknown>;

  constructor(input: ProveKitArtifactManifestInput) {
    this.circuitId = input.circuitId;
    this.circuitVersion = input.circuitVersion;
    this.circuitRef = input.circuitRef ?? formatCircuitRef(input.circuitId, input.circuitVersion);
    this.rulesetId = input.rulesetId;
    this.hashBackend = input.hashBackend;
    this.noirPackagePath = input.noirPackagePath;
    this.proverKeyPath = input.proverKeyPath;
    this.verifierKeyPath = input.verifierKeyPath;
    this.provekitBranch = input.provekitBranch;
    this.provekitCommit = input.provekitCommit;
    this.noirPackageSha256 = input.noirPackageSha256;
    this.proverKeySha256 = input.proverKeySha256;
    this.verifierKeySha256 = input.verifierKeySha256;
    this.schemaVersion = input.schemaVersion ?? PROVEKIT_ARTIFACT_MANIFEST_SCHEMA_VERSION;
    this.provekitBinaryPath = input.provekitBinaryPath ?? '';
    this.provekitBinarySha256 = input.provekitBinarySha256 ?? '';
    this.metadata = { ...(input.metadata ?? {}) };
    this.validateShape();
  }

  static fromDict(data: Record<string, unknown>): ProveKitArtifactManifest {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('manifest data must be a mapping');
    }
    return new ProveKitArtifactManifest({
      circuitId: String(data.circuit_id ?? data.circuitId ?? ''),
      circuitVersion: Number(data.circuit_version ?? data.circuitVersion ?? -1),
      circuitRef: String(data.circuit_ref ?? data.circuitRef ?? ''),
      rulesetId: String(data.ruleset_id ?? data.rulesetId ?? ''),
      hashBackend: String(data.hash_backend ?? data.hashBackend ?? ''),
      noirPackagePath: String(data.noir_package_path ?? data.noirPackagePath ?? ''),
      proverKeyPath: String(data.prover_key_path ?? data.proverKeyPath ?? ''),
      verifierKeyPath: String(data.verifier_key_path ?? data.verifierKeyPath ?? ''),
      provekitBranch: String(data.provekit_branch ?? data.provekitBranch ?? ''),
      provekitCommit: String(data.provekit_commit ?? data.provekitCommit ?? ''),
      noirPackageSha256: String(data.noir_package_sha256 ?? data.noirPackageSha256 ?? ''),
      proverKeySha256: String(data.prover_key_sha256 ?? data.proverKeySha256 ?? ''),
      verifierKeySha256: String(data.verifier_key_sha256 ?? data.verifierKeySha256 ?? ''),
      schemaVersion: String(data.schema_version ?? data.schemaVersion ?? PROVEKIT_ARTIFACT_MANIFEST_SCHEMA_VERSION),
      provekitBinaryPath: String(data.provekit_binary_path ?? data.provekitBinaryPath ?? ''),
      provekitBinarySha256: String(data.provekit_binary_sha256 ?? data.provekitBinarySha256 ?? ''),
      metadata: isRecord(data.metadata) ? data.metadata : {},
    });
  }

  toDict(): Record<string, unknown> {
    return {
      circuit_id: this.circuitId,
      circuit_version: this.circuitVersion,
      circuit_ref: this.circuitRef,
      ruleset_id: this.rulesetId,
      hash_backend: this.hashBackend,
      noir_package_path: this.noirPackagePath,
      prover_key_path: this.proverKeyPath,
      verifier_key_path: this.verifierKeyPath,
      provekit_branch: this.provekitBranch,
      provekit_commit: this.provekitCommit,
      noir_package_sha256: this.noirPackageSha256,
      prover_key_sha256: this.proverKeySha256,
      verifier_key_sha256: this.verifierKeySha256,
      schema_version: this.schemaVersion,
      provekit_binary_path: this.provekitBinaryPath,
      provekit_binary_sha256: this.provekitBinarySha256,
      metadata: { ...this.metadata },
    };
  }

  canonicalJson(): string {
    return canonicalJson(this.toDict());
  }

  manifestSha256(): string {
    return sha256String(this.canonicalJson());
  }

  validateFiles(): void {
    validateExistingDigest(this.noirPackagePath, this.noirPackageSha256, 'Noir package', true);
    validateExistingDigest(this.proverKeyPath, this.proverKeySha256, 'ProveKit prover key');
    validateExistingDigest(this.verifierKeyPath, this.verifierKeySha256, 'ProveKit verifier key');
    if (this.provekitBinaryPath) {
      validateExistingDigest(this.provekitBinaryPath, this.provekitBinarySha256, 'ProveKit binary');
    }
  }

  toBackendArtifacts(): Record<string, unknown> {
    return {
      provekit_artifacts: {
        program_dir: this.noirPackagePath,
        prover_key_path: this.proverKeyPath,
        verifier_key_path: this.verifierKeyPath,
        hash_backend: this.hashBackend,
        provekit_branch: this.provekitBranch,
        provekit_commit: this.provekitCommit,
        manifest_sha256: this.manifestSha256(),
        manifest_schema_version: this.schemaVersion,
      },
    };
  }

  canonical_json = this.canonicalJson.bind(this);
  manifest_sha256 = this.manifestSha256.bind(this);
  validate_files = this.validateFiles.bind(this);
  to_backend_artifacts = this.toBackendArtifacts.bind(this);

  private validateShape(): void {
    if (this.schemaVersion !== PROVEKIT_ARTIFACT_MANIFEST_SCHEMA_VERSION) {
      throw new Error('unsupported ProveKit artifact manifest schema_version');
    }
    if (!this.circuitId || this.circuitId.includes('@')) {
      throw new Error('circuit_id must be a non-empty unversioned string');
    }
    if (!Number.isInteger(this.circuitVersion) || this.circuitVersion < 0) {
      throw new Error('circuit_version must be a non-negative integer');
    }
    const parsed = parseCircuitRefLenient(this.circuitRef, this.circuitVersion);
    if (parsed.circuitId !== this.circuitId || parsed.version !== this.circuitVersion) {
      throw new Error('circuit_ref must match circuit_id and circuit_version');
    }
    if (this.circuitRef !== formatCircuitRef(this.circuitId, this.circuitVersion)) {
      throw new Error('circuit_ref must be canonical');
    }
    for (const [name, value] of Object.entries({
      ruleset_id: this.rulesetId,
      hash_backend: this.hashBackend,
      provekit_branch: this.provekitBranch,
      provekit_commit: this.provekitCommit,
    })) {
      if (!value) throw new Error(`${name} must be a non-empty string`);
    }
    validateSha256Hex('noir_package_sha256', this.noirPackageSha256);
    validateSha256Hex('prover_key_sha256', this.proverKeySha256);
    validateSha256Hex('verifier_key_sha256', this.verifierKeySha256);
    if (this.provekitBinarySha256) validateSha256Hex('provekit_binary_sha256', this.provekitBinarySha256);
    if (this.provekitBinaryPath && !this.provekitBinarySha256) {
      throw new Error('provekit_binary_sha256 is required when provekit_binary_path is set');
    }
  }
}

export function sha256File(path: string): string {
  if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`file does not exist: ${path}`);
  }
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function sha256Directory(
  path: string,
  options: { excludeDirs?: string[]; excludeSuffixes?: string[] } = {},
): string {
  if (!lstatSync(path, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`directory does not exist: ${path}`);
  }
  const root = resolve(path);
  const excludeDirs = new Set(options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS);
  const excludeSuffixes = new Set(options.excludeSuffixes ?? DEFAULT_EXCLUDE_SUFFIXES);
  const files = iterManifestFiles(root, excludeDirs, excludeSuffixes).sort();
  const digest = createHash('sha256');
  for (const filePath of files) {
    const relPath = relative(root, filePath).split(sep).join('/');
    const payload = readFileSync(filePath);
    const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(payload.length));
    digest.update(Buffer.from(relPath, 'utf8'));
    digest.update(Buffer.from([0]));
    digest.update(size);
    digest.update(payload);
  }
  return digest.digest('hex');
}

export function buildProveKitArtifactManifest(
  options: BuildProveKitArtifactManifestOptions,
): ProveKitArtifactManifest {
  const packagePath = resolve(options.noirPackagePath);
  const proverKeyPath = resolve(options.proverKeyPath);
  const verifierKeyPath = resolve(options.verifierKeyPath);
  const binaryPath = options.provekitBinaryPath ? resolve(options.provekitBinaryPath) : '';
  return new ProveKitArtifactManifest({
    circuitId: options.circuitId,
    circuitVersion: options.circuitVersion ?? DEFAULT_PROVEKIT_CIRCUIT_VERSION,
    rulesetId: options.rulesetId ?? DEFAULT_PROVEKIT_RULESET_ID,
    hashBackend: options.hashBackend ?? DEFAULT_PROVEKIT_HASH_BACKEND,
    noirPackagePath: packagePath,
    proverKeyPath,
    verifierKeyPath,
    provekitBranch: options.provekitBranch,
    provekitCommit: options.provekitCommit,
    noirPackageSha256: sha256Directory(packagePath),
    proverKeySha256: sha256File(proverKeyPath),
    verifierKeySha256: sha256File(verifierKeyPath),
    provekitBinaryPath: binaryPath,
    provekitBinarySha256: binaryPath ? sha256File(binaryPath) : '',
    metadata: { ...(options.metadata ?? {}) },
  });
}

export function findProveKitKeyPair(
  searchRoot: string,
  options: { circuitId: string; circuitVersion?: number },
): ProveKitKeyPair | null {
  if (!existsSync(searchRoot)) {
    throw new Error(`ProveKit artifact search root does not exist: ${searchRoot}`);
  }
  const version = options.circuitVersion ?? DEFAULT_PROVEKIT_CIRCUIT_VERSION;
  const preferredStems = [
    options.circuitId,
    `${options.circuitId}_v${version}`,
    `${options.circuitId}@v${version}`,
  ];
  const matches: Array<{ priority: number; pkpPath: string; pkvPath: string }> = [];
  for (const pkpPath of walkFiles(resolve(searchRoot)).filter(path => extname(path) === '.pkp')) {
    const stem = basenameWithoutExt(pkpPath);
    const priority = preferredStems.indexOf(stem);
    if (priority < 0) continue;
    const pkvPath = `${pkpPath.slice(0, -4)}.pkv`;
    if (lstatSync(pkvPath, { throwIfNoEntry: false })?.isFile()) {
      matches.push({ priority, pkpPath, pkvPath });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.priority - b.priority || a.pkpPath.localeCompare(b.pkpPath));
  const best = matches.filter(match => match.priority === matches[0].priority);
  if (best.length > 1) {
    throw new Error(`Ambiguous ProveKit key pairs for ${options.circuitId}: ${best.map(match => match.pkpPath).join(', ')}`);
  }
  return ProveKitKeyPair.fromPaths(best[0].pkpPath, best[0].pkvPath);
}

export function saveProveKitArtifactManifest(manifest: ProveKitArtifactManifest, path: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${prettyCanonicalJson(manifest.toDict())}\n`, 'utf8');
  return path;
}

export function loadProveKitArtifactManifest(
  path: string,
  options: { validateFiles?: boolean } = {},
): ProveKitArtifactManifest {
  if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`ProveKit artifact manifest does not exist: ${path}`);
  }
  const manifest = ProveKitArtifactManifest.fromDict(JSON.parse(readFileSync(path, 'utf8')));
  if (options.validateFiles ?? true) manifest.validateFiles();
  return manifest;
}

export const sha256_file = sha256File;
export const sha256_directory = sha256Directory;
export const build_provekit_artifact_manifest = buildProveKitArtifactManifest;
export const find_provekit_key_pair = findProveKitKeyPair;
export const save_provekit_artifact_manifest = saveProveKitArtifactManifest;
export const load_provekit_artifact_manifest = loadProveKitArtifactManifest;

function iterManifestFiles(root: string, excludeDirs: Set<string>, excludeSuffixes: Set<string>): string[] {
  return walkFiles(root).filter(filePath => {
    const parts = relative(root, filePath).split(sep);
    if (parts.slice(0, -1).some(part => excludeDirs.has(part))) return false;
    return !excludeSuffixes.has(extname(filePath));
  });
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(path));
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out;
}

function validateExistingDigest(path: string, expectedSha256: string, label: string, directory = false): void {
  const actual = directory ? sha256Directory(path) : sha256File(path);
  if (actual !== expectedSha256) {
    throw new Error(`${label} digest mismatch for ${path}: expected ${expectedSha256}, got ${actual}`);
  }
}

function validateSha256Hex(fieldName: string, value: string): void {
  if (typeof value !== 'string' || value.length !== 64) {
    throw new Error(`${fieldName} must be 64 lowercase hex characters`);
  }
  if (value.toLowerCase() !== value || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${fieldName} must be lowercase hex`);
  }
}

function sha256String(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return jsonStringifyAscii(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${jsonStringifyAscii(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function prettyCanonicalJson(value: unknown): string {
  return JSON.stringify(sortForJson(value), null, 2);
}

function sortForJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortForJson);
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (record[key] !== undefined) sorted[key] = sortForJson(record[key]);
  }
  return sorted;
}

function jsonStringifyAscii(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => (
    `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
  ));
}

function basenameWithoutExt(path: string): string {
  const name = path.split(sep).pop() ?? path;
  const suffix = extname(name);
  return suffix ? name.slice(0, -suffix.length) : name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
