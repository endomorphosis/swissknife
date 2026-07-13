#!/usr/bin/env node
/**
 * Local coordinator for a real snarkjs Groth16 multi-party ceremony.
 *
 * This script never accepts contributor entropy by argument, environment
 * variable, or manifest. `snarkjs zkey contribute` reads the entropy from the
 * contributor's terminal. The coordinator records only public artifacts and
 * a signed DID attestation that is supplied after the contribution succeeds.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const SCHEMA = 'mcp++/groth16-mpc-ceremony@1';
const PROFILE = {
  capability: 'mcp++/event-dag',
  name: 'Profile F: Event DAG Provenance, Archival, and Compaction',
};

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const args = parseArgs(argv);
  switch (command) {
    case 'init':
      return initialiseCeremony(args);
    case 'prepare-zkey':
      return prepareZkey(args);
    case 'contribute':
      return contribute(args);
    case 'finalize':
      return finalize(args);
    case 'status':
      return showStatus(args);
    default:
      usage(command ? `Unknown command: ${command}` : undefined);
  }
}

function usage(error) {
  if (error) console.error(error);
  console.error(`Usage:
  zkp-mpc-ceremony.mjs init --manifest FILE --ceremony-id ID --circuit-id ID --r1cs FILE --phase1-ptau FILE [--minimum-contributors 2]
  zkp-mpc-ceremony.mjs prepare-zkey --manifest FILE --r1cs FILE --phase1-ptau FILE --output-zkey FILE
  zkp-mpc-ceremony.mjs contribute --manifest FILE --participant-did did:key:... --attestation FILE --input-zkey FILE --output-zkey FILE
  zkp-mpc-ceremony.mjs finalize --manifest FILE --r1cs FILE --phase1-ptau FILE --final-zkey FILE --verification-key FILE
  zkp-mpc-ceremony.mjs status --manifest FILE

Contribution entropy is entered interactively by snarkjs. Do not pass secrets
to this script or put them in the manifest.`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith('--')) throw new Error(`Unexpected argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    values.set(flag.slice(2), value);
    index += 1;
  }
  return values;
}

function required(args, name) {
  const value = args.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function integer(args, name, fallback) {
  const raw = args.get(name);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 2) throw new Error(`--${name} must be an integer of at least 2`);
  return value;
}

async function initialiseCeremony(args) {
  const manifestPath = required(args, 'manifest');
  const manifest = {
    schema: SCHEMA,
    profile: PROFILE,
    ceremonyId: required(args, 'ceremony-id'),
    circuitId: required(args, 'circuit-id'),
    keyFormat: 'snarkjs-zkey',
    circuitR1cs: await artifact(required(args, 'r1cs')),
    phase1Powers: await artifact(required(args, 'phase1-ptau')),
    curve: 'bn128',
    minimumIndependentContributors: integer(args, 'minimum-contributors', 2),
    contributions: [],
    status: 'collecting',
  };
  await writeManifest(manifestPath, manifest);
  console.log(JSON.stringify({ manifest: resolve(manifestPath), ceremonyCid: manifestCid(manifest), status: manifest.status }, null, 2));
}

async function prepareZkey(args) {
  const manifestPath = required(args, 'manifest');
  const manifest = await readManifest(manifestPath);
  requireCollecting(manifest);
  if (manifest.initialZkey) throw new Error('Initial zkey already exists; begin a contribution instead.');
  const r1cs = required(args, 'r1cs');
  const ptau = required(args, 'phase1-ptau');
  assertArtifactMatches(manifest.circuitR1cs, await artifact(r1cs), 'r1cs');
  assertArtifactMatches(manifest.phase1Powers, await artifact(ptau), 'phase1 powers');
  const output = required(args, 'output-zkey');
  runSnarkjs(['groth16', 'setup', r1cs, ptau, output]);
  manifest.initialZkey = await artifact(output);
  await writeManifest(manifestPath, manifest);
  console.log(JSON.stringify({ initialZkey: manifest.initialZkey, ceremonyCid: manifestCid(manifest) }, null, 2));
}

async function contribute(args) {
  const manifestPath = required(args, 'manifest');
  const manifest = await readManifest(manifestPath);
  requireCollecting(manifest);
  if (!manifest.initialZkey) throw new Error('Run prepare-zkey before collecting contributions.');
  const participantDid = required(args, 'participant-did');
  if (!/^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(participantDid)) throw new Error('participant DID is invalid');
  if (manifest.contributions.some(contribution => contribution.participantDid === participantDid)) {
    throw new Error('A participant may contribute only once to this ceremony.');
  }
  const input = required(args, 'input-zkey');
  const output = required(args, 'output-zkey');
  const expectedInput = manifest.contributions.at(-1)?.outputArtifactSha256 ?? manifest.initialZkey.sha256;
  if ((await artifact(input)).sha256 !== expectedInput) throw new Error('Input zkey does not match the ceremony transcript head.');

  // snarkjs prompts the contributor here; keeping stdio inherited prevents an
  // entropy value from entering process arguments, logs, or this manifest.
  runSnarkjs(['zkey', 'contribute', input, output]);
  const outputArtifact = await artifact(output);
  runSnarkjs(['zkey', 'verify', required(args, 'r1cs'), required(args, 'phase1-ptau'), output]);
  const attestation = await readAttestation(required(args, 'attestation'), participantDid);
  manifest.contributions.push({
    sequence: manifest.contributions.length + 1,
    participantDid,
    inputArtifactSha256: expectedInput,
    outputArtifactSha256: outputArtifact.sha256,
    attestation,
    transcriptVerifier: 'snarkjs-zkey-verify',
    transcriptVerifiedAt: new Date().toISOString(),
  });
  await writeManifest(manifestPath, manifest);
  console.log(JSON.stringify({ contribution: manifest.contributions.at(-1), ceremonyCid: manifestCid(manifest) }, null, 2));
}

async function finalize(args) {
  const manifestPath = required(args, 'manifest');
  const manifest = await readManifest(manifestPath);
  requireCollecting(manifest);
  const participants = new Set(manifest.contributions.map(contribution => contribution.participantDid));
  if (participants.size < manifest.minimumIndependentContributors) {
    throw new Error(`At least ${manifest.minimumIndependentContributors} independent contributors are required before finalization.`);
  }
  const finalZkey = required(args, 'final-zkey');
  const expectedFinal = manifest.contributions.at(-1)?.outputArtifactSha256;
  if (!expectedFinal || (await artifact(finalZkey)).sha256 !== expectedFinal) throw new Error('Final zkey does not match the ceremony transcript head.');
  const r1cs = required(args, 'r1cs');
  const ptau = required(args, 'phase1-ptau');
  assertArtifactMatches(manifest.circuitR1cs, await artifact(r1cs), 'r1cs');
  assertArtifactMatches(manifest.phase1Powers, await artifact(ptau), 'phase1 powers');
  runSnarkjs(['zkey', 'verify', r1cs, ptau, finalZkey]);
  const verificationKey = required(args, 'verification-key');
  runSnarkjs(['zkey', 'export', 'verificationkey', finalZkey, verificationKey]);
  manifest.finalZkey = await artifact(finalZkey);
  manifest.verificationKey = await artifact(verificationKey);
  manifest.status = 'complete';
  manifest.finalizedAt = new Date().toISOString();
  await writeManifest(manifestPath, manifest);
  console.log(JSON.stringify({ ceremonyCid: manifestCid(manifest), finalZkey: manifest.finalZkey, verificationKey: manifest.verificationKey }, null, 2));
}

async function showStatus(args) {
  const manifest = await readManifest(required(args, 'manifest'));
  const independentContributors = [...new Set(manifest.contributions.map(contribution => contribution.participantDid))].sort();
  console.log(JSON.stringify({
    ceremonyCid: manifestCid(manifest),
    status: manifest.status,
    profile: manifest.profile,
    independentContributors,
    minimumIndependentContributors: manifest.minimumIndependentContributors,
    productionEligible: manifest.status === 'complete' && independentContributors.length >= manifest.minimumIndependentContributors,
  }, null, 2));
}

async function artifact(path) {
  const bytes = await readFile(path);
  const info = await stat(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { sha256, cid: `sha256:${sha256}`, sizeBytes: info.size };
}

function assertArtifactMatches(expected, actual, label) {
  if (!expected || expected.sha256 !== actual.sha256 || expected.cid !== actual.cid || expected.sizeBytes !== actual.sizeBytes) {
    throw new Error(`Manifest ${label} artifact does not match the supplied file.`);
  }
}

async function readManifest(path) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest.schema !== SCHEMA) throw new Error(`Unsupported ceremony schema: ${String(manifest.schema)}`);
  if (manifest.profile?.capability !== PROFILE.capability || manifest.profile?.name !== PROFILE.name) {
    throw new Error('Manifest is not a Profile F event-DAG ceremony.');
  }
  if (!Array.isArray(manifest.contributions)) throw new Error('Manifest contributions must be an array.');
  return manifest;
}

async function readAttestation(path, participantDid) {
  const data = JSON.parse(await readFile(path, 'utf8'));
  if (data.participantDid !== participantDid) throw new Error('Attestation participantDid does not match --participant-did.');
  for (const field of ['algorithm', 'signature', 'signedAt', 'statementCid']) {
    if (typeof data[field] !== 'string' || !data[field]) throw new Error(`Attestation field ${field} is required.`);
  }
  return {
    algorithm: data.algorithm,
    signature: data.signature,
    signedAt: data.signedAt,
    statementCid: data.statementCid,
  };
}

function requireCollecting(manifest) {
  if (manifest.status !== 'collecting') throw new Error(`Ceremony status must be collecting, found ${String(manifest.status)}.`);
}

function runSnarkjs(args) {
  const executable = resolve(new URL('../node_modules/.bin/snarkjs', import.meta.url).pathname);
  const result = spawnSync(executable, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`snarkjs ${args.join(' ')} failed with exit ${String(result.status)}.`);
}

function manifestCid(manifest) {
  return `sha256:${createHash('sha256').update(canonicalJson(manifest)).digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

async function writeManifest(path, manifest) {
  const directory = dirname(resolve(path));
  const temporaryDirectory = await mkdtemp(resolve(directory, '.ceremony-'));
  const temporaryPath = resolve(temporaryDirectory, 'manifest.json');
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`Ceremony failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
