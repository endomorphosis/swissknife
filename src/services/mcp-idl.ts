/**
 * MCP-IDL: CID-Addressed Interface Contracts (MCP++ Profile A)
 *
 * Provides:
 *  - `InterfaceDescriptor` type (§4)
 *  - `canonicalize()` → deterministic JSON bytes
 *  - `computeInterfaceCID()` → `sha256:<hex>` content identifier
 *  - `InterfaceRepository` with list / get / compat / select APIs (§5)
 *
 * References: docs/spec/mcp-idl.md in endomorphosis/Mcp-Plus-Plus
 */

import { createHash, type BinaryLike } from 'crypto';

// ---------------------------------------------------------------------------
// Types (§4)
// ---------------------------------------------------------------------------

export interface MethodSignature {
  name: string;
  /** Compact JSON Schema (or CID reference to schema) */
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** MCP++ spec-compatible snake_case aliases */
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  /** CID-addressed schemas (alternative to inline) */
  inputSchemaCid?: string;
  outputSchemaCid?: string;
  /** MCP++ spec-compatible snake_case aliases */
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

export interface ErrorDefinition {
  name: string;
  code?: number;
  description?: string;
}

export interface CompatibilityMetadata {
  compatibleWith?: string[]; // interface_cid list
  supersedes?: string[];     // interface_cid list
  /** MCP++ spec-compatible snake_case alias */
  compatible_with?: string[]; // interface_cid list
}

export interface ResourceCostHints {
  /** Approximate tokens consumed per call */
  tokensPerCall?: number;
  /** Estimated wall-clock ms per call */
  latencyMs?: number;
  /** Byte bandwidth per call */
  bytesPerCall?: number;
}

/** Full Interface Descriptor per MCP-IDL §4 */
export interface InterfaceDescriptor {
  // Required fields (§4.1)
  name: string;
  namespace: string;
  version: string;
  methods: MethodSignature[];
  errors: ErrorDefinition[];
  requires: string[]; // capability strings e.g. 'mcp++/ucan'
  compatibility: CompatibilityMetadata;

