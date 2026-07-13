const PROFILE_H_CAPABILITY = 'mcp++/x402-payments';
const PROFILE_H_VERSION = '1.0';
const PROFILE_H_METHODS = new Set([
  'mcp++/payments/profile', 'mcp++/payments/catalog', 'mcp++/payments/quote', 'mcp++/payments/verify',
  'mcp++/payments/settle', 'mcp++/payments/receipt/get', 'mcp++/payments/entitlement/get',
  'mcp++/payments/usage/get', 'mcp++/payments/refund/request', 'mcp++/payments/reconcile',
]);
const REQUEST_HEADERS = new Set(['accept', 'content-type', 'idempotency-key', 'payment-signature', 'traceparent', 'tracestate']);
const RESPONSE_HEADERS = new Set(['content-type', 'etag', 'payment-required', 'payment-response', 'retry-after']);
const DEFAULT_PROBE_TTL_MS = 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

class ProfileHAdapterError extends Error {
  constructor(code, message, data = {}) { super(message); this.code = code; this.data = data; }
}
function profileHEndpointForService(service, env = process.env) {
  const name = String(service || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return String(env[`MCPPLUSPLUS_PROFILE_H_${name}_ENDPOINT`] ?? env.MCPPLUSPLUS_PROFILE_H_ENDPOINT ?? '').trim();
}
function createProfileHAdapter({
  service,
  endpoint = profileHEndpointForService(service),
  fetchImpl = globalThis.fetch,
  probeTtlMs = DEFAULT_PROBE_TTL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  if (!Number.isFinite(probeTtlMs) || probeTtlMs < 0) throw new TypeError('probeTtlMs must be a non-negative finite number.');
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) throw new TypeError('requestTimeoutMs must be a positive finite number.');
  if (typeof now !== 'function') throw new TypeError('now must be a function.');
  const baseUrl = normalizeEndpoint(endpoint);
  let cached = { ...unavailable('MCP++ Profile H is not configured for this adapter.', { configured: false }, now()), checkedAt: 0 };
  let probeInFlight = null;
  async function availability({ force = false } = {}) {
    if (!baseUrl) return cached;
    if (!force && cached.checkedAt > 0 && now() - cached.checkedAt < probeTtlMs) return cached;
    if (probeInFlight) return probeInFlight;
    probeInFlight = (async () => {
      try {
        const response = await request('GET', '/mcp/payments/profile');
        const readinessErrors = profileHReadinessErrors(response.body);
        cached = response.ok && readinessErrors.length === 0
          ? { checkedAt: now(), available: true, profile: response.body, error: null }
          : unavailable('Configured Profile H endpoint is not ready.', {
              configured: true,
              endpoint: baseUrl,
              status: response.status,
              readinessErrors,
            }, now());
      } catch (error) {
        cached = unavailable('Configured Profile H endpoint could not be reached.', {
          configured: true,
          endpoint: baseUrl,
          cause: error instanceof Error ? error.message : String(error),
        }, now());
      } finally {
        probeInFlight = null;
      }
      return cached;
    })();
    return probeInFlight;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`Profile H request timed out after ${requestTimeoutMs}ms.`)), requestTimeoutMs);
    const init = { method, headers: outgoing, signal: controller.signal };
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      outgoing['content-type'] ??= 'application/json';
      init.body = JSON.stringify(body);
    }
    try {
      const response = await fetchImpl(resolveEndpointRoute(baseUrl, route), init);
      const text = await response.text();
      return { ok: response.ok, status: response.status, headers: Object.fromEntries(response.headers.entries()), body: parseJson(text) ?? (text ? { raw: text } : {}) };
    } finally {
      clearTimeout(timeout);
    }
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
  if (method === 'mcp++/payments/receipt/get') return { method: 'GET', path: withRequestContext(`/mcp/payments/receipts/${requiredId(body, 'receipt_cid')}`, body) };
  if (method === 'mcp++/payments/entitlement/get') return { method: 'GET', path: withRequestContext(`/mcp/payments/entitlements/${requiredId(body, 'entitlement_cid')}`, body) };
  if (method === 'mcp++/payments/usage/get') return { method: 'GET', path: withRequestContext(`/mcp/payments/usage/${requiredId(body, 'usage_cid')}`, body) };
  throw new ProfileHAdapterError(-32601, `Unsupported Profile H method ${method}`);
}
function requiredId(params, key) { const value = params[key] ?? params[key.split('_')[0] + key.split('_').slice(1).map(part => part[0].toUpperCase() + part.slice(1)).join('')] ?? params.cid; if (typeof value !== 'string' || !value.trim()) throw new ProfileHAdapterError(-32602, `${key} or cid is required.`); return encodeURIComponent(value); }
function withRequestContext(path, params) {
  const raw = params.requestContext ?? params.request_context ?? params;
  const context = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const query = new URLSearchParams();
  for (const [camel, snake] of [['requestCid', 'request_cid'], ['idempotencyKey', 'idempotency_key'], ['entitlementCid', 'entitlement_cid']]) {
    const value = context[camel] ?? context[snake];
    if (typeof value === 'string' && value) query.set(camel, value);
  }
  for (const [camel, snake] of [['authorized', 'authorized'], ['policyAllowed', 'policy_allowed']]) {
    const value = context[camel] ?? context[snake];
    if (typeof value === 'boolean') query.set(camel, String(value));
  }
  if (context.attributes && typeof context.attributes === 'object' && !Array.isArray(context.attributes)) {
    query.set('attributes', JSON.stringify(context.attributes));
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}
function profileHReadinessErrors(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return ['profile response must be an object'];
  if (profile.profile !== PROFILE_H_CAPABILITY) errors.push(`profile must be ${PROFILE_H_CAPABILITY}`);
  if (profile.version !== PROFILE_H_VERSION) errors.push(`version must be ${PROFILE_H_VERSION}`);
  if (profile.ready !== true) errors.push('seller must report ready=true');
  if (typeof profile.sellerDid !== 'string' || !profile.sellerDid) errors.push('sellerDid is required');
  if (typeof profile.catalogCid !== 'string' || !profile.catalogCid) errors.push('catalogCid is required');
  if (!Array.isArray(profile.methods)) errors.push('methods must be an array');
  else for (const method of PROFILE_H_METHODS) if (!profile.methods.includes(method)) errors.push(`missing method ${method}`);
  if (!Array.isArray(profile.transports)) errors.push('transports must be an array');
  else for (const transport of ['http', 'libp2p']) if (!profile.transports.includes(transport)) errors.push(`missing transport ${transport}`);
  if (profile.durability?.ledger !== 'durable') errors.push('ledger must be durable');
  if (profile.durability?.artifactStore !== 'content-addressed') errors.push('artifact store must be content-addressed');
  if (profile.durability?.reconciliation !== true) errors.push('reconciliation must be enabled');
  if (profile.facilitator?.ready !== true) errors.push('facilitator must report ready=true');
  if (profile.mode === 'local-test') {
    if (profile.upstreamX402HttpConformance !== false) errors.push('local-test sellers must report upstreamX402HttpConformance=false');
  } else if (profile.mode !== 'facilitator' || profile.upstreamX402HttpConformance !== true) {
    errors.push('facilitator sellers must report upstreamX402HttpConformance=true');
  }
  return errors;
}
function isReadyProfile(profile) { return profileHReadinessErrors(profile).length === 0; }
function normalizeEndpoint(value) { if (!value) return ''; let url; try { url = new URL(value); } catch { throw new Error('MCP++ Profile H endpoint must be an absolute http(s) URL.'); } if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('MCP++ Profile H endpoint must be an unauthenticated http(s) URL.'); if (url.search || url.hash) throw new Error('MCP++ Profile H endpoint must be configured without query or fragment components.'); return url.toString().replace(/\/$/, ''); }
function resolveEndpointRoute(endpoint, route) { const base = new URL(`${endpoint}/`); const requested = new URL(String(route), 'http://profile-h.invalid'); base.pathname = `${base.pathname.replace(/\/$/, '')}/${requested.pathname.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/'); base.search = requested.search; base.hash = ''; return base.toString(); }
function filterHeaders(headers, allowed) { const source = headers?.entries ? Object.fromEntries(headers.entries()) : headers || {}; return Object.fromEntries(Object.entries(source).filter(([key, value]) => allowed.has(key.toLowerCase()) && value !== undefined).map(([key, value]) => [key.toLowerCase(), String(value)])); }
function parseJson(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }
function unavailable(message, data, checkedAt = Date.now()) { return { checkedAt, available: false, profile: null, error: { message, data } }; }
function unavailableError(state) { return new ProfileHAdapterError(-32070, state.error.message, state.error.data); }
function responseError(response, method) { const body = response.body && typeof response.body === 'object' ? response.body : {}; const nested = body.error && typeof body.error === 'object' ? body.error : {}; const symbolic = typeof body.error === 'string' ? body.error : typeof body.code === 'string' ? body.code : undefined; const numericCode = typeof body.code === 'number' ? body.code : typeof nested.code === 'number' ? nested.code : -32070; return new ProfileHAdapterError(numericCode, String(body.message ?? nested.message ?? symbolic ?? `Profile H endpoint returned HTTP ${response.status} for ${method}.`), { status: response.status, profileHCode: symbolic, response: body }); }
module.exports = { PROFILE_H_CAPABILITY, PROFILE_H_METHODS, PROFILE_H_VERSION, ProfileHAdapterError, createProfileHAdapter, isReadyProfile, profileHReadinessErrors, profileHEndpointForService };
