#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const REGISTRY_PATH = 'src/services/zkp/artifacts/browser-wasm-assets.json';
const VALID_CACHE_POLICIES = new Set([
  'immutable',
  'module-immutable',
  'package-immutable',
  'not-deployed',
  'no-store'
]);
const DEPLOYED_STATUSES = new Set(['runtime', 'optional-runtime', 'test-only']);
const COMMITTED_ASSET_EXTENSIONS = new Set(['.wasm', '.zkey', '.r1cs', '.b64']);

const args = parseArgs(process.argv.slice(2));
const failOnMissingIntegrity = Boolean(args['fail-on-missing-integrity']);
const reportPath = typeof args.report === 'string' ? args.report : null;

const errors = [];
const warnings = [];
const registry = readJson(REGISTRY_PATH);
const assets = Array.isArray(registry.assets) ? registry.assets : [];

if (registry.schemaVersion !== 'browser-wasm-assets-v1') {
  errors.push(`${REGISTRY_PATH}: schemaVersion must be browser-wasm-assets-v1`);
}

const ids = new Set();
const sourcePaths = new Set();
const deployedAssets = [];
const skippedAssets = [];

for (const asset of assets) {
  validateAssetShape(asset);
  if (typeof asset.id === 'string') ids.add(asset.id);
  if (DEPLOYED_STATUSES.has(asset.status)) deployedAssets.push(asset);
  else skippedAssets.push(asset);

  if (asset.sourcePath) {
    sourcePaths.add(asset.sourcePath);
    validateAssetFile(asset);
  } else if (DEPLOYED_STATUSES.has(asset.status)) {
    errors.push(`${asset.id}: deployed assets must have sourcePath`);
  }
}

validateCommittedArtifactsRegistered(sourcePaths);
validateGroth16Manifests();
validateDocs(reportPath, assets);
validateSimulatedProofPolicy();

const report = buildReport({ assets, deployedAssets, skippedAssets, errors, warnings });
if (reportPath) {
  console.log(`Browser WASM asset audit report target: ${reportPath}`);
}
console.log(report);

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else if (warnings.length > 0) {
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      i++;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function readJson(path) {
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) {
    errors.push(`${path}: file does not exist`);
    return {};
  }
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    errors.push(`${path}: invalid JSON (${error.message})`);
    return {};
  }
}

function validateAssetShape(asset) {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
    errors.push('registry contains a non-object asset entry');
    return;
  }
  for (const field of ['id', 'category', 'owner', 'status', 'assetType', 'resolution', 'cachePolicy']) {
    if (typeof asset[field] !== 'string' || !asset[field]) {
      errors.push(`${asset.id ?? '<unknown>'}: ${field} must be a non-empty string`);
    }
  }
  if (typeof asset.id === 'string') {
    if (ids.has(asset.id)) errors.push(`${asset.id}: duplicate asset id`);
    if (!/^[a-z0-9][a-z0-9.-]+$/.test(asset.id)) errors.push(`${asset.id}: id must be lowercase dot/dash notation`);
  }
  if (!VALID_CACHE_POLICIES.has(asset.cachePolicy)) {
    errors.push(`${asset.id}: unsupported cachePolicy ${asset.cachePolicy}`);
  }
  if (DEPLOYED_STATUSES.has(asset.status)) {
    if (!asset.browserUrl) errors.push(`${asset.id}: deployed assets must declare browserUrl`);
    if (failOnMissingIntegrity && !asset.integrity) {
      errors.push(`${asset.id}: missing integrity metadata`);
    }
  }
  if (asset.status === 'not-deployed' && asset.integrity) {
    errors.push(`${asset.id}: not-deployed assets must not pin integrity until a sourcePath is owned`);
  }
  if (!asset.isolation || typeof asset.isolation !== 'object') {
    errors.push(`${asset.id}: isolation policy is required`);
  } else {
    for (const field of ['coop', 'coep']) {
      if (typeof asset.isolation[field] !== 'string' || !asset.isolation[field]) {
        errors.push(`${asset.id}: isolation.${field} is required`);
      }
    }
    if (!Array.isArray(asset.isolation.csp) || asset.isolation.csp.length === 0) {
      errors.push(`${asset.id}: isolation.csp must list required directives`);
    }
  }
}

function validateAssetFile(asset) {
  const abs = resolve(ROOT, asset.sourcePath);
  if (!existsSync(abs)) {
    errors.push(`${asset.id}: sourcePath does not exist: ${asset.sourcePath}`);
    return;
  }
  if (!statSync(abs).isFile()) {
    errors.push(`${asset.id}: sourcePath is not a file: ${asset.sourcePath}`);
    return;
  }

  const bytes = assetBytes(abs, asset.sourceEncoding);
  if (!bytes) return;
  const actual = integrityFor(bytes);
  const integrity = asset.integrity;
  if (!integrity) {
    if (failOnMissingIntegrity) errors.push(`${asset.id}: missing integrity metadata`);
    return;
  }
  if (integrity.bytes !== actual.bytes) {
    errors.push(`${asset.id}: bytes mismatch expected ${integrity.bytes}, got ${actual.bytes}`);
  }
  if (integrity.sha256 !== actual.sha256) {
    errors.push(`${asset.id}: sha256 mismatch expected ${integrity.sha256}, got ${actual.sha256}`);
  }
  if (integrity.sriSha384 !== actual.sriSha384) {
    errors.push(`${asset.id}: sriSha384 mismatch expected ${integrity.sriSha384}, got ${actual.sriSha384}`);
  }
}

