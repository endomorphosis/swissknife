const crypto = require('node:crypto');

const PROFILE_A_CAPABILITY = 'mcp++/mcp-idl';
const DEFAULT_SCHEMA = { type: 'object', additionalProperties: true };

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().filter(key => value[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function base32Lower(bytes) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let accumulator = 0;
  let bits = 0;
  let result = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(accumulator >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(accumulator << (5 - bits)) & 31];
  return result;
}

/** CIDv1 raw + sha2-256, equivalent to Kubo raw-leaf CID generation. */
function cidForBytes(bytes) {
  const digest = crypto.createHash('sha256').update(bytes).digest();
  const cidBytes = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]);
  return `b${base32Lower(cidBytes)}`;
}

function cidForValue(value) {
  return cidForBytes(Buffer.from(stableStringify(value), 'utf8'));
}

function isContentCid(value) {
  return typeof value === 'string' && /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58})$/.test(value);
}

function normalizeTool(tool) {
  const inputSchema = tool?.inputSchema ?? tool?.input_schema ?? DEFAULT_SCHEMA;
  const outputSchema = tool?.outputSchema ?? tool?.output_schema ?? DEFAULT_SCHEMA;
  return {
    name: String(tool?.name ?? ''),
    description: String(tool?.description ?? ''),
    input_schema: inputSchema,
    output_schema: outputSchema,
    input_schema_cid: cidForValue(inputSchema),
    output_schema_cid: cidForValue(outputSchema),
    error_schema_cids: [],
    errors: ['MCPError'],
    streaming: false,
    interaction_pattern: 'request-response',
  };
}

function buildProfileAInterface(service, tools) {
  const methods = (Array.isArray(tools) ? tools : [])
    .map(normalizeTool)
    .filter(tool => tool.name)
    // Use raw code-point ordering, not locale-sensitive collation. Python's
    // `sorted()` uses the same order for the ASCII MCP tool namespace, which
    // keeps HTTP and libp2p descriptors byte-identical.
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  if (methods.length === 0) throw new Error(`${service} has no MCP tools for Profile A`);

  const descriptor = {
    name: `${service}.mcp-tools`,
    namespace: `org.hallucinate.swissknife.mcp.${service}`,
    version: '1.0.0',
    methods,
    errors: ['MCPError'],
    requires: [],
    compatibility: { compatible_with: [], supersedes: [] },
    semantic_tags: ['mcp', 'mcp-idl', 'ipfs', service],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: false },
    resource_cost_hints: { tokens_per_call: 0, latency_ms: 0 },
  };
  const interfaceCid = cidForValue(descriptor);
  const canonicalBytes = Buffer.from(stableStringify(descriptor), 'utf8');
  return {
    interface_cid: interfaceCid,
    descriptor: { ...descriptor, interface_cid: interfaceCid },
    canonical_descriptor: descriptor,
    canonical_bytes_base64: canonicalBytes.toString('base64'),
  };
}

function profileAListResult(catalog) {
  return {
    interfaces: [catalog.interface_cid],
    interface_cids: [catalog.interface_cid],
  };
}

function profileAGetResult(catalog, interfaceCid) {
  if (interfaceCid !== catalog.interface_cid) return null;
  return {
    interface_cid: catalog.interface_cid,
    descriptor: catalog.descriptor,
    canonical_descriptor: catalog.canonical_descriptor,
    canonical_bytes_base64: catalog.canonical_bytes_base64,
  };
}

function profileACompatResult(catalog, params = {}) {
  const serverCid = String(params.server_cid ?? params.interface_cid ?? '');
  const clientCid = String(params.client_cid ?? serverCid);
  const compatible = clientCid === catalog.interface_cid && serverCid === catalog.interface_cid;
  const reasons = compatible ? [] : ['Interface CID is not available from this service.'];
  return {
    compatible,
    reasons,
    requires_missing: [],
    suggested_alternatives: [],
    // Camel-case aliases preserve compatibility with SwissKnife's local
    // InterfaceRepository while the snake-case fields match the draft wire API.
    requiresMissing: [],
    suggestedAlternatives: [],
  };
}

function profileASelectResult(catalog, _params = {}) {
  return {
    interfaces: [catalog.interface_cid],
    interface_cids: [catalog.interface_cid],
  };
}

function verifyProfileAResult(result) {
  const canonical = result?.canonical_descriptor;
  if (!canonical || typeof canonical !== 'object' || typeof result?.interface_cid !== 'string') return false;
  const bytes = Buffer.from(stableStringify(canonical), 'utf8');
  return cidForValue(canonical) === result.interface_cid
    && result.canonical_bytes_base64 === bytes.toString('base64');
}

module.exports = {
  PROFILE_A_CAPABILITY,
  stableStringify,
  cidForBytes,
  cidForValue,
  isContentCid,
  buildProfileAInterface,
  profileAListResult,
  profileAGetResult,
  profileACompatResult,
  profileASelectResult,
  verifyProfileAResult,
};
