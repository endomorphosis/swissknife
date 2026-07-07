/**
 * Sprint 68 — Ethereum Bridge
 * Ports of: zkp/eth_vk_registry_payloads.py (138L),
 *           zkp/onchain_pipeline.py (124L),
 *           zkp/eth_contract_artifacts.py (119L),
 *           zkp/evm_public_inputs.py (106L)
 */

import { bytesToHex, sha256Hex, utf8Bytes } from '../shared/browser-crypto.js';

// ---------------------------------------------------------------------------
// T-315a — ETH VK Registry Payloads (eth_vk_registry_payloads.py)
// ---------------------------------------------------------------------------

export function normalizeHexNoPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2).toLowerCase() : value.toLowerCase();
}

export function normalizeBytes32Hex(value: string): string {
  const stripped = normalizeHexNoPrefix(value);
  return stripped.padStart(64, '0');
}

export function vkHashHexToBytes32(vkHashHex: string): string {
  return '0x' + normalizeBytes32Hex(vkHashHex);
}

export function circuitIdTextToBytes32(circuitIdText: string): string {
  const hash = sha256Hex(circuitIdText);
  return '0x' + normalizeBytes32Hex(hash);
}

export interface RegisterVKPayload {
  circuitIdBytes32: string;
  vkHashBytes32:    string;
  vkData:           string;  // JSON-encoded
}

export function buildRegisterVkPayload(circuitId: string, vk: unknown, vkHashHex: string): RegisterVKPayload {
  return {
    circuitIdBytes32: circuitIdTextToBytes32(circuitId),
    vkHashBytes32:    vkHashHexToBytes32(vkHashHex),
    vkData:           JSON.stringify(vk),
  };
}

export function buildRegisterVkCalldata(payload: RegisterVKPayload): string {
  // ABI-encode the payload as a hex string (simplified)
  const encoded = bytesToHex(utf8Bytes(JSON.stringify(payload)));
  return '0x' + encoded;
}

// ---------------------------------------------------------------------------
// T-315b — Onchain Pipeline (onchain_pipeline.py)
// ---------------------------------------------------------------------------

export interface OnchainClient {
  submitTransaction(calldata: string): Promise<string>;  // returns tx hash
  waitForConfirmation(txHash: string): Promise<boolean>;
}

export interface ProverBackend {
  generateProof(witnessJson: string): Promise<string>;  // returns proof JSON
  getVkHash(circuitId: string): Promise<string>;
}

export interface OnchainPipelineResult {
  success:   boolean;
  txHash?:   string;
  proofHash?: string;
  error?:    string;
}

export async function runOffchainToOnchainPipeline(
  proverBackend:  ProverBackend,
  onchainClient:  OnchainClient,
  witnessJson:    string,
  circuitId:      string,
): Promise<OnchainPipelineResult> {
  try {
    const proofJson = await proverBackend.generateProof(witnessJson);
    const vkHash    = await proverBackend.getVkHash(circuitId);
    const payload   = buildRegisterVkPayload(circuitId, JSON.parse(proofJson) as unknown, vkHash);
    const calldata  = buildRegisterVkCalldata(payload);
    const txHash    = await onchainClient.submitTransaction(calldata);
    const confirmed = await onchainClient.waitForConfirmation(txHash);
    return confirmed ? { success: true, txHash, proofHash: vkHash } : { success: false, error: 'Not confirmed' };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// T-315c — ETH Contract Artifacts (eth_contract_artifacts.py)
// ---------------------------------------------------------------------------

export interface ContractArtifact {
  contractName: string;
  abi:          unknown[];
  bytecode?:    string;
  address?:     string;
}

export function loadContractArtifact(artifactJson: unknown): ContractArtifact {
  const obj = typeof artifactJson === 'string' ? JSON.parse(artifactJson) as Record<string, unknown> : artifactJson as Record<string, unknown>;
  return {
    contractName: String(obj['contractName'] ?? obj['name'] ?? 'Unknown'),
    abi:          (obj['abi'] as unknown[]) ?? [],
    bytecode:     obj['bytecode'] as string | undefined,
    address:      obj['address'] as string | undefined,
  };
}

export function loadContractAbi(artifactJson: unknown): unknown[] {
  return loadContractArtifact(artifactJson).abi;
}

export function normalizeHexPrefixed(hexStr: string | undefined): string | undefined {
  if (!hexStr) return undefined;
  return hexStr.startsWith('0x') ? hexStr : '0x' + hexStr;
}

// ---------------------------------------------------------------------------
// T-315d — EVM Public Inputs (evm_public_inputs.py)
// ---------------------------------------------------------------------------

const FR_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

export function stripHexPrefix(hexStr: string): string {
  return hexStr.startsWith('0x') ? hexStr.slice(2) : hexStr;
}

export function intTo0x32(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

export function bytes32HexToIntModFr(bytes32Hex: string): bigint {
  return BigInt('0x' + stripHexPrefix(bytes32Hex)) % FR_MODULUS;
}

export function hashTextToFieldSha256(text: string): string {
  const hash = sha256Hex(text);
  const val  = bytes32HexToIntModFr(hash);
  return intTo0x32(val);
}

export function packPublicInputsForEvm(inputs: Record<string, string>): string[] {
  return Object.values(inputs).map(v => {
    if (v.startsWith('0x')) return v.padEnd(66, '0');
    return '0x' + v.padStart(64, '0');
  });
}

export function packManyPublicInputsForEvm(inputSets: Record<string, string>[]): string[][] {
  return inputSets.map(s => packPublicInputsForEvm(s));
}

// ---------------------------------------------------------------------------
// T-318 — EVM Harness helpers (evm_harness.py)
// ---------------------------------------------------------------------------

function hexToInt(value: string): bigint {
  const s = value.trim().toLowerCase().replace(/^0x/, '');
  return s ? BigInt('0x' + s) : BigInt(0);
}

export function packPublicInputsUint256(params: {
  theoremHashHex:       string;
  axiomsCommitmentHex:  string;
  circuitVersion:       number;
  rulesetId:            string;
}): bigint[] {
  // Convert each param to a 0x-hex field element first
  const versionHex = intTo0x32(BigInt(params.circuitVersion));
  const rulesetHex = hashTextToFieldSha256(params.rulesetId);
  const scalarsHex = packPublicInputsForEvm({
    theorem_hash_hex:      params.theoremHashHex.startsWith('0x') ? params.theoremHashHex : '0x' + params.theoremHashHex,
    axioms_commitment_hex: params.axiomsCommitmentHex.startsWith('0x') ? params.axiomsCommitmentHex : '0x' + params.axiomsCommitmentHex,
    circuit_version:       versionHex,
    ruleset_id:            rulesetHex,
  });
  return scalarsHex.map(x => hexToInt(x));
}

export function validateUint256Array(values: bigint[], expectedLen: number): void {
  if (values.length !== expectedLen) throw new Error(`expected array of length ${expectedLen}, got ${values.length}`);
  const max = BigInt(1) << BigInt(256);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < BigInt(0) || v >= max) throw new Error(`values[${i}] must fit uint256`);
  }
}
