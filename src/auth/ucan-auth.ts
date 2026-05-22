/**
 * Implements UCAN (User Controlled Authorization Network) based authentication
 * and authorization using Node.js native Ed25519 crypto.
 *
 * Token format: base64url(header).base64url(payload).base64url(signature)
 *   header  = { alg: "EdDSA", typ: "UCAN" }
 *   payload = UCANClaim JSON
 *   signature = Ed25519 sign(base64url(header) + "." + base64url(payload))
 *
 * References: MCP++ Profile C — Capability Delegation (UCAN)
 */

import {
  DIDKeystore,
  base64urlEncode,
  base64urlDecode,
  didToPublicKeyBytes,
} from './did-keystore.js';
import { createHash, createPublicKey, verify as cryptoVerify } from 'crypto';

/**
 * Represents the payload (claims) of a UCAN token.
 */
export interface UCANClaim {
  iss: string;      // Issuer DID (e.g., 'did:key:z...')
  aud: string;      // Audience DID (who the token is for)
  exp?: number;     // Expiration timestamp (Unix time in seconds)
  nbf?: number;     // Not before timestamp (Unix time in seconds)
  nnc?: string;     // Nonce, to prevent replay attacks
  fct?: any[];      // Facts associated with the UCAN
  att: Array<{      // Attenuations/Capabilities (what the bearer can do)
    rsc: string;    // Resource identifier (e.g., 'storage://*', 'mailto:user@example.com')
    cap: string;    // Capability/action (e.g., 'WRITE', 'SEND')
    nb?: any;       // Caveats/constraints (e.g., { max_size: 1024 })
  }>;
  prf: string[];   // Proof chain (array of UCAN tokens as strings, delegating authority)
}

/**
 * Parsed / decoded UCAN token (internal representation).
 */
export interface ParsedUCAN {
  header: { alg: string; typ: string };
  payload: UCANClaim;
  /** Raw base64url-encoded signature */
  signatureB64: string;
  /** The original signing input: `<headerB64>.<payloadB64>` */
  signingInput: string;
}

/**
 * Manages UCAN creation, validation, and capability checking.
 *
 * Uses the `DIDKeystore` for real Ed25519 key management.
 */
export class UCANAuth {
  private keystore: DIDKeystore;
  /** Cache of successfully validated tokens (keyed by token string) */
  private validatedCache: Map<string, ParsedUCAN> = new Map();
  /** Optional revocation registry; defaults to the shared singleton. */
  private revocationRegistry: UCANRevocationRegistry;

  constructor(keystore?: DIDKeystore, revocationRegistry?: UCANRevocationRegistry) {
    this.keystore = keystore ?? DIDKeystore.getInstance();
    this.revocationRegistry = revocationRegistry ?? UCANRevocationRegistry.getInstance();
  }

  async initialize(): Promise<void> {
    // Keystore is synchronously initialized; nothing async required here.
  }

  // ---------------------------------------------------------------------------
  // DID Management
  // ---------------------------------------------------------------------------

  /** Create a new Ed25519 did:key identity and return the DID. */
  createDID(): string {
    return this.keystore.generateKey();
  }

  // ---------------------------------------------------------------------------
  // Token Encoding / Decoding
  // ---------------------------------------------------------------------------

  /** Encode a UCAN token (header + payload) as a base64url string without signing. */
  private encodeUnsigned(header: object, payload: UCANClaim): string {
    const headerB64 = base64urlEncode(
      Buffer.from(JSON.stringify(header), 'utf8'),
    );
    const payloadB64 = base64urlEncode(
      Buffer.from(JSON.stringify(payload), 'utf8'),
    );
    return `${headerB64}.${payloadB64}`;
  }

  /**
   * Decode a UCAN token string into its structured parts.
   * Does NOT verify the signature.
   */
  static decode(token: string): ParsedUCAN {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid UCAN: expected 3 dot-separated parts');
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(
      base64urlDecode(headerB64).toString('utf8'),
    );
    const payload = JSON.parse(
      base64urlDecode(payloadB64).toString('utf8'),
    ) as UCANClaim;
    return { header, payload, signatureB64, signingInput: `${headerB64}.${payloadB64}` };
  }

