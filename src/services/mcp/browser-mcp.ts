import { sha256Hex, utf8Bytes } from '../provers/browser-crypto.js';

export * from './agent-supervisor-console-gateway.js';
export * from './all-app-tool-gateway.js';

export interface BrowserMCPMethodSignature {
  name: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  inputSchemaCid?: string;
  outputSchemaCid?: string;
  input_schema_cid?: string;
  output_schema_cid?: string;
  errorSchemaCids?: string[];
  error_schema_cids?: string[];
  eventSchema?: Record<string, unknown>;
  event_schema?: Record<string, unknown>;
  eventSchemaCid?: string;
  event_schema_cid?: string;
  description?: string;
}

export interface BrowserMCPErrorDefinition {
  name: string;
  code?: number;
  description?: string;
}

export interface BrowserMCPCompatibilityMetadata {
  compatibleWith?: string[];
  supersedes?: string[];
  compatible_with?: string[];
}

export interface BrowserMCPResourceCostHints {
  tokensPerCall?: number;
  latencyMs?: number;
  bytesPerCall?: number;
}

export interface BrowserMCPInterfaceDescriptor {
  name: string;
  namespace: string;
  version: string;
  methods: BrowserMCPMethodSignature[];
  errors: BrowserMCPErrorDefinition[];
  requires: string[];
  compatibility: BrowserMCPCompatibilityMetadata;
  semanticTags?: string[];
  observability?: { trace?: boolean; provenance?: boolean };
  interactionPatterns?: { requestResponse?: boolean; eventStreams?: boolean };
  interaction_patterns?: { request_response?: boolean; event_streams?: boolean } | string[];
  resourceCostHints?: BrowserMCPResourceCostHints;
  resource_cost_hints?: BrowserMCPResourceCostHints;
  schemaHash?: string;
  schema_hash?: string;
}

export interface BrowserMCPCompatibilityVerdict {
  compatible: boolean;
  reasons: string[];
  requiresMissing: string[];
  suggestedAlternatives: string[];
}

export interface BrowserMCPRegistryEntry {
  cid: string;
  descriptor: BrowserMCPInterfaceDescriptor;
  canonicalBytes: Uint8Array;
}

export const SWISSKNIFE_BROWSER_MCP_EXPORT_ID = 'swissknife/browser/mcp';

export function canonicalizeBrowserMCPDescriptor(
  descriptor: BrowserMCPInterfaceDescriptor,
): Uint8Array {
  return utf8Bytes(stableStringify(descriptor));
}

export function computeBrowserMCPInterfaceCID(
  descriptor: BrowserMCPInterfaceDescriptor,
): string {
  return computeBrowserMCPCID(canonicalizeBrowserMCPDescriptor(descriptor));
}

export function computeBrowserMCPCID(data: Uint8Array | string): string {
  return `sha256:${sha256Hex(data)}`;
}

export class BrowserMCPInterfaceRepository {
  private readonly store = new Map<string, BrowserMCPRegistryEntry>();

  register(descriptor: BrowserMCPInterfaceDescriptor): string {
    const canonicalBytes = canonicalizeBrowserMCPDescriptor(descriptor);
    const cid = computeBrowserMCPCID(canonicalBytes);
    if (!this.store.has(cid)) {
      this.store.set(cid, {
        cid,
        descriptor: cloneDescriptor(descriptor),
        canonicalBytes,
      });
    }
    return cid;
  }

  list(): string[] {
    return Array.from(this.store.keys()).sort();
  }

  get(interfaceCid: string): Uint8Array | null {
    const bytes = this.store.get(interfaceCid)?.canonicalBytes;
    return bytes ? new Uint8Array(bytes) : null;
  }

  getDescriptor(interfaceCid: string): BrowserMCPInterfaceDescriptor | null {
    const descriptor = this.store.get(interfaceCid)?.descriptor;
    return descriptor ? cloneDescriptor(descriptor) : null;
  }

  compat(interfaceCid: string): BrowserMCPCompatibilityVerdict {
    const descriptor = this.store.get(interfaceCid)?.descriptor;
    if (!descriptor) {
      return {
        compatible: false,
        reasons: [`Unknown interface: ${interfaceCid}`],
        requiresMissing: [],
        suggestedAlternatives: [],
      };
    }

    const registeredNamespaces = new Set(
      Array.from(this.store.values()).map(entry => entry.descriptor.namespace),
    );
    const requiresMissing = descriptor.requires.filter(
      capability => !registeredNamespaces.has(capability),
    );
    const suggestedAlternatives = Array.from(this.store.values())
      .filter(entry => {
        const compatibleWith = entry.descriptor.compatibility.compatibleWith
          ?? entry.descriptor.compatibility.compatible_with
          ?? [];
        return compatibleWith.includes(interfaceCid);
      })
      .map(entry => entry.cid)
      .sort();

    return {
      compatible: requiresMissing.length === 0,
      reasons: requiresMissing.length === 0
        ? ['All required MCP browser capabilities are registered']
        : requiresMissing.map(capability => `Missing required capability: ${capability}`),
      requiresMissing,
      suggestedAlternatives,
    };
  }

  select(taskHintCid: string, budget: number): string[] {
    const limit = Math.max(0, Math.floor(budget));
    return this.list()
      .filter(cid => cid !== taskHintCid)
      .slice(0, limit);
  }
}

export function createBrowserMCPInterfaceRepository(): BrowserMCPInterfaceRepository {
  return new BrowserMCPInterfaceRepository();
}

function cloneDescriptor(
  descriptor: BrowserMCPInterfaceDescriptor,
): BrowserMCPInterfaceDescriptor {
  return JSON.parse(JSON.stringify(descriptor)) as BrowserMCPInterfaceDescriptor;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter(key => object[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}
