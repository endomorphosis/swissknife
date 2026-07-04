/**
 * zkp-onchain-pipeline.ts
 *
 * On-chain ZKP proof submission helpers — PORT-196.
 * Provides deterministic ABI/public-input encoding, VK registry payloads,
 * gas estimation, and an injectable EVM submission client.
 */

import { createHash } from 'crypto';
import {
  buildRegisterVkCalldata,
  buildRegisterVkPayload,
  loadContractArtifact,
  packPublicInputsForEvm,
  vkHashHexToBytes32,
} from './sprint68-eth-bridge.js';

export interface EvmSubmissionClient {
  submitTransaction(calldata: string, opts?: { to?: string; gasLimit?: bigint }): Promise<string>;
  waitForConfirmation(txHash: string): Promise<{ confirmed: boolean; blockNumber?: number; gasUsed?: bigint }>;
}

export interface EvmWalletClientLike {
  sendTransaction(args: { to?: string; data: string; gas?: bigint; gasLimit?: bigint }): Promise<string | { hash: string }>;
  waitForTransactionReceipt?(args: { hash: string }): Promise<{ status?: string; blockNumber?: bigint | number; gasUsed?: bigint }>;
  waitForTransaction?(hash: string): Promise<{ status?: string; blockNumber?: bigint | number; gasUsed?: bigint }>;
}

export interface ZkpOnchainSubmission {
  readonly circuitId: string;
  readonly proofJson: string;
  readonly publicInputs: Record<string, string>;
  readonly verifyingKey: Record<string, unknown>;
  readonly verifierAddress: string;
  readonly registryAddress?: string;
}

export interface EncodedZkpOnchainPayload {
  readonly proofHash: string;
  readonly vkHash: string;
  readonly packedPublicInputs: string[];
  readonly verifierCalldata: string;
  readonly registryCalldata: string;
}

export interface VerifierCalldataOptions {
  /** 4-byte selector for verifyProof(bytes,uint256[]). */
  methodSelector?: string;
  /** Compatibility mode for older tests or non-EVM transports. */
  encoding?: 'solidity' | 'json-hex';
}

export interface OnchainZkpPipelineResult {
  readonly success: boolean;
  readonly transactionHash?: string;
  readonly blockNumber?: number;
  readonly gasUsed?: bigint;
  readonly payload: EncodedZkpOnchainPayload;
  readonly error?: string;
}

export function computeProofHash(proofJson: string): string {
  return createHash('sha256').update(proofJson, 'utf8').digest('hex');
}

export function computeVkHash(vk: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(vk), 'utf8').digest('hex');
}

export function encodeVerifierCalldata(
  proofJson: string,
  publicInputs: Record<string, string>,
  options: VerifierCalldataOptions = {},
): string {
  if (options.encoding === 'json-hex') {
    const packed = packPublicInputsForEvm(publicInputs);
    const encoded = Buffer.from(JSON.stringify({ proof: JSON.parse(proofJson), publicInputs: packed }), 'utf8').toString('hex');
    return '0x' + encoded;
  }
  return encodeVerifyProofSolidityCalldata(proofJson, publicInputs, options.methodSelector);
}

export function encodeVerifyProofSolidityCalldata(
  proofJson: string,
  publicInputs: Record<string, string>,
  methodSelector = '0x43753b4d',
): string {
  const selector = normalizeSelector(methodSelector);
  const proofBytes = proofJsonToHex(proofJson);
  const packed = packPublicInputsForEvm(publicInputs);
  const proofTail = encodeBytes(proofBytes);
  const inputsTail = encodeUint256Array(packed);
  const proofOffset = encodeUint256(BigInt(64));
  const inputsOffset = encodeUint256(BigInt(64 + proofTail.length / 2));
  return '0x' + selector + proofOffset + inputsOffset + proofTail + inputsTail;
}

export function encodeZkpOnchainPayload(submission: ZkpOnchainSubmission): EncodedZkpOnchainPayload {
  const proofHash = computeProofHash(submission.proofJson);
  const vkHash = computeVkHash(submission.verifyingKey);
  const registryPayload = buildRegisterVkPayload(submission.circuitId, submission.verifyingKey, vkHash);
  return {
    proofHash,
    vkHash: vkHashHexToBytes32(vkHash),
    packedPublicInputs: packPublicInputsForEvm(submission.publicInputs),
    verifierCalldata: encodeVerifierCalldata(submission.proofJson, submission.publicInputs),
    registryCalldata: buildRegisterVkCalldata(registryPayload),
  };
}

