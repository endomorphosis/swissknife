/**
 * ZKP Canonicalization Runtime — Feature Detection + Rate Limiting + VK Registry + Legal Theorem Semantics
 * Ports of: zkp/canonicalization.py (181L),
 *           common/feature_detection.py (180L),
 *           security/rate_limiting.py (159L),
 *           zkp/vk_registry.py (155L),
 *           zkp/legal_theorem_semantics.py (153L)
 */

import { bytesToHex, hexToBytes, sha256Hex } from '../shared/browser-crypto.js';

// ---------------------------------------------------------------------------
// T-312a — Canonicalization (canonicalization.py)
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s∀∃∧∨¬→↔(),.]/g, '').trim();
}

export function canonicalizeTheorem(theorem: string): string {
  return normalizeText(theorem)
    .split(' ')
    .sort()
    .join(' ');
}

export function canonicalizeAxioms(axioms: string[]): string[] {
  return axioms.map(a => canonicalizeTheorem(a)).sort();
}

export function hashTheorem(theorem: string): Buffer {
  return new DigestBytes(hexToBytes(sha256Hex(canonicalizeTheorem(theorem)))) as unknown as Buffer;
}

export function hashAxiomsCommitment(axioms: string[]): Buffer {
  const canonical = canonicalizeAxioms(axioms).join('\n');
  return new DigestBytes(hexToBytes(sha256Hex(canonical))) as unknown as Buffer;
}

export function theoremHashHex(theorem: string): string {
  return hashTheorem(theorem).toString('hex');
}

export function axiomsCommitmentHex(axioms: string[]): string {
  return hashAxiomsCommitment(axioms).toString('hex');
}

export function sha256FieldInt(text: string): bigint {
  return BigInt('0x' + sha256Hex(text));
}

export function tdfolV1AxiomsCommitmentHexV2(axioms: string[]): string {
  const sorted = [...axioms].sort();
  const combined = sorted.join('\x00');
  return sha256Hex(combined);
}

// ---------------------------------------------------------------------------
// T-312b — Feature Detection (feature_detection.py)
// ---------------------------------------------------------------------------

const _featureCache = new Map<string, boolean>();

export function isModuleAvailable(moduleName: string): boolean {
  if (_featureCache.has(moduleName)) return _featureCache.get(moduleName)!;
  const available = getNodeBuiltin(moduleName) !== null;

  _featureCache.set(moduleName, available);
  return available;
}

export function clearFeatureDetectionCache(): void { _featureCache.clear(); }

export function importOptionalModule<T = unknown>(moduleName: string): T | null {
  return getNodeBuiltin(moduleName) as T | null;
}

export function warnOptionalImportsEnabled(): boolean {
  return (typeof process !== 'undefined' ? process.env['WARN_OPTIONAL_IMPORTS'] : undefined) === '1';
}

export function minimalImportsEnabled(): boolean {
  return (typeof process !== 'undefined' ? process.env['MINIMAL_IMPORTS'] : undefined) === '1';
}

export class FeatureDetector {
  private readonly checked = new Map<string, boolean>();

  check(feature: string): boolean {
    if (this.checked.has(feature)) return this.checked.get(feature)!;
    const available = isModuleAvailable(feature);
    this.checked.set(feature, available);
    return available;
  }

  getReport(): Record<string, boolean> { return Object.fromEntries(this.checked); }
  reset(): void { this.checked.clear(); }
}

// ---------------------------------------------------------------------------
// T-312c — Rate Limiting (rate_limiting.py)
// ---------------------------------------------------------------------------

export class RateLimitExceeded extends Error {
  constructor(message = 'Rate limit exceeded') { super(message); this.name = 'RateLimitExceeded'; }
}

export interface RateLimiterConfig { maxRequests: number; windowMs: number }

export class RateLimiter {
  private readonly timestamps: number[] = [];

  constructor(private readonly config: RateLimiterConfig = { maxRequests: 100, windowMs: 60_000 }) {}

  check(): boolean {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    // Remove timestamps outside window
    while (this.timestamps.length > 0 && this.timestamps[0]! < cutoff) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.config.maxRequests) return false;
    this.timestamps.push(now);
    return true;
  }

  enforce(): void {
    if (!this.check()) throw new RateLimitExceeded(`Max ${this.config.maxRequests} requests per ${this.config.windowMs}ms`);
  }

  reset(): void { this.timestamps.length = 0; }
  getCount(): number { return this.timestamps.length; }
}

let _globalRateLimiter: RateLimiter | null = null;
export function getRateLimiter(config?: RateLimiterConfig): RateLimiter {
  if (!_globalRateLimiter) _globalRateLimiter = new RateLimiter(config);
  return _globalRateLimiter;
}

