const PROFILE_H_CAPABILITY = 'mcp++/x402-payments';
const PROFILE_H_VERSION = '1.0';
const PROFILE_H_METHODS = new Set([
  'mcp++/payments/profile', 'mcp++/payments/catalog', 'mcp++/payments/quote', 'mcp++/payments/verify',
  'mcp++/payments/settle', 'mcp++/payments/receipt/get', 'mcp++/payments/entitlement/get',
  'mcp++/payments/usage/get', 'mcp++/payments/refund/request', 'mcp++/payments/reconcile',
]);
const REQUEST_HEADERS = new Set(['accept', 'content-type', 'idempotency-key', 'payment-signature', 'traceparent', 'tracestate']);
const RESPONSE_HEADERS = new Set(['content-type', 'etag', 'payment-required', 'payment-response', 'retry-after']);

class ProfileHAdapterError extends Error {
  constructor(code, message, data = {}) { super(message); this.code = code; this.data = data; }
}
function profileHEndpointForService(service, env = process.env) {
  const name = String(service || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return String(env[`MCPPLUSPLUS_PROFILE_H_${name}_ENDPOINT`] ?? env.MCPPLUSPLUS_PROFILE_H_ENDPOINT ?? '').trim();
}
function createProfileHAdapter({ service, endpoint = profileHEndpointForService(service), fetchImpl = globalThis.fetch } = {}) {
  const baseUrl = normalizeEndpoint(endpoint);
  let cached = { ...unavailable('MCP++ Profile H is not configured for this adapter.', { configured: false }), checkedAt: 0 };
  async function availability({ force = false } = {}) {
    if (!baseUrl) return cached;
    if (!force && cached.checkedAt > 0 && Date.now() - cached.checkedAt < 1000) return cached;
    try {
      const response = await request('GET', '/mcp/payments/profile');
      cached = response.ok && isReadyProfile(response.body)
        ? { checkedAt: Date.now(), available: true, profile: response.body, error: null }
        : unavailable('Configured Profile H endpoint is not ready.', { configured: true, endpoint: baseUrl, status: response.status });
    } catch (error) {
      cached = unavailable('Configured Profile H endpoint could not be reached.', { configured: true, endpoint: baseUrl, cause: error instanceof Error ? error.message : String(error) });
    }
    return cached;
  }
  async function call(method, params = {}) {
    if (!PROFILE_H_METHODS.has(method)) throw new ProfileHAdapterError(-32601, `Unsupported Profile H method ${method}`);
    const state = await availability(); if (!state.available) throw unavailableError(state);
    const binding = bindingFor(method, params);
    const response = await request(binding.method, binding.path, { body: binding.body });
    if (!response.ok) throw responseError(response, method);
    return response.body;
  }
  async function handleHttp({ method, path, search = '', body, headers = {} }) {
    if (!String(path).startsWith('/mcp/payments/')) throw new ProfileHAdapterError(-32602, 'Profile H requests must target /mcp/payments/.');
    const state = await availability({ force: path === '/mcp/payments/profile' });
    if (!state.available) return { status: 503, headers: { 'content-type': 'application/json' }, body: { error: 'H_PROFILE_UNAVAILABLE', message: state.error.message, ...state.error.data } };
    const response = await request(method, `${path}${search}`, { body, headers: filterHeaders(headers, REQUEST_HEADERS) });
    return { status: response.status, headers: filterHeaders(response.headers, RESPONSE_HEADERS), body: response.body };
  }
  async function request(method, route, { body, headers = {} } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch is required for the Profile H bridge');
    const outgoing = { accept: 'application/json', ...headers };
    const init = { method, headers: outgoing, signal: AbortSignal.timeout(15_000) };
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') { outgoing['content-type'] ??= 'application/json'; init.body = JSON.stringify(body); }
    const response = await fetchImpl(new URL(route, `${baseUrl}/`).toString(), init);
    const text = await response.text();
    return { ok: response.ok, status: response.status, headers: Object.fromEntries(response.headers.entries()), body: parseJson(text) ?? (text ? { raw: text } : {}) };
  }
  return { service, endpoint: baseUrl, availability, isAvailable: async () => (await availability()).available,
    profile: async () => { const state = await availability(); if (!state.available) throw unavailableError(state); return state.profile; }, call, handleHttp };
}
function bindingFor(method, params) {
  const body = params && typeof params === 'object' ? params : {};
  const map = {
    'mcp++/payments/profile': ['GET', '/mcp/payments/profile'], 'mcp++/payments/catalog': ['GET', '/mcp/payments/catalog'],
    'mcp++/payments/quote': ['POST', '/mcp/payments/quote'], 'mcp++/payments/verify': ['POST', '/mcp/payments/verify'],
    'mcp++/payments/settle': ['POST', '/mcp/payments/settle'], 'mcp++/payments/refund/request': ['POST', '/mcp/payments/refunds'],
    'mcp++/payments/reconcile': ['POST', '/mcp/payments/reconcile'],
  };
  if (map[method]) return { method: map[method][0], path: map[method][1], body: map[method][0] === 'POST' ? body : undefined };
  if (method === 'mcp++/payments/receipt/get') return { method: 'GET', path: `/mcp/payments/receipts/${requiredId(body, 'receipt_cid')}` };
  if (method === 'mcp++/payments/entitlement/get') return { method: 'GET', path: `/mcp/payments/entitlements/${requiredId(body, 'entitlement_cid')}` };
  if (method === 'mcp++/payments/usage/get') return { method: 'GET', path: `/mcp/payments/usage/${requiredId(body, 'usage_cid')}` };
  throw new ProfileHAdapterError(-32601, `Unsupported Profile H method ${method}`);
}
function requiredId(params, key) { const value = params[key] ?? params.cid; if (typeof value !== 'string' || !value) throw new ProfileHAdapterError(-32602, `${key} or cid is required.`); return encodeURIComponent(value); }
function isReadyProfile(profile) {
  if (!profile || profile.profile !== PROFILE_H_CAPABILITY || profile.version !== PROFILE_H_VERSION || profile.ready !== true || typeof profile.sellerDid !== 'string' || !profile.sellerDid || typeof profile.catalogCid !== 'string' || !profile.catalogCid || !Array.isArray(profile.methods) || !Array.isArray(profile.transports) || profile.durability?.ledger !== 'durable' || profile.durability?.artifactStore !== 'content-addressed' || profile.durability?.reconciliation !== true || profile.facilitator?.ready !== true) return false;
  if (profile.mode === 'local-test' ? profile.upstreamX402HttpConformance !== false : profile.mode !== 'facilitator' || profile.upstreamX402HttpConformance !== true) return false;
  const methods = new Set(profile.methods), transports = new Set(profile.transports);
  return [...PROFILE_H_METHODS].every(method => methods.has(method)) && transports.has('http') && transports.has('libp2p');
}
function normalizeEndpoint(value) { if (!value) return ''; let url; try { url = new URL(value); } catch { throw new Error('MCP++ Profile H endpoint must be an absolute http(s) URL.'); } if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('MCP++ Profile H endpoint must be an unauthenticated http(s) URL.'); return url.toString().replace(/\/$/, ''); }
function filterHeaders(headers, allowed) { const source = headers?.entries ? Object.fromEntries(headers.entries()) : headers || {}; return Object.fromEntries(Object.entries(source).filter(([key, value]) => allowed.has(key.toLowerCase()) && value !== undefined).map(([key, value]) => [key.toLowerCase(), String(value)])); }
function parseJson(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }
function unavailable(message, data) { return { checkedAt: Date.now(), available: false, profile: null, error: { message, data } }; }
function unavailableError(state) { return new ProfileHAdapterError(-32070, state.error.message, state.error.data); }
function responseError(response, method) { const body = response.body && typeof response.body === 'object' ? response.body : {}; return new ProfileHAdapterError(typeof body.code === 'number' ? body.code : -32070, String(body.message ?? body.error ?? `Profile H endpoint returned HTTP ${response.status} for ${method}.`), { status: response.status, response: body }); }
module.exports = { PROFILE_H_CAPABILITY, PROFILE_H_METHODS, PROFILE_H_VERSION, ProfileHAdapterError, createProfileHAdapter, profileHEndpointForService };