  // ---------------------------------------------------------------------------
  // Issuing Tokens
  // ---------------------------------------------------------------------------

  /**
   * Issue a signed UCAN token.
   *
   * @param issuerDID   must be present in the keystore
   * @param audienceDID target identity
   * @param capabilities MCP++ capability attenuations
   * @param lifetimeInSeconds default 3600
   * @param proofs  proof chain (encoded UCAN strings delegating authority)
   * @param nonce   optional nonce
   * @param facts   optional facts
   */
  issueToken(
    issuerDID: string,
    audienceDID: string,
    capabilities: UCANClaim['att'],
    lifetimeInSeconds = 3600,
    proofs: string[] = [],
    nonce?: string,
    facts?: unknown[],
  ): string {
    if (!this.keystore.hasDID(issuerDID)) {
      throw new Error(`Issuer DID not found in keystore: ${issuerDID}`);
    }
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'EdDSA', typ: 'UCAN' };
    const payload: UCANClaim = {
      iss: issuerDID,
      aud: audienceDID,
      exp: now + lifetimeInSeconds,
      nbf: now,
      nnc: nonce,
      fct: facts as UCANClaim['fct'],
      att: capabilities,
      prf: proofs,
    };
    const signingInput = this.encodeUnsigned(header, payload);
    const sigBytes = this.keystore.sign(
      Buffer.from(signingInput, 'utf8'),
      issuerDID,
    );
    const sigB64 = base64urlEncode(Buffer.from(sigBytes));
    return `${signingInput}.${sigB64}`;
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate a UCAN token: revocation → structure → expiry/nbf → Ed25519 signature → proof chain.
   * Returns true only when all checks pass.
   */
  async validateToken(token: string): Promise<boolean> {
    // Revocation check MUST come before the validation cache so that a token
    // that was previously validated but later revoked is correctly rejected.
    if (this.revocationRegistry.isTokenRevoked(token)) return false;

    // Fast path: already validated in this session (and not revoked above)
    if (this.validatedCache.has(token)) return true;

    let parsed: ParsedUCAN;
    try {
      parsed = UCANAuth.decode(token);
    } catch {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (parsed.payload.exp !== undefined && parsed.payload.exp < now) {
      return false; // expired
    }
    if (parsed.payload.nbf !== undefined && parsed.payload.nbf > now) {
      return false; // not yet valid
    }

    // Verify Ed25519 signature
    const sigOk = this.verifyTokenSignature(parsed);
    if (!sigOk) return false;

    // Recursively validate proof chain
    for (const proofToken of parsed.payload.prf) {
      const proofValid = await this.validateToken(proofToken);
      if (!proofValid) return false;

      // Verify delegation linkage: proof.aud must equal this token's iss
      let proofParsed: ParsedUCAN;
      try {
        proofParsed = UCANAuth.decode(proofToken);
      } catch {
        return false;
      }
      if (proofParsed.payload.aud !== parsed.payload.iss) {
        return false; // proof was not issued to this token's issuer
      }
    }

    this.validatedCache.set(token, parsed);
    return true;
  }

  /**
   * Verify the Ed25519 signature on a decoded UCAN.
   * Public key is derived from the `iss` DID.
   */
  private verifyTokenSignature(parsed: ParsedUCAN): boolean {
    try {
      const signingInputBytes = Buffer.from(parsed.signingInput, 'utf8');
      const sigBytes = base64urlDecode(parsed.signatureB64);
      const issuerDID = parsed.payload.iss;

      // Try keystore first (if we hold the key locally)
      if (this.keystore.hasDID(issuerDID)) {
        return this.keystore.verify(signingInputBytes, sigBytes, issuerDID);
      }

      // Otherwise derive public key from the DID itself
      const pubKeyBytes = didToPublicKeyBytes(issuerDID);
      const spkiDer = buildSpkiFromRawEd25519(pubKeyBytes);
      const publicKey = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
      return cryptoVerify(null, signingInputBytes, publicKey, sigBytes);
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Capability checking (MCP++ Profile C §6)
  // ---------------------------------------------------------------------------

  /**
   * Returns true if `token` (and its proof chain) grant `capability` on `resource`.
   *
   * Alignment with MCP++ Profile C:
   *   rsc = CID-prefixed resource URI or `mcp++/<method>`
   *   cap = MCP++ capability string  (e.g. `mcp++/invoke`, `mcp++/read-cid`)
   */
  async can(
    token: string,
    resource: string,
    capability: string,
  ): Promise<boolean> {
    const isValid = await this.validateToken(token);
    if (!isValid) return false;

    const parsed = UCANAuth.decode(token);
    return this.claimGrantsCapability(parsed, resource, capability, token);
  }

  /**
   * Recursively check whether `parsed` grants capability on resource,
   * either directly in `att` or through a delegating proof token.
   */
  private async claimGrantsCapability(
    parsed: ParsedUCAN,
    resource: string,
    capability: string,
    _rawToken: string,
  ): Promise<boolean> {
    // Direct check
    const direct = parsed.payload.att.some(
      att =>
        this.resourceMatches(att.rsc, resource) &&
        this.capabilityMatches(att.cap, capability),
    );
    if (direct) return true;

    // Check proof chain — each proof must have been validated already
    for (const proofToken of parsed.payload.prf) {
      let proofParsed: ParsedUCAN;
      try {
        proofParsed = UCANAuth.decode(proofToken);
      } catch {
        continue;
      }
      const proofGrants = await this.claimGrantsCapability(
        proofParsed,
        resource,
        capability,
        proofToken,
      );
      if (proofGrants) {
        // Verify the current token was delegated from the proof
        if (proofParsed.payload.aud === parsed.payload.iss) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Matches a resource pattern against an actual resource. */
  private resourceMatches(pattern: string, actual: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('/*')) {
      return actual.startsWith(pattern.slice(0, -2));
    }
    return pattern === actual;
  }

  /** Matches a capability pattern against a requested capability. */
  private capabilityMatches(granted: string, requested: string): boolean {
    if (granted === '*') return true;
    return granted === requested;
  }

  // ---------------------------------------------------------------------------
  // Utility: compute a SHA-256 CID from arbitrary data
  // ---------------------------------------------------------------------------

  /** Returns a `sha256:<hex>` content identifier string for `data`. */
  static computeCID(data: Buffer | Uint8Array | string): string {
    const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const hash = createHash('sha256').update(input).digest('hex');
    return `sha256:${hash}`;
  }
}

// ---------------------------------------------------------------------------
// Internal helper — used by signature verification when no keystore entry
// ---------------------------------------------------------------------------

/** Build a minimal 44-byte SPKI DER for a raw 32-byte Ed25519 public key. */
function buildSpkiFromRawEd25519(rawPubKey: Uint8Array): Buffer {
  const oid = Buffer.from([0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]);
  const bitStr = Buffer.concat([
    Buffer.from([0x03, 0x21, 0x00]),
    Buffer.from(rawPubKey),
  ]);
  const inner = Buffer.concat([oid, bitStr]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
}

// ---------------------------------------------------------------------------
// UCAN Revocation Registry (MCP++ Profile C §7)
// ---------------------------------------------------------------------------

/**
 * An entry in the revocation registry.
 */
export interface RevocationEntry {
  /** CID of the revoked UCAN token (sha256: prefixed hex of the raw token bytes) */
  tokenCid: string;
  /** ISO-8601 timestamp of when the revocation was recorded */
  revokedAt: string;
  /** Optional free-form reason for revocation */
  reason?: string;
  /** DID of the principal that issued the revocation */
  revokedBy?: string;
}

/**
 * In-process UCAN delegation revocation registry.
 *
 * Per MCP++ Profile C §7, any issuer or their delegate can publish a
 * revocation for a token CID.  Once recorded, any subsequent call to
 * `UCANAuth.validateToken()` (or `can()`) that encounters the revoked CID
 * will immediately return `false`.
 *
 * Persistence strategy: The registry is in-memory by default.  Persistent
 * stores (database, IPFS pinset, etc.) can be plugged in by sub-classing or
 * by subscribing to the `onRevocation` callback.
 */
export class UCANRevocationRegistry {
  private readonly revocations: Map<string, RevocationEntry> = new Map();
  private onRevocation?: (entry: RevocationEntry) => void;

  constructor(opts?: { onRevocation?: (entry: RevocationEntry) => void }) {
    this.onRevocation = opts?.onRevocation;
  }

  /**
   * Record a revocation for `tokenCid`.
   *
   * @param tokenCid   `sha256:<hex>` CID of the token to revoke.
   * @param revokedBy  Optional DID of the revoker.
   * @param reason     Optional human-readable revocation reason.
   */
  revoke(tokenCid: string, revokedBy?: string, reason?: string): RevocationEntry {
    const entry: RevocationEntry = {
      tokenCid,
      revokedAt: new Date().toISOString(),
      revokedBy,
      reason,
    };
    this.revocations.set(tokenCid, entry);
    this.onRevocation?.(entry);
    return entry;
  }

  /**
   * Revoke a token by its raw encoded string.
   * Computes the CID internally.
   */
  revokeToken(rawToken: string, revokedBy?: string, reason?: string): RevocationEntry {
    const cid = UCANAuth.computeCID(Buffer.from(rawToken, 'utf8'));
    return this.revoke(cid, revokedBy, reason);
  }

  /**
   * Revoke a UCAN token and every token in its proof chain.
   *
   * Alignment note: mirrors MCP++ delegation-chain revocation behavior used by
   * reference implementations where revocation can be applied transitively over
   * linked proofs.
   *
   * @returns number of newly-revoked token CIDs.
   */
  revokeTokenChain(rawToken: string, revokedBy?: string, reason?: string): number {
    const stack: string[] = [rawToken];
    const seen = new Set<string>();
    let added = 0;

    while (stack.length > 0) {
      const token = stack.pop();
      if (!token) continue;
      if (seen.has(token)) continue;
      seen.add(token);

      const cid = UCANAuth.computeCID(Buffer.from(token, 'utf8'));
      if (!this.revocations.has(cid)) {
        this.revoke(cid, revokedBy, reason);
        added++;
      }

      // Best-effort chain traversal: malformed proofs are ignored.
      try {
        const parsed = UCANAuth.decode(token);
        for (const proof of parsed.payload.prf) {
          if (typeof proof === 'string' && proof.length > 0) {
            stack.push(proof);
          }
        }
      } catch {
        // ignore decode failures while revoking by raw-token CID
      }
    }

    return added;
  }

  /** Returns `true` if `tokenCid` has been revoked. */
  isRevoked(tokenCid: string): boolean {
    return this.revocations.has(tokenCid);
  }

  /** Returns `true` if the raw token string has been revoked. */
  isTokenRevoked(rawToken: string): boolean {
    const cid = UCANAuth.computeCID(Buffer.from(rawToken, 'utf8'));
    return this.isRevoked(cid);
  }

  /** Return the revocation entry for `tokenCid`, or `undefined` if not revoked. */
  getRevocation(tokenCid: string): RevocationEntry | undefined {
    return this.revocations.get(tokenCid);
  }

  /** List all current revocations. */
  listRevocations(): RevocationEntry[] {
    return Array.from(this.revocations.values());
  }

  /** Remove a revocation (un-revoke). Use with care; prefer immutable append-only records in production. */
  removeRevocation(tokenCid: string): boolean {
    return this.revocations.delete(tokenCid);
  }

  /** Purge all revocations (e.g., for testing). */
  clear(): void {
    this.revocations.clear();
  }

  // ── Singleton ──────────────────────────────────────────────────────────────

  private static _instance: UCANRevocationRegistry | null = null;

  /** Returns the process-wide shared revocation registry. */
  static getInstance(): UCANRevocationRegistry {
    if (!UCANRevocationRegistry._instance) {
      UCANRevocationRegistry._instance = new UCANRevocationRegistry();
    }
    return UCANRevocationRegistry._instance;
  }
}
