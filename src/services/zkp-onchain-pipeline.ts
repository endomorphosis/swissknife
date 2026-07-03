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
): string {
  const packed = packPublicInputsForEvm(publicInputs);
  const encoded = Buffer.from(JSON.stringify({ proof: JSON.parse(proofJson), publicInputs: packed }), 'utf8').toString('hex');
  return '0x' + encoded;
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

export { loadContractArtifact };
