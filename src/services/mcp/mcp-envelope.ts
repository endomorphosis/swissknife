<<<<<<< Updated upstream
<<<<<<<< Updated upstream:src/services/mcp/mcp-envelope.ts
=======
>>>>>>> Stashed changes
/**
 * CID-Native Execution Envelopes & Receipts (MCP++ Profile B)
 *
 * Implements:
 *  - `ExecutionEnvelope` type  (§5.1)
 *  - `buildEnvelope()`         — content-address input, wrap in envelope
 *  - `ExecutionReceipt` type   (§5.2)
 *  - `buildReceipt()`          — content-address output, produce signed receipt_cid
 *
 * References: docs/spec/cid-native-artifacts.md in endomorphosis/Mcp-Plus-Plus
 */

<<<<<<< Updated upstream
import { base64UrlEncode, bytesFrom, sha256Hex, utf8Bytes } from '../shared/browser-crypto.js';
=======
import { sha256 } from '@noble/hashes/sha256';
import type { DIDKeystore } from '../../auth/did-keystore.js';
import {
  base64urlEncodeBytes,
  bytesToHex,
  toUint8Array,
  utf8ToBytes,
  type BytesLike,
} from '../shared/browser-bytes.js';
>>>>>>> Stashed changes

// ---------------------------------------------------------------------------
// CID helpers
// ---------------------------------------------------------------------------

