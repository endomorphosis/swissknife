import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { createProfileHAdapter, profileHEndpointForService, profileHReadinessErrors } = require('../../scripts/mcpplusplus-profile-h-adapter.cjs');
const { profileEInitializeResult } = require('../../scripts/mcpplusplus-profile-e-http.cjs');
const methods = ['mcp++/payments/profile','mcp++/payments/catalog','mcp++/payments/quote','mcp++/payments/verify','mcp++/payments/settle','mcp++/payments/receipt/get','mcp++/payments/entitlement/get','mcp++/payments/usage/get','mcp++/payments/refund/request','mcp++/payments/reconcile'];
const profile = { profile: 'mcp++/x402-payments', version: '1.0', ready: true, sellerDid: 'did:web:seller.test', catalogCid: 'baguqcatalog', methods, transports: ['http','libp2p'], mode: 'local-test', upstreamX402HttpConformance: false, durability: { ledger: 'durable', artifactStore: 'content-addressed', reconciliation: true }, facilitator: { ready: true } };
function response(body: unknown, status = 200, headers: Record<string,string> = {}) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }); }
describe('Profile H compatibility adapter', () => {
  it('uses service-specific configuration before the common fallback', () => {
    expect(profileHEndpointForService('ipfs-kit.py', {
      MCPPLUSPLUS_PROFILE_H_IPFS_KIT_PY_ENDPOINT: 'https://kit.example',
      MCPPLUSPLUS_PROFILE_H_ENDPOINT: 'https://common.example',
    })).toBe('https://kit.example');
    expect(profileHEndpointForService('unlisted', { MCPPLUSPLUS_PROFILE_H_ENDPOINT: 'https://common.example' })).toBe('https://common.example');
  });

  it('is typed-unavailable and unadvertisable without a configured seller', async () => {
    const adapter = createProfileHAdapter({ service: 'ipfs_kit_py', endpoint: '' });
    await expect(adapter.isAvailable()).resolves.toBe(false);
    await expect(adapter.call('mcp++/payments/catalog')).rejects.toMatchObject({ code: -32070, data: { configured: false } });
    await expect(adapter.handleHttp({ method: 'GET', path: '/mcp/payments/catalog' })).resolves.toMatchObject({
      status: 503,
      body: { error: 'H_PROFILE_UNAVAILABLE', configured: false },
    });
  });

  it('requires complete durable HTTP/libp2p readiness and honest local-test labeling', async () => {
    for (const invalid of [
      { ...profile, durability: { ...profile.durability, ledger: 'ephemeral' } },
      { ...profile, upstreamX402HttpConformance: true },
      { ...profile, facilitator: { ready: false } },
      { ...profile, mode: 'fixture' },
      { ...profile, methods: methods.slice(1) },
      { ...profile, transports: ['http'] },
    ]) {
      const adapter = createProfileHAdapter({ endpoint: 'http://seller.test', fetchImpl: async () => response(invalid) });
      await expect(adapter.isAvailable()).resolves.toBe(false);
      const state = await adapter.availability();
      expect(state.error.data.readinessErrors.length).toBeGreaterThan(0);
    }
    expect(profileHReadinessErrors({ ...profile, mode: 'facilitator', upstreamX402HttpConformance: true })).toEqual([]);
  });
  it('advertises only a ready seller that the client explicitly requested', () => { const requested = { capabilities: { experimental: { 'mcp++/x402-payments': true } } }; expect(profileEInitializeResult({ name: 'seller', version: '1', request: requested, supportsX402Payments: true }).capabilities.experimental).toHaveProperty('mcp++/x402-payments', true); expect(profileEInitializeResult({ name: 'seller', version: '1', request: requested, supportsX402Payments: false }).capabilities.experimental).not.toHaveProperty('mcp++/x402-payments'); });
  it('forwards every control method and only payment-safe headers', async () => {
    const calls: Array<{ method: string; path: string; search: string; headers: Record<string,string> }> = [];
    const adapter = createProfileHAdapter({ endpoint: 'http://seller.test', fetchImpl: async (url: string, init: RequestInit) => { const parsed = new URL(url); const path = parsed.pathname; calls.push({ method: String(init.method), path, search: parsed.search, headers: init.headers as Record<string,string> }); if (path === '/mcp/payments/profile') return response(profile); if (path === '/mcp/payments/quote') return response({ quoteCid: 'quote' }, 402, { 'payment-required': 'required' }); return response({ path }); } });
    const requestContext = { requestCid: 'baguq-request', idempotencyKey: 'request-1', authorized: true, policyAllowed: true, attributes: { subject: 'did:key:buyer' } };
    await adapter.call('mcp++/payments/catalog'); await adapter.call('mcp++/payments/verify', {}); await adapter.call('mcp++/payments/settle', {}); await adapter.call('mcp++/payments/receipt/get', { receipt_cid: 'receipt', requestContext }); await adapter.call('mcp++/payments/entitlement/get', { entitlementCid: 'entitlement', requestContext }); await adapter.call('mcp++/payments/usage/get', { usage_cid: 'usage', requestContext }); await adapter.call('mcp++/payments/refund/request', {}); await adapter.call('mcp++/payments/reconcile', {});
    const quote = await adapter.handleHttp({ method: 'POST', path: '/mcp/payments/quote', body: {}, headers: { authorization: 'secret', 'payment-signature': 'signed', 'idempotency-key': 'key' } });
    expect(quote).toMatchObject({ status: 402, headers: { 'payment-required': 'required' } }); expect(calls.at(-1)!.headers).not.toHaveProperty('authorization'); expect(calls.map(c => `${c.method} ${c.path}`)).toEqual(expect.arrayContaining(['GET /mcp/payments/catalog','POST /mcp/payments/verify','POST /mcp/payments/settle','GET /mcp/payments/receipts/receipt','GET /mcp/payments/entitlements/entitlement','GET /mcp/payments/usage/usage','POST /mcp/payments/refunds','POST /mcp/payments/reconcile']));
    const receiptCall = calls.find(call => call.path.endsWith('/receipts/receipt'))!;
    const receiptQuery = new URLSearchParams(receiptCall.search);
    expect(Object.fromEntries(receiptQuery)).toMatchObject({
      requestCid: 'baguq-request', idempotencyKey: 'request-1', authorized: 'true', policyAllowed: 'true',
      attributes: JSON.stringify({ subject: 'did:key:buyer' }),
    });
  });

  it('preserves an endpoint path prefix and coalesces concurrent readiness probes', async () => {
    let probes = 0;
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const paths: string[] = [];
    const adapter = createProfileHAdapter({
      endpoint: 'https://seller.test/control-plane',
      fetchImpl: async (url: string) => {
        paths.push(new URL(url).pathname);
        probes += 1;
        await waiting;
        return response(profile);
      },
    });
    const first = adapter.isAvailable();
    const second = adapter.isAvailable();
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(probes).toBe(1);
    expect(paths).toEqual(['/control-plane/mcp/payments/profile']);
  });

  it('expires readiness and reports typed nested seller errors', async () => {
    let now = 1;
    let profileCalls = 0;
    const adapter = createProfileHAdapter({
      endpoint: 'https://seller.test',
      probeTtlMs: 10,
      now: () => now,
      fetchImpl: async (url: string) => {
        const path = new URL(url).pathname;
        if (path === '/mcp/payments/profile') { profileCalls += 1; return response(profile); }
        return response({ error: { code: -32082, message: 'settlement pending', data: { retryable: true } } }, 409);
      },
    });
    await expect(adapter.isAvailable()).resolves.toBe(true);
    now = 5;
    await expect(adapter.isAvailable()).resolves.toBe(true);
    expect(profileCalls).toBe(1);
    now = 20;
    await expect(adapter.call('mcp++/payments/settle', {})).rejects.toMatchObject({
      code: -32082,
      message: 'settlement pending',
      data: { status: 409 },
    });
    expect(profileCalls).toBe(2);
  });

  it('rejects ambiguous endpoints and non-payment HTTP paths', async () => {
    expect(() => createProfileHAdapter({ endpoint: 'https://seller.test?token=secret' })).toThrow(/without query or fragment/i);
    const adapter = createProfileHAdapter({ endpoint: '' });
    await expect(adapter.handleHttp({ method: 'GET', path: '/mcp/tools' })).rejects.toMatchObject({ code: -32602 });
  });
});