export function rateLimit<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return ((...args: unknown[]) => {
    getRateLimiter().enforce();
    return fn(...args);
  }) as T;
}

// ---------------------------------------------------------------------------
// T-312d — VK Registry (vk_registry.py)
// ---------------------------------------------------------------------------

export function computeVkHash(vk: unknown): string {
  const json = typeof vk === 'string' ? vk : JSON.stringify(vk);
  return sha256Hex(json);
}

export interface VKRegistryEntry {
  circuitId:  string;
  version:    number;
  vkHashHex:  string;
  vk:         unknown;
  registeredAt: number;
}

export class VKRegistry {
  private readonly entries = new Map<string, VKRegistryEntry>();

  register(circuitId: string, vk: unknown, version = 1): string {
    const vkHashHex = computeVkHash(vk);
    const key = `${circuitId}@v${version}`;
    this.entries.set(key, { circuitId, version, vkHashHex, vk, registeredAt: Date.now() });
    return vkHashHex;
  }

  get(circuitId: string, version = 1): VKRegistryEntry | null {
    return this.entries.get(`${circuitId}@v${version}`) ?? null;
  }

  verify(circuitId: string, vk: unknown, version = 1): boolean {
    const entry = this.get(circuitId, version);
    if (!entry) return false;
    return entry.vkHashHex === computeVkHash(vk);
  }

  listAll(): VKRegistryEntry[] { return [...this.entries.values()]; }
}

// ---------------------------------------------------------------------------
// T-312e — Legal Theorem Semantics (legal_theorem_semantics.py)
// ---------------------------------------------------------------------------

export class LegalTheoremSyntaxError extends Error {
  constructor(message: string) { super(message); this.name = 'LegalTheoremSyntaxError'; }
}

export interface HornAxiom { head: string; body: string[] }

export function parseTdfolV1Axiom(text: string): HornAxiom {
  const trimmed = text.trim();
  if (trimmed.includes(':-')) {
    const [head, bodyPart] = trimmed.split(':-').map(s => s.trim());
    if (!head) throw new LegalTheoremSyntaxError(`Invalid axiom: missing head in "${text}"`);
    const body = bodyPart?.split(',').map(s => s.trim().replace(/\.$/, '')) ?? [];
    return { head, body };
  }
  if (!trimmed) throw new LegalTheoremSyntaxError('Axiom text is empty');
  return { head: trimmed.replace(/\.$/, ''), body: [] };
}

export function parseTdfolV1Theorem(text: string): string {
  const trimmed = text.trim().replace(/\.$/, '');
  if (!trimmed) throw new LegalTheoremSyntaxError('Theorem text is empty');
  return trimmed;
}

export function evaluateTdfolV1Holds(privateAxioms: string[], theorem: string): boolean {
  const parsedAxioms = privateAxioms.map(a => parseTdfolV1Axiom(a));
  const parsedTheorem = parseTdfolV1Theorem(theorem);

  // Simple ground entailment: facts with empty body are facts; check if theorem matches head
  const facts = new Set(parsedAxioms.filter(a => a.body.length === 0).map(a => a.head));

  const derive = (goal: string, depth = 0): boolean => {
    if (depth > 20) return false;
    if (facts.has(goal)) return true;
    for (const ax of parsedAxioms) {
      if (ax.head === goal && ax.body.every(b => derive(b, depth + 1))) return true;
    }
    return false;
  };

  return derive(parsedTheorem);
}

export function deriveTdfolV1Trace(privateAxioms: string[], theorem: string): string[] | null {
  const parsedAxioms = privateAxioms.map(a => parseTdfolV1Axiom(a));
  const parsedTheorem = parseTdfolV1Theorem(theorem);
  const trace: string[] = [];

  const derive = (goal: string, depth = 0): boolean => {
    if (depth > 20) return false;
    for (const ax of parsedAxioms) {
      if (ax.head === goal) {
        if (ax.body.length === 0) { trace.push(`fact: ${goal}`); return true; }
        const bodyOk = ax.body.every(b => derive(b, depth + 1));
        if (bodyOk) { trace.push(`derived: ${goal} :- ${ax.body.join(', ')}`); return true; }
      }
    }
    return false;
  };

  return derive(parsedTheorem) ? trace : null;
}

class DigestBytes extends Uint8Array {
  override toString(encoding = 'hex'): string {
    if (encoding === 'hex') return bytesToHex(this);
    if (encoding === 'utf8' || encoding === 'utf-8') return new TextDecoder().decode(this);
    return bytesToHex(this);
  }
}

function getNodeBuiltin(moduleName: string): unknown | null {
  return ((globalThis.process as unknown as {
    getBuiltinModule?: (specifier: string) => unknown;
  } | undefined)?.getBuiltinModule?.(moduleName)) ?? null;
}
