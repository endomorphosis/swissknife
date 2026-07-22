#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  buildAllAppCrossServiceProof,
  validateAllAppCrossServiceProof,
  type LiveGatewayEvidence,
  type PeerEvidence,
} from '../src/services/mcp/all-app-cross-service-proof.js';

const projectRoot = process.cwd();
const evidenceRoot = join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const appImprovementRoot = join(evidenceRoot, 'app-improvement');
const livePath = join(evidenceRoot, 'all-app-live-gateway-executions.json');
const peerPath = join(evidenceRoot, 'swissknife-all-tools-peer-evidence.json');
const matrixPath = join(appImprovementRoot, 'all-app-tool-matrix.json');
const receiptCatalogPath = join(appImprovementRoot, 'http-libp2p-kda-receipt-catalog.json');
const validateOnly = process.argv.includes('--validate-only');
const maxAgeMs = Number(process.env.SVD_181_LIVE_EVIDENCE_MAX_AGE_MS ?? 6 * 60 * 60 * 1000);

main();

function main(): void {
  if (validateOnly) {
    const matrix = readJson<Record<string, unknown>>(matrixPath, 'all-app tool matrix');
    const receiptCatalog = readJson<Record<string, unknown>>(receiptCatalogPath, 'K/D/A receipt catalog');
    const validation = validateAllAppCrossServiceProof({ matrix, receiptCatalog });
    if (!validation.valid) fail(validation.errors);
    validateTimestamp((matrix.sources as any)?.live_gateway?.generated_at, 'matrix live gateway source');
    validateTimestamp((matrix.sources as any)?.peer_interoperability?.generated_at, 'matrix peer source');
    printSummary(matrix, receiptCatalog);
    return;
  }

  const liveGatewayEvidence = readJson<LiveGatewayEvidence>(livePath, 'live gateway evidence');
  const peerEvidence = readJson<PeerEvidence>(peerPath, 'peer interoperability evidence');
  validateTimestamp(liveGatewayEvidence.generated_at, 'live gateway evidence');
  validateTimestamp(peerEvidence.generated_at, 'peer interoperability evidence');
  const generatedAt = new Date().toISOString();
  let proof;
  try {
    proof = buildAllAppCrossServiceProof({ generatedAt, liveGatewayEvidence, peerEvidence });
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)]);
  }
  const validation = validateAllAppCrossServiceProof(proof!);
  if (!validation.valid) fail(validation.errors);
  mkdirSync(dirname(matrixPath), { recursive: true });
  writeFileSync(matrixPath, `${JSON.stringify(proof!.matrix, null, 2)}\n`);
  writeFileSync(receiptCatalogPath, `${JSON.stringify(proof!.receiptCatalog, null, 2)}\n`);
  printSummary(proof!.matrix, proof!.receiptCatalog);
}

function readJson<T>(path: string, label: string): T {
  if (!existsSync(path)) fail([`${label} is missing at ${relative(projectRoot, path)}`]);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    fail([`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`]);
  }
}

function validateTimestamp(value: unknown, label: string): void {
  const timestamp = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  const age = Date.now() - timestamp;
  if (!Number.isFinite(timestamp) || age < -60_000 || age > maxAgeMs) {
    fail([`${label} must be current (maximum age ${maxAgeMs} ms); got ${JSON.stringify(value)}`]);
  }
}

function printSummary(matrix: Record<string, unknown>, catalog: Record<string, unknown>): void {
  const matrixSummary = matrix.summary as Record<string, unknown> | undefined;
  const catalogSummary = catalog.summary as Record<string, unknown> | undefined;
  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    task_id: 'SVD-181',
    matrix: relative(projectRoot, matrixPath),
    receipt_catalog: relative(projectRoot, receiptCatalogPath),
    app_count: matrixSummary?.app_count,
    application_execution_count: matrixSummary?.live_application_execution_count,
    real_safe_read_count: catalogSummary?.real_safe_read_count,
    governed_write_dry_run_count: matrixSummary?.governed_write_dry_run_count,
  }, null, 2)}\n`);
}

function fail(problems: readonly string[]): never {
  process.stderr.write('SVD-181 live receipt gate failed:\n');
  for (const problem of problems.flatMap(problem => problem.split('\n'))) {
    process.stderr.write(`- ${problem}\n`);
  }
  process.exit(1);
}