  // Recommended fields (§4.2)
  semanticTags?: string[];
  observability?: { trace?: boolean; provenance?: boolean };
  interactionPatterns?: { requestResponse?: boolean; eventStreams?: boolean };
  /** MCP++ spec-compatible snake_case alias */
  interaction_patterns?: { request_response?: boolean; event_streams?: boolean } | string[];
  resourceCostHints?: ResourceCostHints;
  /** MCP++ spec-compatible snake_case alias */
  resource_cost_hints?: ResourceCostHints;
  schemaHash?: string;
  /** MCP++ spec-compatible snake_case alias */
  schema_hash?: string;
}

export interface CompatibilityVerdict {
  compatible: boolean;
  reasons: string[];
  requiresMissing: string[];
  suggestedAlternatives: string[];
}

// ---------------------------------------------------------------------------
// Canonicalization (§3)
// ---------------------------------------------------------------------------

/**
 * Produce deterministic UTF-8 JSON bytes for an InterfaceDescriptor.
 *
 * Keys are sorted lexicographically at every nesting level so that
 * semantically-identical descriptors always hash to the same CID.
 */
export function canonicalize(descriptor: InterfaceDescriptor): Buffer {
  return Buffer.from(stableStringify(descriptor), 'utf8');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys
    .filter(k => (value as Record<string, unknown>)[k] !== undefined)
    .map(
      k =>
        `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
    );
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute the content identifier for a descriptor.
 * Format: `sha256:<lower-case-hex>`
 */
export function computeInterfaceCID(descriptor: InterfaceDescriptor): string {
  const bytes = canonicalize(descriptor);
  return `sha256:${createHash('sha256').update(bytes as unknown as BinaryLike).digest('hex')}`;
}

/** Compute a CID for arbitrary bytes / strings. */
export function computeCID(data: Buffer | Uint8Array | string): string {
  const input =
    typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data as Uint8Array);
  return `sha256:${createHash('sha256').update(input as unknown as BinaryLike).digest('hex')}`;
}

// ---------------------------------------------------------------------------
// InterfaceRepository (§5)
// ---------------------------------------------------------------------------

interface RegistryEntry {
  cid: string;
  descriptor: InterfaceDescriptor;
  canonicalBytes: Buffer;
}

export class InterfaceRepository {
  private store: Map<string, RegistryEntry> = new Map();

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register a descriptor and return its CID.
   * Idempotent: registering the same descriptor twice returns the same CID.
   */
  register(descriptor: InterfaceDescriptor): string {
    const cid = computeInterfaceCID(descriptor);
    if (!this.store.has(cid)) {
      this.store.set(cid, {
        cid,
        descriptor,
        canonicalBytes: canonicalize(descriptor),
      });
    }
    return cid;
  }

  // -------------------------------------------------------------------------
  // §5: Repository APIs
  // -------------------------------------------------------------------------

  /** `interfaces/list` → returns all registered interface CIDs */
  list(): string[] {
    return Array.from(this.store.keys());
  }

  /** `interfaces/get(interface_cid)` → canonical descriptor bytes (or null) */
  get(interfaceCid: string): Buffer | null {
    return this.store.get(interfaceCid)?.canonicalBytes ?? null;
  }

  /** Get the parsed descriptor for a CID */
  getDescriptor(interfaceCid: string): InterfaceDescriptor | null {
    return this.store.get(interfaceCid)?.descriptor ?? null;
  }

  /**
   * `interfaces/compat(interface_cid)` — evaluate compatibility.
   *
   * The verdict checks whether the requested interface is known and whether
   * any of its `requires[]` capabilities are missing from the set of
   * currently registered descriptors' namespaces.
   */
  compat(interfaceCid: string): CompatibilityVerdict {
    const entry = this.store.get(interfaceCid);
    if (!entry) {
      return {
        compatible: false,
        reasons: [`Interface CID not found: ${interfaceCid}`],
        requiresMissing: [],
        suggestedAlternatives: [],
      };
    }

    const { descriptor } = entry;
    const reasons: string[] = [];
    const requiresMissing: string[] = [];
    const suggestedAlternatives: string[] = [];

    // Check required capabilities are registered
    for (const req of descriptor.requires) {
      const satisfied = Array.from(this.store.values()).some(
        e => e.descriptor.name === req || e.descriptor.namespace === req,
      );
      if (!satisfied) {
        requiresMissing.push(req);
        reasons.push(`Required capability not registered: ${req}`);
      }
    }

    // Collect alternatives from compatibility metadata
    const allAlts = [
      ...(descriptor.compatibility.compatibleWith ?? []),
      ...(descriptor.compatibility.compatible_with ?? []),
      ...(descriptor.compatibility.supersedes ?? []),
    ];
    for (const altCid of allAlts) {
      if (this.store.has(altCid)) {
        suggestedAlternatives.push(altCid);
      }
    }

    return {
      compatible: reasons.length === 0,
      reasons,
      requiresMissing,
      suggestedAlternatives,
    };
  }

  /**
   * `interfaces/select(task_hint_cid, budget)` — return a subset of interface
   * CIDs that fit within a budget.
   *
   * Selection heuristic: sort by ascending estimated `tokensPerCall` cost hint
   * and greedily include descriptors until the token budget is exhausted.
   *
   * @param _taskHintCid   Currently unused; reserved for future semantic matching.
   * @param tokenBudget    Maximum total tokens the selection may consume.
   */
  select(_taskHintCid: string, tokenBudget: number): string[] {
    const sorted = Array.from(this.store.values()).sort((a, b) => {
      const costA = a.descriptor.resourceCostHints?.tokensPerCall ?? 0;
      const costB = b.descriptor.resourceCostHints?.tokensPerCall ?? 0;
      return costA - costB;
    });

    const selected: string[] = [];
    let remaining = tokenBudget;

    for (const entry of sorted) {
      const cost = entry.descriptor.resourceCostHints?.tokensPerCall ?? 0;
      if (remaining - cost < 0) continue;
      selected.push(entry.cid);
      remaining -= cost;
    }

    return selected;
  }

  // -------------------------------------------------------------------------
  // Singleton
  // -------------------------------------------------------------------------

  private static _instance: InterfaceRepository | null = null;
  static getInstance(): InterfaceRepository {
    if (!InterfaceRepository._instance) {
      InterfaceRepository._instance = new InterfaceRepository();
    }
    return InterfaceRepository._instance;
  }

  /** Alias for `getInstance()` — used by consumers that prefer a more explicit name. */
  static getSharedInstance(): InterfaceRepository {
    return InterfaceRepository.getInstance();
  }
}
