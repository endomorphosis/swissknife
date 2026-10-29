'use strict';

const { randomUUID, createHash } = require('node:crypto');
const { stableStringify } = require('./mcpplusplus-profile-a.cjs');
const SDK_CLASS = 'ipfs_kit_py.assurance.pinned_ipfs.LivePinnedIpfsAdapter';
const BACKEND = 'ipfs_kit_py.assurance.pinned_ipfs:live-kubo-http';
const NATIVE_DOMAIN_TOOLS = new Set(['ipfs_cat', 'ipfs_add', 'node_id', 'swarm_peers', 'ipfs_pubsub_publish']);
const PUBSUB_BACKEND = 'ipfs_kit_py.assurance.pinned_pubsub:live-kubo-http';
const PUBSUB_CLASS = 'ipfs_kit_py.assurance.pinned_pubsub.LivePinnedPubsubAdapter';
const NODE_CONTROL_TOOLS = new Set(['tools_list_categories', 'tools_list_tools', 'tools_get_schema', 'tools_dispatch',
  'artifacts_put', 'artifacts_get', 'dag_append', 'dag_history']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const requireValue = (value, message) => { if (!value) throw new Error(message); };

function safeErrorText(value) {
  return value.split(/(?:^|\n)(?:Traceback\b|\s*File ["']|\s*at\s)/)[0].slice(0, 2048)
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/(?:\/home\/|\/Users\/)[^\s"']+/g, '[private path]');
}

// Keep typed protocol diagnostics only, never native payloads or tracebacks.
function nativeKitError(value, fallback = 'native_kit_tool_error') {
  const pending = [value], seen = new Set(); let plainText;
  while (pending.length && seen.size < 64) {
    const current = pending.shift();
    if (!object(current) || seen.has(current)) continue;
    seen.add(current);
    const nested = object(current.error) ? current.error : null;
    const message = typeof current.error === 'string' ? current.error
      : typeof nested?.message === 'string' ? nested.message
        : typeof current.message === 'string' ? current.message : null;
    if (message) {
      const details = { message: safeErrorText(message) || fallback };
      const code = nested?.code ?? current.code;
      if (typeof code === 'number' && Number.isFinite(code)) details.code = code;
      else if (typeof code === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(code)) details.code = code;
      const type = nested?.type ?? current.error_type ?? current.type;
      if (typeof type === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(type)) details.type = type;
      return details;
    }
    for (const key of ['error', 'result', 'response', 'owner_error']) if (object(current[key])) pending.push(current[key]);
    for (const item of Array.isArray(current.content) ? current.content.slice(0, 24) : []) {
      if (!object(item)) continue;
      if (object(item.json)) pending.push(item.json);
      if (typeof item.text === 'string') {
        const text = item.text.slice(0, 8192);
        try { pending.push(JSON.parse(text)); }
        catch { if (!/^\s*[\[{]/.test(text)) plainText ??= safeErrorText(text); }
      }
    }
  }
  return { message: plainText || fallback };
}

function nativeKitCatalog(nativeTools, legacyTools) {
  requireValue(Array.isArray(nativeTools) && nativeTools.length <= NATIVE_DOMAIN_TOOLS.size,
    'native_kit_invalid_tool_catalog');
  const seen = new Set();
  for (const tool of nativeTools) {
    requireValue(object(tool) && NATIVE_DOMAIN_TOOLS.has(tool.name) && !seen.has(tool.name)
      && object(tool.inputSchema) && tool.inputSchema.type === 'object', 'native_kit_invalid_tool_descriptor');
    seen.add(tool.name);
  }
  return [...legacyTools.filter(tool => NODE_CONTROL_TOOLS.has(tool.name)), ...nativeTools];
}

// This executor has no cache, artifact store, direct Kubo or legacy Python
// callback. A configured native authority either executes or returns an error.
function createNativeKitForwarder({ endpoint, fetchImpl = globalThis.fetch, timeoutMs = 30000, maxBytes = 2 * 1024 * 1024 } = {}) {
  const target = new URL(endpoint);
  requireValue(target.protocol === 'http:' && target.hostname === '127.0.0.1'
    && Number(target.port) >= 1024 && !target.username && !target.password
    && target.pathname === '/mcp' && !target.search && !target.hash,
  'Native Kit upstream must be a credential-free IPv4 loopback /mcp endpoint.');
  requireValue(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120000
    && Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 4 * 1024 * 1024,
  'Native Kit request bounds are invalid.');

  async function jsonRequest(url, options) {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    requireValue(response.ok, `native_kit_http_${response.status}`);
    const reader = response.body?.getReader();
    requireValue(reader, 'native_kit_response_body_missing');
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        requireValue(size <= maxBytes, 'native_kit_response_limit');
        chunks.push(Buffer.from(value));
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('native_kit_invalid_json'); }
    requireValue(object(body), 'native_kit_invalid_envelope');
    return body;
  }

  async function rpc(method, params) {
    const id = `native-kit:${randomUUID()}`;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    requireValue(Buffer.byteLength(body) <= maxBytes, 'native_kit_request_limit');
    const response = await jsonRequest(target.href, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    requireValue(response.jsonrpc === '2.0' && response.id === id, 'native_kit_rpc_identity_mismatch');
    if (response.error) {
      const details = nativeKitError(response.error, `native_kit_rpc_error:${Number.isInteger(response.error.code) ? response.error.code : 'unknown'}`);
      throw Object.assign(new Error(details.message), { native_error: details });
    }
    requireValue(object(response.result), 'native_kit_result_missing');
    return response.result;
  }

  async function execute(name, args = {}) {
    try {
      requireValue(typeof name === 'string' && name.length > 0 && object(args), 'native_kit_invalid_call');
      requireValue(NATIVE_DOMAIN_TOOLS.has(name), 'native_kit_unsupported_tool');
      const native = await rpc('tools/call', { name, arguments: args });
      if (native.isError === true) {
        const details = nativeKitError(native);
        return { ok: false, error: details.message, native_error: details };
      }
      requireValue(Array.isArray(native.content) && native.content.length === 1
        && native.content[0]?.type === 'json' && object(native.content[0].json), 'native_kit_ambiguous_tool_result');
      const result = native.content[0].json;
      if (name === 'ipfs_pubsub_publish') {
        requireValue(result.success === true && result.accepted === true && result.durable === false
          && result.delivery_state === 'delivered' && typeof result.replayed === 'boolean' && !result.error
          && result.schema === 'swissknife.native-pubsub-exchange.v1' && result.backend === PUBSUB_BACKEND,
          'native_pubsub_execution_not_acknowledged');
        const provenance = result.native_provenance;
        requireValue(object(provenance) && provenance.schema === 'swissknife.native-kit-pubsub-execution.v1'
          && provenance.owner === 'ipfs_kit_py' && provenance.sdk_class === PUBSUB_CLASS
          && provenance.sdk_method === 'pubsub_publish' && provenance.simulated === false
          && provenance.cache_fallback === false && provenance.durable === false && provenance.state === 'ACCEPTED'
          && provenance.effect_kind === 'EXTERNAL_NOTIFY' && provenance.transport === 'http'
          && provenance.work_complete === false && provenance.completion_authority === false
          && typeof provenance.sdk_request_id === 'string' && provenance.sdk_request_id.length > 0
          && typeof provenance.sdk_operation_id === 'string' && provenance.sdk_operation_id.length > 0
          && /^[a-f0-9]{64}$/.test(provenance.sdk_source_sha256 || '')
          && /^[a-f0-9]{64}$/.test(provenance.bridge_source_sha256 || '')
          && /^[a-f0-9]{64}$/.test(provenance.service_source_sha256 || ''), 'native_pubsub_provenance_missing');
        requireValue(object(native.receipt) && native.receipt.owner === 'ipfs_kit_py'
          && native.receipt.tool === name && native.receipt.status === 'ok'
          && stableStringify(native.receipt.native_provenance) === stableStringify(provenance), 'native_pubsub_receipt_mismatch');
        return { ok: true, result, native_receipt: native.receipt };
      }
      requireValue(result.success === true && !result.error && result.backend === BACKEND, 'native_kit_execution_not_acknowledged');
      const provenance = result.native_provenance;
      requireValue(object(provenance) && provenance.schema === 'swissknife.native-kit-execution.v1'
        && provenance.owner === 'ipfs_kit_py' && provenance.sdk_class === SDK_CLASS
        && provenance.simulated === false && provenance.cache_fallback === false
        && typeof provenance.sdk_request_id === 'string' && provenance.sdk_request_id.length > 0
        && typeof provenance.sdk_operation_id === 'string' && provenance.sdk_operation_id.length > 0
        && /^[a-f0-9]{64}$/.test(provenance.sdk_source_sha256 || ''), 'native_kit_provenance_missing');
      const expectedMethod = { ipfs_cat: 'cat', ipfs_add: 'add', node_id: 'node_id', swarm_peers: 'swarm_peers' }[name];
      requireValue(typeof provenance.sdk_method === 'string' && provenance.sdk_method.length > 0
        && (!expectedMethod || provenance.sdk_method === expectedMethod), 'native_kit_method_mismatch');
      requireValue(object(native.receipt) && native.receipt.owner === 'ipfs_kit_py'
        && native.receipt.tool === name && native.receipt.status === 'ok'
        && stableStringify(native.receipt.native_provenance) === stableStringify(provenance), 'native_kit_receipt_mismatch');
      if (name === 'ipfs_cat') {
        requireValue(typeof result.bytes_base64 === 'string', 'native_kit_bytes_missing');
        const bytes = Buffer.from(result.bytes_base64, 'base64');
        requireValue(bytes.toString('base64') === result.bytes_base64 && result.size === bytes.length
          && result.sha256 === createHash('sha256').update(bytes).digest('hex')
          && result.cid === args.cid, 'native_kit_bytes_mismatch');
      }
      if (name === 'node_id' || name === 'swarm_peers') {
        requireValue(result.tool === name && object(result.observation) && typeof provenance.observed_at === 'string'
          && Number.isFinite(Date.parse(provenance.observed_at))
          && Math.abs(Date.now() - Date.parse(provenance.observed_at)) <= 120000
          && (args.correlation_id === undefined || provenance.correlation_id === args.correlation_id), 'native_kit_observation_missing');
        const bytes = Buffer.from(stableStringify(result.observation));
        requireValue(provenance.payload_bytes === bytes.length
          && provenance.payload_sha256 === createHash('sha256').update(bytes).digest('hex'), 'native_kit_observation_hash_mismatch');
        if (name === 'node_id') {
          requireValue(typeof result.ID === 'string' && /^[A-Za-z0-9]{16,128}$/.test(result.ID)
            && Array.isArray(result.Addresses) && result.Addresses.length <= 64
            && result.Addresses.every(value => typeof value === 'string' && value.length <= 2048)
            && result.ID === result.observation.ID
            && stableStringify(result.Addresses) === stableStringify(result.observation.Addresses), 'native_kit_identity_mismatch');
        } else {
          const raw = result.raw_observation;
          requireValue(object(raw) && Object.hasOwn(raw, 'Peers') && !raw.error && !raw.Error && raw.success !== false
            && (raw.Peers === null || Array.isArray(raw.Peers))
            && typeof result.peers_reported_null === 'boolean' && result.peers_reported_null === (raw.Peers === null)
            && createHash('sha256').update(Buffer.from(stableStringify(raw))).digest('hex') === result.raw_observation_canonical_sha256
            && stableStringify(raw.Peers === null ? [] : raw.Peers) === stableStringify(result.Peers)
            && stableStringify(raw) === stableStringify(result.observation.raw_observation)
            && result.raw_observation_canonical_sha256 === result.observation.raw_observation_canonical_sha256
            && result.peers_reported_null === result.observation.peers_reported_null, 'native_kit_raw_peer_observation_mismatch');
          requireValue(Array.isArray(result.Peers) && result.Peers.length <= 256
            && result.Peers.every(peer => object(peer) && typeof peer.Peer === 'string'
              && /^[A-Za-z0-9]{16,128}$/.test(peer.Peer) && (peer.Addr === undefined || typeof peer.Addr === 'string' && peer.Addr.length <= 2048))
            && result.peer_count === result.Peers.length && result.observation.peer_count === result.peer_count
            && stableStringify(result.Peers) === stableStringify(result.observation.Peers), 'native_kit_peer_observation_mismatch');
        }
      }
      return { ok: true, result, native_receipt: native.receipt };
    } catch (error) {
      const details = error?.native_error ? nativeKitError(error.native_error) : null;
      return { ok: false, error: details?.message || (error instanceof Error ? safeErrorText(error.message) : 'native_kit_request_failed'),
        ...(details ? { native_error: details } : {}) };
    }
  }

  async function listTools() {
    const result = await rpc('tools/list', {});
    requireValue(Array.isArray(result.tools) && result.tools.length > 0, 'native_kit_tool_catalog_empty');
    return nativeKitCatalog(result.tools, []);
  }

  async function health() {
    const url = new URL('/mcp/health', target);
    const value = await jsonRequest(url.href, { method: 'GET', headers: { accept: 'application/json' } });
    requireValue(value.status === 'ok' && value.simulated !== true && value.cache_fallback !== true, 'native_kit_upstream_unready');
    return value;
  }
  return { execute, health, listTools, endpoint: target.href };
}

module.exports = { createNativeKitForwarder, nativeKitCatalog };
