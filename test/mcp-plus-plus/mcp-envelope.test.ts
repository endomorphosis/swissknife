/**
 * Phase 4 — Execution Envelopes & Receipts tests
 */

import {
  buildEnvelope,
  buildReceipt,
  computeReceiptCID,
  computeCID,
} from '../../src/services/mcp/mcp-envelope';
import { DIDKeystore } from '../../src/auth/did-keystore';

const SAMPLE_INTERFACE_CID = 'sha256:abc123def456' + '0'.repeat(52);

describe('buildEnvelope', () => {
  it('returns an envelope with required fields', () => {
    const env = buildEnvelope(
      { toolName: 'search', params: { q: 'hello' } },
      SAMPLE_INTERFACE_CID,
    );
    expect(env.interface_cid).toBe(SAMPLE_INTERFACE_CID);
    expect(env.input_cid).toMatch(/^sha256:/);
    expect(env.intent_cid).toMatch(/^sha256:/);
    expect(env.parents).toEqual([]);
    expect(typeof env.createdAt).toBe('string');
  });

  it('content-addresses the input deterministically', () => {
    const call = { toolName: 'search', params: { q: 'hello' } };
    const env1 = buildEnvelope(call, SAMPLE_INTERFACE_CID);
    const env2 = buildEnvelope(call, SAMPLE_INTERFACE_CID);
    expect(env1.input_cid).toBe(env2.input_cid);
  });

  it('different inputs produce different input_cids', () => {
    const env1 = buildEnvelope(
      { toolName: 'search', params: { q: 'hello' } },
      SAMPLE_INTERFACE_CID,
    );
    const env2 = buildEnvelope(
      { toolName: 'search', params: { q: 'world' } },
      SAMPLE_INTERFACE_CID,
    );
    expect(env1.input_cid).not.toBe(env2.input_cid);
  });

  it('attaches proof_cid when UCAN token is provided', () => {
    const env = buildEnvelope(
      { toolName: 'search', params: {} },
      SAMPLE_INTERFACE_CID,
      'mock.ucan.token',
    );
    expect(env.proof_cid).toMatch(/^sha256:/);
  });

  it('attaches policy_cid when provided', () => {
    const policyCid = 'sha256:policy' + '0'.repeat(58);
    const env = buildEnvelope(
      { toolName: 'search', params: {} },
      SAMPLE_INTERFACE_CID,
      undefined,
      [],
      policyCid,
    );
    expect(env.policy_cid).toBe(policyCid);
  });

  it('carries parent CIDs', () => {
    const parents = ['sha256:aaa' + '0'.repeat(61), 'sha256:bbb' + '0'.repeat(61)];
    const env = buildEnvelope(
      { toolName: 'search', params: {} },
      SAMPLE_INTERFACE_CID,
      undefined,
      parents,
    );
    expect(env.parents).toEqual(parents);
  });
});

describe('buildReceipt', () => {
  it('returns a receipt with required fields', () => {
    const env = buildEnvelope(
      { toolName: 'search', params: { q: 'hello' } },
      SAMPLE_INTERFACE_CID,
    );
    const receipt = buildReceipt(env, { results: ['a', 'b'] });
    expect(receipt.envelope_cid).toMatch(/^sha256:/);
    expect(receipt.output_cid).toMatch(/^sha256:/);
    expect(typeof receipt.issuedAt).toBe('string');
  });

  it('produces a stable output_cid for the same output', () => {
    const env = buildEnvelope(
      { toolName: 'search', params: {} },
      SAMPLE_INTERFACE_CID,
    );
    const output = { results: [1, 2, 3] };
    const r1 = buildReceipt(env, output);
    const r2 = buildReceipt(env, output);
    expect(r1.output_cid).toBe(r2.output_cid);
  });

  it('signs the receipt when a signer DID is provided', () => {
    const keystore = new DIDKeystore();
    const signerDID = keystore.generateKey();
    const env = buildEnvelope(
      { toolName: 'search', params: {} },
      SAMPLE_INTERFACE_CID,
    );
    const receipt = buildReceipt(env, { result: 42 }, undefined, signerDID, keystore);
    expect(receipt.signature).toBeDefined();
    expect(receipt.signerDID).toBe(signerDID);
  });

  it('computeReceiptCID returns a stable sha256: CID', () => {
    const env = buildEnvelope(
      { toolName: 'search', params: {} },
      SAMPLE_INTERFACE_CID,
    );
    const receipt = buildReceipt(env, { result: 42 });
    const cid = computeReceiptCID(receipt);
    expect(cid).toMatch(/^sha256:/);
    expect(cid).toBe(computeReceiptCID(receipt)); // stable
  });
});

describe('computeCID', () => {
  it('produces sha256: prefixed hex', () => {
    const cid = computeCID(Buffer.from('hello'));
    expect(cid).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeCID('hello')).toBe(computeCID('hello'));
  });

  it('differs for different inputs', () => {
    expect(computeCID('hello')).not.toBe(computeCID('world'));
  });
});
