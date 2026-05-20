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

import { createHash } from 'crypto';
import { DIDKeystore, base64urlEncode } from '../auth/did-keystore.js';

// ---------------------------------------------------------------------------
// CID helpers
// ---------------------------------------------------------------------------

function computeCID(data: Buffer | Uint8Array | string): string {
  const input =
    typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
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
  _inputBytes: Buffer;
  /** ISO-8601 timestamp */
  createdAt: string;
}

export interface ToolCallInput {
  toolName: string;
  params: Record<string, unknown>;
  /** DID of the caller (for UCAN proof) */
  callerDID?: string;
}

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
  const inputBytes = Buffer.from(inputJson, 'utf8');
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
    proofCid = computeCID(Buffer.from(ucanProofToken, 'utf8'));
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
  keystore?: DIDKeystore,
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
  const outputCid = computeCID(
    Buffer.from(canonicalJSON(output), 'utf8'),
  );

  const receipt: ExecutionReceipt = {
    envelope_cid: envelopeCid,
    output_cid: outputCid,
    decision_cid: decisionCid,
    issuedAt: new Date().toISOString(),
  };

  // Sign the receipt if a signer DID and keystore are provided
  if (signerDID && keystore && keystore.hasDID(signerDID)) {
    const signingPayload = Buffer.from(
      canonicalJSON({
        envelope_cid: receipt.envelope_cid,
        output_cid: receipt.output_cid,
        decision_cid: receipt.decision_cid,
        issuedAt: receipt.issuedAt,
      }),
      'utf8',
    );
    const sig = keystore.sign(signingPayload, signerDID);
    receipt.signature = base64urlEncode(Buffer.from(sig));
    receipt.signerDID = signerDID;
  }

  return receipt;
}

/**
 * Compute the CID of a receipt (for use as a node in the Event DAG).
 */
export function computeReceiptCID(receipt: ExecutionReceipt): string {
  const { signature: _sig, ...withoutSig } = receipt;
  return computeCID(canonicalJSON(withoutSig));
}

// Re-export computeCID for use by other modules
export { computeCID };