<<<<<<< Updated upstream
function computeCID(data: Uint8Array | ArrayBuffer | readonly number[] | string): string {
  return `sha256:${sha256Hex(bytesFrom(data))}`;
=======
function computeCID(data: BytesLike): string {
  const input = toUint8Array(data);
  return `sha256:${bytesToHex(sha256(input))}`;
>>>>>>> Stashed changes
}

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + (value as unknown[]).map(canonicalJSON).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .filter(k => (value as Record<string, unknown>)[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${canonicalJSON((value as Record<string, unknown>)[k])}`)
      .join(',') +
    '}'
  );
}

// ---------------------------------------------------------------------------
// ExecutionEnvelope (MCP++ §5.1)
// ---------------------------------------------------------------------------

export interface ExecutionEnvelope {
  /** CID of the Interface Descriptor for the tool being invoked */
  interface_cid: string;
  /** CID of the content-addressed invocation input */
  input_cid: string;
  /** CID of the intent (optional description of the goal) */
  intent_cid: string;
  /** CID of the applicable deontic policy (optional) */
  policy_cid?: string;
  /** CID of the UCAN proof bundle (optional) */
  proof_cid?: string;
  /** Parent event CIDs (for causal ordering in the Event DAG) */
  parents: string[];
  /** Raw input bytes stored alongside the CID for transport */
  _inputBytes: Uint8Array;
  /** ISO-8601 timestamp */
  createdAt: string;
}

export interface ToolCallInput {
  toolName: string;
  params: Record<string, unknown>;
  /** DID of the caller (for UCAN proof) */
  callerDID?: string;
}

<<<<<<< Updated upstream
export interface ReceiptSignerKeystore {
  hasDID(did: string): boolean;
  sign(data: Uint8Array, did: string): Uint8Array;
}

=======
>>>>>>> Stashed changes
/**
 * Build a CID-native execution envelope for an MCP tool call.
 *
 * @param toolCall       The tool invocation parameters
 * @param interfaceCid   CID of the registered InterfaceDescriptor for this tool
 * @param ucanProofToken Optional encoded UCAN token authorising the call
 * @param parents        Parent event CIDs for causal ordering
 * @param policyCI       Optional policy CID
 */
export function buildEnvelope(
  toolCall: ToolCallInput,
  interfaceCid: string,
  ucanProofToken?: string,
  parents: string[] = [],
  policyCid?: string,
): ExecutionEnvelope {
  // 1. Content-address the input
  const inputJson = canonicalJSON(toolCall);
<<<<<<< Updated upstream
  const inputBytes = utf8Bytes(inputJson);
=======
  const inputBytes = utf8ToBytes(inputJson);
>>>>>>> Stashed changes
  const inputCid = computeCID(inputBytes);

  // 2. Content-address the intent (tool name + caller DID)
  const intentData = canonicalJSON({
    tool: toolCall.toolName,
    caller: toolCall.callerDID ?? 'anonymous',
  });
  const intentCid = computeCID(intentData);

  // 3. Content-address the proof bundle (if provided)
  let proofCid: string | undefined;
  if (ucanProofToken) {
    proofCid = computeCID(ucanProofToken);
  }

  return {
    interface_cid: interfaceCid,
    input_cid: inputCid,
    intent_cid: intentCid,
    policy_cid: policyCid,
    proof_cid: proofCid,
    parents,
    _inputBytes: inputBytes,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// ExecutionReceipt (MCP++ §5.2)
// ---------------------------------------------------------------------------

export interface ExecutionReceipt {
  /** CID of the execution envelope this receipt belongs to */
  envelope_cid: string;
  /** CID of the content-addressed output */
  output_cid: string;
  /** CID of the authorization decision (from policy evaluation, if any) */
  decision_cid?: string;
  /** Base64url-encoded Ed25519 signature over the receipt payload */
  signature?: string;
  /** DID of the signer */
  signerDID?: string;
  /** ISO-8601 timestamp */
  issuedAt: string;
}

/**
 * Build a signed execution receipt.
 *
 * @param envelope       The envelope that was dispatched
 * @param output         The tool output (will be content-addressed)
 * @param decisionCid    Optional CID of a policy decision
 * @param signerDID      If provided (and present in keystore), the receipt is signed
 * @param keystore       Keystore used for signing
 */
export function buildReceipt(
  envelope: ExecutionEnvelope,
  output: unknown,
  decisionCid?: string,
  signerDID?: string,
<<<<<<< Updated upstream
  keystore?: ReceiptSignerKeystore,
=======
  keystore?: DIDKeystore,
>>>>>>> Stashed changes
): ExecutionReceipt {
  // Content-address the envelope
  const envelopeForCid = {
    interface_cid: envelope.interface_cid,
    input_cid: envelope.input_cid,
    intent_cid: envelope.intent_cid,
    policy_cid: envelope.policy_cid,
    proof_cid: envelope.proof_cid,
    parents: envelope.parents,
    createdAt: envelope.createdAt,
  };
  const envelopeCid = computeCID(canonicalJSON(envelopeForCid));

  // Content-address the output
  const outputCid = computeCID(canonicalJSON(output));

  const receipt: ExecutionReceipt = {
    envelope_cid: envelopeCid,
    output_cid: outputCid,
    decision_cid: decisionCid,
    issuedAt: new Date().toISOString(),
  };

  // Sign the receipt if a signer DID and keystore are provided
  if (signerDID && keystore && keystore.hasDID(signerDID)) {
<<<<<<< Updated upstream
    const signingPayload = utf8Bytes(
=======
    const signingPayload = utf8ToBytes(
>>>>>>> Stashed changes
      canonicalJSON({
        envelope_cid: receipt.envelope_cid,
        output_cid: receipt.output_cid,
        decision_cid: receipt.decision_cid,
        issuedAt: receipt.issuedAt,
      }),
    );
    const sig = keystore.sign(signingPayload, signerDID);
<<<<<<< Updated upstream
    receipt.signature = base64UrlEncode(sig);
=======
    receipt.signature = base64urlEncodeBytes(sig);
>>>>>>> Stashed changes
    receipt.signerDID = signerDID;
  }

  return receipt;
}

/**
 * Compute the CID of a receipt (for use as a node in the Event DAG).
 */
export function computeReceiptCID(receipt: ExecutionReceipt): string {
<<<<<<< Updated upstream
  const { signature: _sig, ...withoutSig } = receipt;
=======
  const { signature: _sig, issuedAt: _issuedAt, ...withoutSig } = receipt;
>>>>>>> Stashed changes
  return computeCID(canonicalJSON(withoutSig));
}

// Re-export computeCID for use by other modules
export { computeCID };
<<<<<<< Updated upstream
========
export * from './mcp/mcp-envelope.js';
>>>>>>>> Stashed changes:src/services/mcp-envelope.ts
=======
>>>>>>> Stashed changes