function assetBytes(abs, encoding) {
  const raw = readFileSync(abs);
  if (encoding === 'base64') {
    try {
      return Buffer.from(raw.toString('utf8').trim(), 'base64');
    } catch (error) {
      errors.push(`${relative(ROOT, abs)}: invalid base64 (${error.message})`);
      return null;
    }
  }
  return raw;
}

function integrityFor(bytes) {
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sriSha384: `sha384-${createHash('sha384').update(bytes).digest('base64')}`
  };
}

function validateCommittedArtifactsRegistered(registeredSourcePaths) {
  const root = resolve(ROOT, 'src/services/zkp/artifacts');
  for (const path of walk(root)) {
    const rel = relative(ROOT, path);
    const ext = extnameLower(path);
    if (!COMMITTED_ASSET_EXTENSIONS.has(ext)) continue;
    if (!registeredSourcePaths.has(rel)) {
      errors.push(`${rel}: committed browser ZKP artifact is not registered in ${REGISTRY_PATH}`);
    }
  }
}

function validateGroth16Manifests() {
  const root = resolve(ROOT, 'src/services/zkp/artifacts/groth16');
  if (!existsSync(root)) return;
  for (const path of walk(root)) {
    if (basename(path) !== 'manifest.json') continue;
    const rel = relative(ROOT, path);
    const manifest = readJson(rel);
    if (!manifest.artifacts || typeof manifest.artifacts !== 'object') {
      errors.push(`${rel}: artifacts map is required`);
      continue;
    }
    if (failOnMissingIntegrity && !manifest.cachePolicy) {
      errors.push(`${rel}: cachePolicy is required`);
    }
    for (const [file, expected] of Object.entries(manifest.artifacts)) {
      const assetPath = join(dirname(path), file);
      if (!existsSync(assetPath)) {
        errors.push(`${rel}: missing artifact ${file}`);
        continue;
      }
      const actual = integrityFor(readFileSync(assetPath));
      if (expected.bytes !== actual.bytes) errors.push(`${rel}:${file}: bytes mismatch`);
      if (expected.sha256 !== actual.sha256) errors.push(`${rel}:${file}: sha256 mismatch`);
      if (failOnMissingIntegrity && !expected.sriSha384) errors.push(`${rel}:${file}: missing sriSha384`);
      if (expected.sriSha384 && expected.sriSha384 !== actual.sriSha384) {
        errors.push(`${rel}:${file}: sriSha384 mismatch`);
      }
      if (failOnMissingIntegrity && !expected.cachePolicy) errors.push(`${rel}:${file}: missing cachePolicy`);
      if (failOnMissingIntegrity && !expected.browserUrl) errors.push(`${rel}:${file}: missing browserUrl`);
    }
  }
}

function validateDocs(path, allAssets) {
  if (!path) return;
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) {
    errors.push(`${path}: report/document path does not exist`);
    return;
  }
  const content = readFileSync(abs, 'utf8');
  for (const needle of [
    REGISTRY_PATH,
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Embedder-Policy',
    'Content-Security-Policy',
    'Cache-Control'
  ]) {
    if (!content.includes(needle)) errors.push(`${path}: missing required policy text: ${needle}`);
  }
  for (const asset of allAssets) {
    if (!content.includes(asset.id)) errors.push(`${path}: missing asset id ${asset.id}`);
  }
}

function validateSimulatedProofPolicy() {
  const simulatedPath = 'src/services/zkp/zkp-simulated-prover.ts';
  if (!existsSync(resolve(ROOT, simulatedPath))) return;
  for (const asset of assets) {
    const search = `${asset.id} ${asset.owner} ${asset.resolution}`.toLowerCase();
    if (search.includes('simulated') && asset.testOnly !== true) {
      errors.push(`${asset.id}: simulated proof assets must be marked testOnly`);
    }
  }
  const committedSimulatedAssets = walk(resolve(ROOT, 'src/services/zkp/artifacts'))
    .map(path => relative(ROOT, path))
    .filter(path => /simulat|mock|fixture/i.test(path));
  for (const path of committedSimulatedAssets) {
    errors.push(`${path}: simulated/mock/fixture artifact must live under test/`);
  }
}

function buildReport({ assets: allAssets, deployedAssets: deployed, skippedAssets: skipped, errors: errs, warnings: warns }) {
  const lines = [];
  lines.push('# Browser WASM Asset Audit');
  lines.push('');
  lines.push(`Registry: ${REGISTRY_PATH}`);
  lines.push(`Assets: ${allAssets.length} total, ${deployed.length} deployed/optional, ${skipped.length} not deployed`);
  lines.push(`Errors: ${errs.length}`);
  lines.push(`Warnings: ${warns.length}`);
  lines.push('');
  lines.push('| Asset | Status | Source | SHA-256 | Cache |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const asset of allAssets) {
    lines.push(`| ${asset.id} | ${asset.status} | ${asset.sourcePath ?? 'not-deployed'} | ${asset.integrity?.sha256 ?? 'n/a'} | ${asset.cachePolicy} |`);
  }
  return lines.join('\n');
}

function walk(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function extnameLower(path) {
  const index = path.lastIndexOf('.');
  return index === -1 ? '' : path.slice(index).toLowerCase();
}