export function estimateZkpOnchainGas(payload: EncodedZkpOnchainPayload): { gasLimit: bigint; calldataBytes: number } {
  const calldataBytes = Math.ceil((payload.verifierCalldata.length - 2 + payload.registryCalldata.length - 2) / 2);
  const gasLimit = BigInt(300_000 + calldataBytes * 16);
  return { gasLimit, calldataBytes };
}

export async function submitZkpProofOnchain(
  submission: ZkpOnchainSubmission,
  client: EvmSubmissionClient,
): Promise<OnchainZkpPipelineResult> {
  const payload = encodeZkpOnchainPayload(submission);
  const estimate = estimateZkpOnchainGas(payload);
  try {
    const txHash = await client.submitTransaction(payload.verifierCalldata, {
      to: submission.verifierAddress,
      gasLimit: estimate.gasLimit,
    });
    const receipt = await client.waitForConfirmation(txHash);
    return {
      success: receipt.confirmed,
      transactionHash: txHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      payload,
      error: receipt.confirmed ? undefined : 'transaction not confirmed',
    };
  } catch (error) {
    return { success: false, payload, error: String(error) };
  }
}

export function createEvmSubmissionClient(client: EvmWalletClientLike): EvmSubmissionClient {
  return {
    async submitTransaction(calldata, opts = {}) {
      const sent = await client.sendTransaction({
        to: opts.to,
        data: calldata,
        gas: opts.gasLimit,
        gasLimit: opts.gasLimit,
      });
      return typeof sent === 'string' ? sent : sent.hash;
    },
    async waitForConfirmation(txHash) {
      const receipt = client.waitForTransactionReceipt
        ? await client.waitForTransactionReceipt({ hash: txHash })
        : client.waitForTransaction
          ? await client.waitForTransaction(txHash)
          : { status: 'unknown' };
      return {
        confirmed: receipt.status === undefined || receipt.status === 'success' || receipt.status === 'confirmed',
        blockNumber: typeof receipt.blockNumber === 'bigint' ? Number(receipt.blockNumber) : receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    },
  };
}

export { loadContractArtifact };

function normalizeSelector(selector: string): string {
  const hex = selector.startsWith('0x') ? selector.slice(2) : selector;
  if (!/^[0-9a-fA-F]{8}$/.test(hex)) throw new Error(`method selector must be 4 bytes, got ${selector}`);
  return hex.toLowerCase();
}

function proofJsonToHex(proofJson: string): string {
  const parsed = JSON.parse(proofJson) as Record<string, unknown>;
  for (const key of ['proofData', 'proof_data', 'proof', 'proof_hex', 'pi_a']) {
    const value = parsed[key];
    if (typeof value === 'string' && value.length > 0) {
      const hex = value.startsWith('0x') ? value.slice(2) : value;
      if (/^[0-9a-fA-F]+$/.test(hex)) return hex.length % 2 === 0 ? hex : '0' + hex;
    }
  }
  return Buffer.from(proofJson, 'utf8').toString('hex');
}

function encodeBytes(hexValue: string): string {
  const clean = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
  const even = clean.length % 2 === 0 ? clean : '0' + clean;
  return encodeUint256(BigInt(even.length / 2)) + padRightToWord(even);
}

function encodeUint256Array(values: string[]): string {
  return encodeUint256(BigInt(values.length)) + values.map(value => encodeUint256(hexToBigInt(value))).join('');
}

function encodeUint256(value: bigint): string {
  if (value < BigInt(0)) throw new Error('uint256 cannot be negative');
  return value.toString(16).padStart(64, '0');
}

function padRightToWord(hexValue: string): string {
  const remainder = hexValue.length % 64;
  return remainder === 0 ? hexValue : hexValue + '0'.repeat(64 - remainder);
}

function hexToBigInt(value: string): bigint {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  return clean ? BigInt('0x' + clean) : BigInt(0);
}
