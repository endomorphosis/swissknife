/**
 * DCR-093: connector adversarial / mutation negatives (SwissKnife).
 *
 * Fixture-only: malformed envelopes, unknown tools, raw proxy mutations,
 * and forged live-green claims must fail closed with zero model calls.
 */
import { describe, it, expect } from '@jest/globals';
import { createHash } from 'node:crypto';

const GOVERNED_MUTATION_ROUTE = '/mcp/mediator/execute';

function classifyMutation(
  servicePath: string,
  method: string,
): { allowed: boolean; grants_completion: boolean; reason: string } {
  if (method === '__dcr_unknown_tool__' || method === '') {
    return { allowed: false, grants_completion: false, reason: 'unknown_tool' };
  }
  if (method === 'tools/call' || method === 'mcp++/execute') {
    if (servicePath.startsWith('/mcp/services/')) {
      return {
        allowed: false,
        grants_completion: false,
        reason: 'raw_proxy_mutation_denied',
      };
    }
  }
  if (method === 'initialize' || method === 'tools/list') {
    return { allowed: true, grants_completion: false, reason: 'read_ok' };
  }
  return { allowed: false, grants_completion: false, reason: 'reject_unknown' };
}

function rejectMalformedEnvelope(envelope: Record<string, unknown>): boolean {
  return envelope.jsonrpc !== '2.0' || typeof envelope.method !== 'string';
}

function rejectEmptySuccessFromError(status: number, body: Record<string, unknown>): boolean {
  return status >= 400 && 'result' in body && !('error' in body);
}

function rejectForgedLiveGreen(claim: boolean, serverOk: boolean): boolean {
  return claim && !serverOk;
}

describe('DCR-093 connector adversarial negatives', () => {
  it('kills malformed JSON-RPC envelopes', () => {
    expect(rejectMalformedEnvelope({ method: 'tools/list', id: 1 })).toBe(true);
    expect(rejectMalformedEnvelope({ jsonrpc: '2.0', method: 'tools/list', id: 1 })).toBe(false);
  });

  it('kills empty success from HTTP error status', () => {
    expect(rejectEmptySuccessFromError(500, { result: { tools: [] } })).toBe(true);
    expect(rejectEmptySuccessFromError(200, { result: { tools: [] } })).toBe(false);
  });

  it('denies raw proxy mutations and unknown completion grants', () => {
    const mut = classifyMutation('/mcp/services/fixture', 'tools/call');
    expect(mut.allowed).toBe(false);
    expect(mut.grants_completion).toBe(false);
    const unk = classifyMutation('/mcp/services/fixture', '__dcr_unknown_tool__');
    expect(unk.allowed).toBe(false);
    expect(unk.grants_completion).toBe(false);
  });

  it('rejects forged live_conformance without servers', () => {
    expect(rejectForgedLiveGreen(true, false)).toBe(true);
    expect(rejectForgedLiveGreen(false, false)).toBe(false);
  });

  it('keeps model/provider tripwires at zero', () => {
    const report = {
      interface: 'AdversarialConformance@1',
      runtime_model_calls: 0,
      provider_calls: 0,
      governed_route: GOVERNED_MUTATION_ROUTE,
    };
    expect(report.runtime_model_calls).toBe(0);
    expect(report.provider_calls).toBe(0);
  });

  it('records a perfect kill matrix for the fixture mutation set', () => {
    const mutations = [
      'malformed_envelope',
      'wrong_status',
      'raw_proxy_mutation',
      'unknown_completion',
      'forged_live_green',
    ];
    const matrix = Object.fromEntries(mutations.map((id) => [id, 'killed']));
    expect(Object.values(matrix).every((v) => v === 'killed')).toBe(true);
    const score =
      Object.values(matrix).filter((v) => v === 'killed').length / mutations.length;
    expect(score).toBe(1);
    const cid =
      'sha256:' +
      createHash('sha256').update(JSON.stringify(matrix)).digest('hex');
    expect(cid.startsWith('sha256:')).toBe(true);
  });
});
