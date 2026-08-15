/**
 * Canonical GUI content identity and provenance (VGO-010).
 *
 * TypeScript mirror of
 * `ipfs_datasets_py.logic.gui_optimizer.identity` (GuiCanonicalIdentity@1 /
 * TypeScriptGuiCanonicalIdentity@1).  Implements the same closed CIDv1 /
 * SHA-256 / raw / base32 profile, domain-separated preimages, material
 * normalization, and UiComponentVersionCompiler@1 so Python and TypeScript
 * produce identical canonical bytes, digests, and CIDs for the same payload.
 *
 * Never imports semantic-index, proof-cache, or model-routing code.
 */

import { hexToBytes, sha256Hex } from "../shared/shared-browser-crypto.js";
import {
  CANONICAL_JSON_PROFILE,
  UI_COMPONENT_IDENTITY_INTERFACE,
  UI_COMPONENT_IDENTITY_SCHEMA,
  UI_COMPONENT_VERSION_INTERFACE,
  UI_COMPONENT_VERSION_SCHEMA,
  decodeUiComponentIdentity,
  decodeUiComponentVersion,
  type GuiComponentKind,
  type UiComponentIdentity,
  type UiComponentVersion,
} from "./models.js";

// ---------------------------------------------------------------------------
// Profile constants (fixed wire form — must match Python)
// ---------------------------------------------------------------------------

export const IDENTITY_PROFILE_NAME =
  "gui-optimizer-canonical-identity/v1" as const;
export const GUI_CANONICAL_IDENTITY_INTERFACE =
  "GuiCanonicalIdentity@1" as const;
export const GUI_CANONICAL_IDENTITY_SCHEMA =
  "gui-canonical-identity/v1" as const;
/** TypeScript surface label for the same profile (board interface). */
export const TYPESCRIPT_GUI_CANONICAL_IDENTITY_INTERFACE =
  "TypeScriptGuiCanonicalIdentity@1" as const;
export const GUI_ARTIFACT_DIGEST_INTERFACE = "GuiArtifactDigest@1" as const;
export const GUI_ARTIFACT_DIGEST_SCHEMA = "gui-artifact-digest/v1" as const;
export const UI_COMPONENT_VERSION_COMPILER_INTERFACE =
  "UiComponentVersionCompiler@1" as const;
export const UI_COMPONENT_VERSION_COMPILER_SCHEMA =
  "ui-component-version-compiler/v1" as const;

export const DOMAIN_STABLE_IDENTITY = "gui.stable-identity" as const;
export const DOMAIN_COMPONENT_VERSION = "gui.component-version" as const;
export const DOMAIN_ARTIFACT = "gui.artifact" as const;
export const DOMAIN_APPLICATION = "gui.application-identity" as const;
export const DOMAIN_SCREEN = "gui.screen-identity" as const;

export const CID_VERSION = 1 as const;
export const MULTICODEC_NAME = "raw" as const;
export const MULTICODEC_CODE = 0x55 as const;
export const MULTIHASH_NAME = "sha2-256" as const;
export const MULTIHASH_CODE = 0x12 as const;
export const DIGEST_SIZE = 32 as const;
export const MULTIBASE_NAME = "base32" as const;

/** Narrower GUI interoperability domain; the Python IR primitive is broader. */
export const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

const PROVENANCE_KEYS = new Set([
  "start_line",
  "end_line",
  "start_column",
  "end_column",
  "absolute_path",
  "checkout_path",
  "source_path",
  "file_path",
  "source_span",
  "byte_offset",
  "char_offset",
]);

const WS_RE = /[ \t]+/g;

// Unicode White_Space from PropList.txt, spelled out so host ``trim``
// behavior never becomes wire authority. U+001C and U+FEFF are intentionally
// absent from this shared Python/TypeScript profile.
const PROFILE_TRIM_CODE_POINTS = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
  0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

const FACET_NAMES = [
  "structure",
  "props",
  "state",
  "handlers",
  "accessibility",
  "styles",
  "actions",
  "localization",
] as const;

const STABLE_IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const EXTRACTOR_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

// ---------------------------------------------------------------------------
// Errors / types
// ---------------------------------------------------------------------------

export class GuiIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuiIdentityError";
  }
}

export interface IdentityProfile {
  readonly name: string;
  readonly canonicalization: string;
  readonly digest: string;
  readonly digest_size: number;
  readonly cid_version: number;
  readonly multicodec: string;
  readonly multicodec_code: number;
  readonly multihash: string;
  readonly multihash_code: number;
  readonly multibase: string;
}

export const IDENTITY_PROFILE: IdentityProfile = Object.freeze({
  name: IDENTITY_PROFILE_NAME,
  canonicalization: CANONICAL_JSON_PROFILE,
  digest: "sha256",
  digest_size: DIGEST_SIZE,
  cid_version: CID_VERSION,
  multicodec: MULTICODEC_NAME,
  multicodec_code: MULTICODEC_CODE,
  multihash: MULTIHASH_NAME,
  multihash_code: MULTIHASH_CODE,
  multibase: MULTIBASE_NAME,
});

export interface GuiCanonicalIdentity {
  readonly interface: typeof GUI_CANONICAL_IDENTITY_INTERFACE;
  readonly wire_schema_version: typeof GUI_CANONICAL_IDENTITY_SCHEMA;
  readonly profile: string;
  readonly domain: string;
  readonly schema_version: string;
  /** UTF-8 canonical preimage bytes retained for rehash. */
  readonly canonical_bytes: Uint8Array;
  readonly digest: string;
  readonly cid: string;
}

export interface GuiArtifactDigest {
  readonly interface: typeof GUI_ARTIFACT_DIGEST_INTERFACE;
  readonly schema_version: typeof GUI_ARTIFACT_DIGEST_SCHEMA;
  readonly digest: string;
  readonly cid: string;
  readonly domain: string;
  readonly canonical_bytes: Uint8Array;
}

export interface ComponentMaterial {
  readonly structure?: unknown;
  readonly props?: unknown;
  readonly state?: unknown;
  readonly handlers?: unknown;
  readonly accessibility?: unknown;
  readonly styles?: unknown;
  readonly actions?: unknown;
  readonly localization?: unknown;
  readonly [key: string]: unknown;
}

export interface UiComponentVersionCompiler {
  readonly interface: typeof UI_COMPONENT_VERSION_COMPILER_INTERFACE;
  readonly schema_version: typeof UI_COMPONENT_VERSION_COMPILER_SCHEMA;
  readonly extractorVersion: string;
  compile(
    stableIdentity: UiComponentIdentity | Record<string, unknown>,
    material: ComponentMaterial,
    options?: { optimizerSchemaVersion?: string },
  ): UiComponentVersion;
  identityFor(
    stableIdentity: UiComponentIdentity | Record<string, unknown>,
    material: ComponentMaterial,
    options?: { optimizerSchemaVersion?: string },
  ): GuiCanonicalIdentity;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function encodeVarint(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new GuiIdentityError(
      "unsigned varints cannot encode negative values",
    );
  }
  const bytes: number[] = [];
  let remaining = value >>> 0;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining);
  return bytes;
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string): Uint8Array {
  let bits = 0;
  let buffer = 0;
  const out: number[] = [];
  for (const char of value.toLowerCase()) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) {
      throw new GuiIdentityError(`invalid base32 character ${char}`);
    }
    buffer = (buffer << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

function assertUnicodeScalarString(text: string, label: string): void {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const following = text.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) {
        throw new GuiIdentityError(
          `${label} contains an unpaired Unicode surrogate`,
        );
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new GuiIdentityError(
        `${label} contains an unpaired Unicode surrogate`,
      );
    }
  }
}

function nfc(text: string, label = "string"): string {
  assertUnicodeScalarString(text, label);
  const normalized = text.normalize("NFC");
  assertUnicodeScalarString(normalized, label);
  return normalized;
}

function trimProfileWhitespace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && PROFILE_TRIM_CODE_POINTS.has(value.charCodeAt(start))) {
    start += 1;
  }
  while (
    end > start &&
    PROFILE_TRIM_CODE_POINTS.has(value.charCodeAt(end - 1))
  ) {
    end -= 1;
  }
  return value.slice(start, end);
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftScalars = Array.from(left);
  const rightScalars = Array.from(right);
  const sharedLength = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftPoint = leftScalars[index].codePointAt(0);
    const rightPoint = rightScalars[index].codePointAt(0);
    if (leftPoint === undefined || rightPoint === undefined) {
      throw new GuiIdentityError("map key contains an empty Unicode scalar");
    }
    const difference = leftPoint - rightPoint;
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// ---------------------------------------------------------------------------
// Digest / CID primitives
// ---------------------------------------------------------------------------

export function sha256Digest(data: Uint8Array | string): string {
  return `sha256:${sha256Hex(data)}`;
}

export function cidV1FromDigest(digest: Uint8Array): string {
  if (digest.length !== DIGEST_SIZE) {
    throw new GuiIdentityError(
      `${MULTIHASH_NAME} digest must be exactly ${DIGEST_SIZE} bytes`,
    );
  }
  const cid = Uint8Array.from([
    ...encodeVarint(CID_VERSION),
    ...encodeVarint(MULTICODEC_CODE),
    ...encodeVarint(MULTIHASH_CODE),
    ...encodeVarint(DIGEST_SIZE),
    ...digest,
  ]);
  return `b${base32Encode(cid)}`;
}

export function cidV1(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? utf8Encode(data) : data;
  return cidV1FromDigest(hexToBytes(sha256Hex(bytes)));
}

export function parseCidV1(cid: string): {
  version: number;
  multicodec: string;
  multicodec_code: number;
  multihash: string;
  multihash_code: number;
  digest: string;
  digest_label: string;
  cid: string;
} {
  if (typeof cid !== "string" || !cid.startsWith("b")) {
    throw new GuiIdentityError(
      "CID must be a lowercase base32 multibase string",
    );
  }
  if (cid !== cid.toLowerCase()) {
    throw new GuiIdentityError("CID must be lowercase");
  }
  const raw = base32Decode(cid.slice(1));
  if (
    raw.length !== 36 ||
    raw[0] !== CID_VERSION ||
    raw[1] !== MULTICODEC_CODE ||
    raw[2] !== MULTIHASH_CODE ||
    raw[3] !== DIGEST_SIZE
  ) {
    throw new GuiIdentityError(
      "CID must be CIDv1 raw sha2-256 with a 32-byte digest",
    );
  }
  const digest = raw.slice(4);
  const recomputed = cidV1FromDigest(digest);
  if (recomputed !== cid) {
    throw new GuiIdentityError("CID is not in canonical base32 form");
  }
  const hex = bytesToHex(digest);
  return {
    version: CID_VERSION,
    multicodec: MULTICODEC_NAME,
    multicodec_code: MULTICODEC_CODE,
    multihash: MULTIHASH_NAME,
    multihash_code: MULTIHASH_CODE,
    digest: hex,
    digest_label: `sha256:${hex}`,
    cid,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Canonical JSON (must match Python identity.canonical_json_bytes)
// ---------------------------------------------------------------------------

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return utf8Encode(canonicalJson(value));
}

export function canonicalJson(value: unknown): string {
  return encodeCanonical(value, "$");
}

function canonicalNumber(value: number, label: string): string {
  if (!Number.isFinite(value)) {
    throw new GuiIdentityError(`${label} numbers must be finite`);
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new GuiIdentityError(
      `${label} integer-valued number exceeds the GUI safe-integer domain`,
    );
  }
  if (Object.is(value, -0) || value === 0) return "0";

  let source = value.toString().toLowerCase();
  let sign = "";
  if (source.startsWith("-")) {
    sign = "-";
    source = source.slice(1);
  }

  const exponentOffset = source.indexOf("e");
  const coefficient =
    exponentOffset === -1 ? source : source.slice(0, exponentOffset);
  const exponent =
    exponentOffset === -1 ? 0 : Number(source.slice(exponentOffset + 1));
  const pointOffset = coefficient.indexOf(".");
  const point =
    (pointOffset === -1 ? coefficient.length : pointOffset) + exponent;
  const digits = coefficient.replace(".", "");

  let body: string;
  if (point <= 0) {
    body = `0.${"0".repeat(-point)}${digits}`;
  } else if (point >= digits.length) {
    body = `${digits}${"0".repeat(point - digits.length)}`;
  } else {
    body = `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  if (body.includes(".")) {
    body = body.replace(/0+$/, "").replace(/\.$/, "");
  }
  return `${sign}${body}`;
}

function encodeCanonical(value: unknown, path: string): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") {
    return JSON.stringify(nfc(value, path));
  }
  if (typeof value === "number") {
    return canonicalNumber(value, `canonical JSON at ${path}`);
  }
  if (Array.isArray(value)) {
    const encoded: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new GuiIdentityError(`${path} contains a sparse array slot`);
      }
      encoded.push(encodeCanonical(value[index], `${path}[${index}]`));
    }
    return `[${encoded.join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    // Support models with toDict/to_dict if present.
    if (typeof (record as { to_dict?: unknown }).to_dict === "function") {
      return encodeCanonical(
        (record as { to_dict: () => unknown }).to_dict(),
        path,
      );
    }
    if (typeof (record as { toDict?: unknown }).toDict === "function") {
      return encodeCanonical(
        (record as { toDict: () => unknown }).toDict(),
        path,
      );
    }
    if (!isPlainObject(value)) {
      throw new GuiIdentityError(
        `${path} is not JSON-serializable for identity: host object`,
      );
    }
    if (Object.getOwnPropertySymbols(record).length > 0) {
      throw new GuiIdentityError(`${path} map keys must be strings`);
    }
    if (
      Object.getOwnPropertyNames(record).length !== Object.keys(record).length
    ) {
      throw new GuiIdentityError(`${path} contains non-enumerable map fields`);
    }
    const ready = new Map<string, unknown>();
    const originals = new Map<string, string>();
    for (const [key, item] of Object.entries(record)) {
      if (typeof key !== "string") {
        throw new GuiIdentityError(`${path} map keys must be strings`);
      }
      const normalizedKey = nfc(key, `${path} map key`);
      if (ready.has(normalizedKey)) {
        const originalKey = originals.get(normalizedKey) ?? normalizedKey;
        throw new GuiIdentityError(
          `map keys collide after NFC at ${path}: ` +
            `${originalKey} and ${key}`,
        );
      }
      ready.set(normalizedKey, item);
      originals.set(normalizedKey, key);
    }
    const keys = [...ready.keys()].sort(compareUnicodeCodePoints);
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${encodeCanonical(
            ready.get(key),
            `${path}.${key}`,
          )}`,
      )
      .join(",")}}`;
  }
  throw new GuiIdentityError(
    `${path} is not JSON-serializable for identity: ${typeof value}`,
  );
}

// ---------------------------------------------------------------------------
// Domain-separated identity
// ---------------------------------------------------------------------------

function normalizedDiscriminator(value: string, label: string): string {
  if (typeof value !== "string") {
    throw new GuiIdentityError(`${label} must be a string`);
  }
  const normalized = nfc(value, label);
  if (!normalized || trimProfileWhitespace(normalized) !== normalized) {
    throw new GuiIdentityError(
      `${label} must be non-empty and have no surrounding whitespace`,
    );
  }
  return normalized;
}

export function identityPreimage(
  payload: unknown,
  options: { domain: string; schemaVersion: string },
): Uint8Array {
  const domain = normalizedDiscriminator(options.domain, "domain");
  const schemaVersion = normalizedDiscriminator(
    options.schemaVersion,
    "schema_version",
  );
  const payloadBytes = canonicalJsonBytes(payload);
  // Assemble envelope fields in map-key order with embedded payload bytes.
  const parts: Uint8Array[] = [];
  const fields: Array<[string, Uint8Array]> = [
    ['"canonicalization":', canonicalJsonBytes(CANONICAL_JSON_PROFILE)],
    ['"domain":', canonicalJsonBytes(domain)],
    ['"identity_profile":', canonicalJsonBytes(IDENTITY_PROFILE_NAME)],
    ['"payload":', payloadBytes],
    ['"schema_version":', canonicalJsonBytes(schemaVersion)],
  ];
  const encoder = new TextEncoder();
  parts.push(encoder.encode("{"));
  fields.forEach(([key, value], index) => {
    if (index > 0) parts.push(encoder.encode(","));
    parts.push(encoder.encode(key));
    parts.push(value);
  });
  parts.push(encoder.encode("}"));
  return concatBytes(parts);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function requireIdentityPreimageMetadata(
  preimage: Uint8Array,
  domain: string,
  schemaVersion: string,
): void {
  const normalizedDomain = normalizedDiscriminator(domain, "domain");
  const normalizedVersion = normalizedDiscriminator(
    schemaVersion,
    "schema_version",
  );
  const text = utf8Decode(preimage);
  const prefix =
    '{"canonicalization":' +
    canonicalJson(CANONICAL_JSON_PROFILE) +
    ',"domain":' +
    canonicalJson(normalizedDomain) +
    ',"identity_profile":' +
    canonicalJson(IDENTITY_PROFILE_NAME) +
    ',"payload":';
  const suffix = ',"schema_version":' + canonicalJson(normalizedVersion) + "}";
  if (!text.startsWith(prefix) || !text.endsWith(suffix)) {
    throw new GuiIdentityError(
      "retained canonical bytes do not bind the claimed metadata",
    );
  }
}

export function canonicalIdentity(
  payload: unknown,
  options: { domain: string; schemaVersion: string },
): GuiCanonicalIdentity {
  const preimage = identityPreimage(payload, options);
  const digestHex = sha256Hex(preimage);
  const digest = `sha256:${digestHex}`;
  const cid = cidV1FromDigest(hexToBytes(digestHex));
  return Object.freeze({
    interface: GUI_CANONICAL_IDENTITY_INTERFACE,
    wire_schema_version: GUI_CANONICAL_IDENTITY_SCHEMA,
    profile: IDENTITY_PROFILE_NAME,
    domain: normalizedDiscriminator(options.domain, "domain"),
    schema_version: normalizedDiscriminator(
      options.schemaVersion,
      "schema_version",
    ),
    canonical_bytes: preimage,
    digest,
    cid,
  });
}

export const computeIdentity = canonicalIdentity;
export const identityFor = canonicalIdentity;

export function rehashIdentity(
  identity: GuiCanonicalIdentity,
): GuiCanonicalIdentity {
  if (
    identity.interface !== GUI_CANONICAL_IDENTITY_INTERFACE ||
    identity.wire_schema_version !== GUI_CANONICAL_IDENTITY_SCHEMA ||
    identity.profile !== IDENTITY_PROFILE_NAME
  ) {
    throw new GuiIdentityError("identity metadata does not match the profile");
  }
  requireIdentityPreimageMetadata(
    identity.canonical_bytes,
    identity.domain,
    identity.schema_version,
  );
  const digestHex = sha256Hex(identity.canonical_bytes);
  const digest = `sha256:${digestHex}`;
  const cid = cidV1FromDigest(hexToBytes(digestHex));
  if (digest !== identity.digest || cid !== identity.cid) {
    throw new GuiIdentityError(
      "identity does not rehash from retained canonical bytes",
    );
  }
  return Object.freeze({ ...identity, digest, cid });
}

export function verifyIdentity(
  identity: GuiCanonicalIdentity,
  payload: unknown,
  options?: { domain?: string; schemaVersion?: string },
): GuiCanonicalIdentity {
  rehashIdentity(identity);
  const recomputed = canonicalIdentity(payload, {
    domain: options?.domain ?? identity.domain,
    schemaVersion: options?.schemaVersion ?? identity.schema_version,
  });
  if (
    recomputed.digest !== identity.digest ||
    recomputed.cid !== identity.cid ||
    utf8Decode(recomputed.canonical_bytes) !==
      utf8Decode(identity.canonical_bytes)
  ) {
    throw new GuiIdentityError(
      "claimed identity does not match recomputed payload identity",
    );
  }
  return recomputed;
}

// ---------------------------------------------------------------------------
// Material normalization
// ---------------------------------------------------------------------------

export function normalizeMaterial(value: unknown): unknown {
  return normalizeValue(value);
}

function normalizeValue(value: unknown): unknown {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    canonicalNumber(value, "material");
    return value;
  }
  if (typeof value === "string") {
    let text = nfc(value, "material string");
    text = text.replace(WS_RE, " ");
    text = trimProfileWhitespace(text.replace(/\n+/g, "\n"));
    return text;
  }
  if (Array.isArray(value)) {
    const normalized: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new GuiIdentityError("material contains a sparse array slot");
      }
      normalized.push(normalizeValue(value[index]));
    }
    return normalized;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof (record as { to_dict?: unknown }).to_dict === "function") {
      return normalizeValue((record as { to_dict: () => unknown }).to_dict());
    }
    if (typeof (record as { toDict?: unknown }).toDict === "function") {
      return normalizeValue((record as { toDict: () => unknown }).toDict());
    }
    if (!isPlainObject(value)) {
      throw new GuiIdentityError("material host object is not identity-safe");
    }
    if (Object.getOwnPropertySymbols(record).length > 0) {
      throw new GuiIdentityError("material map keys must be strings");
    }
    if (
      Object.getOwnPropertyNames(record).length !== Object.keys(record).length
    ) {
      throw new GuiIdentityError("material contains non-enumerable map fields");
    }
    const ready = new Map<string, unknown>();
    const originals = new Map<string, string>();
    for (const [key, item] of Object.entries(record)) {
      const normalizedKey = nfc(key, "material map key");
      if (originals.has(normalizedKey)) {
        const originalKey = originals.get(normalizedKey) ?? normalizedKey;
        throw new GuiIdentityError(
          "material map keys collide after NFC normalization: " +
            `${originalKey} and ${key}`,
        );
      }
      originals.set(normalizedKey, key);
      if (
        PROVENANCE_KEYS.has(normalizedKey) ||
        PROVENANCE_KEYS.has(normalizedKey.toLowerCase())
      ) {
        continue;
      }
      ready.set(normalizedKey, normalizeValue(item));
    }
    return Object.fromEntries(
      [...ready.entries()].sort(([left], [right]) =>
        compareUnicodeCodePoints(left, right),
      ),
    );
  }
  throw new GuiIdentityError(
    `material value type ${typeof value} is not identity-safe`,
  );
}

// ---------------------------------------------------------------------------
// Artifact digests
// ---------------------------------------------------------------------------

export function artifactDigest(
  material: unknown,
  options?: { domain?: string },
): GuiArtifactDigest {
  const domain = normalizedDiscriminator(
    options?.domain ?? DOMAIN_ARTIFACT,
    "domain",
  );
  const normalized = normalizeMaterial(material);
  // Reuse the one canonical domain-separated preimage profile; artifact
  // records retain those exact bytes so their declared domain is rehashable.
  const preimage = identityPreimage(normalized, {
    domain,
    schemaVersion: GUI_ARTIFACT_DIGEST_SCHEMA,
  });
  const digestHex = sha256Hex(preimage);
  return Object.freeze({
    interface: GUI_ARTIFACT_DIGEST_INTERFACE,
    schema_version: GUI_ARTIFACT_DIGEST_SCHEMA,
    digest: `sha256:${digestHex}`,
    cid: cidV1FromDigest(hexToBytes(digestHex)),
    domain,
    canonical_bytes: preimage,
  });
}

export function rehashArtifactDigest(
  artifact: GuiArtifactDigest,
): GuiArtifactDigest {
  if (
    artifact.interface !== GUI_ARTIFACT_DIGEST_INTERFACE ||
    artifact.schema_version !== GUI_ARTIFACT_DIGEST_SCHEMA
  ) {
    throw new GuiIdentityError(
      "artifact digest metadata does not match the profile",
    );
  }
  requireIdentityPreimageMetadata(
    artifact.canonical_bytes,
    artifact.domain,
    artifact.schema_version,
  );
  const digestHex = sha256Hex(artifact.canonical_bytes);
  const digest = `sha256:${digestHex}`;
  const cid = cidV1FromDigest(hexToBytes(digestHex));
  if (digest !== artifact.digest || cid !== artifact.cid) {
    throw new GuiIdentityError(
      "artifact digest does not rehash from retained canonical bytes",
    );
  }
  return Object.freeze({ ...artifact, digest, cid });
}

export function facetDigest(material: unknown): string {
  return artifactDigest(material).digest;
}

// ---------------------------------------------------------------------------
// Stable logical identity
// ---------------------------------------------------------------------------

export function buildStableIdentity(input: {
  applicationId: string;
  qualifiedName: string;
  componentKind: GuiComponentKind | string;
  packageNamespace: string;
  screenId?: string;
}): UiComponentIdentity {
  const checkedInput = requireClosedPlainObject(
    input,
    "stable identity input",
    STABLE_IDENTITY_INPUT_FIELDS,
    STABLE_IDENTITY_REQUIRED_FIELDS,
  );
  return decodeStableIdentity({
    interface: UI_COMPONENT_IDENTITY_INTERFACE,
    schema_version: UI_COMPONENT_IDENTITY_SCHEMA,
    application_id: checkedInput.applicationId,
    qualified_name: checkedInput.qualifiedName,
    component_kind: checkedInput.componentKind,
    package_namespace: checkedInput.packageNamespace,
    screen_id: checkedInput.screenId === undefined ? "" : checkedInput.screenId,
  });
}

export function stableIdentityRecord(
  identity: UiComponentIdentity | Record<string, unknown>,
): GuiCanonicalIdentity {
  const decoded = decodeStableIdentity(identity);
  return canonicalIdentity(componentIdentityToDict(decoded), {
    domain: DOMAIN_STABLE_IDENTITY,
    schemaVersion: UI_COMPONENT_IDENTITY_SCHEMA,
  });
}

function componentIdentityToDict(
  identity: UiComponentIdentity,
): Record<string, unknown> {
  // Key order does not matter; canonical JSON sorts keys.
  return {
    application_id: identity.application_id,
    component_kind: identity.component_kind,
    interface: identity.interface,
    package_namespace: identity.package_namespace,
    qualified_name: identity.qualified_name,
    schema_version: identity.schema_version,
    screen_id: identity.screen_id,
  };
}

function decodeStableIdentity(value: unknown): UiComponentIdentity {
  if (!isPlainObject(value) || typeof value.screen_id !== "string") {
    throw new GuiIdentityError("screen_id must be a string");
  }
  if (value.screen_id !== "" && !STABLE_IDENTIFIER_RE.test(value.screen_id)) {
    throw new GuiIdentityError("screen_id is not a stable identifier");
  }
  const decoded = decodeUiComponentIdentity(value);
  return decoded;
}

function requireExtractorVersion(value: unknown): string {
  if (typeof value !== "string" || !EXTRACTOR_VERSION_RE.test(value)) {
    throw new GuiIdentityError("extractorVersion is not a valid version token");
  }
  return value;
}

function requireClosedPlainObject(
  value: unknown,
  label: string,
  allowedFields: ReadonlySet<string>,
  requiredFields: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new GuiIdentityError(`${label} must be an exact plain object`);
  }
  const record = value as Record<string, unknown>;
  const enumerableNames = Object.keys(record);
  if (
    Object.getOwnPropertySymbols(record).length > 0 ||
    Object.getOwnPropertyNames(record).length !== enumerableNames.length
  ) {
    throw new GuiIdentityError(
      `${label} must contain enumerable string fields`,
    );
  }
  for (const field of enumerableNames) {
    if (!allowedFields.has(field)) {
      throw new GuiIdentityError(`${label} contains unknown field ${field}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, field);
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new GuiIdentityError(`${label}.${field} must be a data field`);
    }
  }
  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      throw new GuiIdentityError(`${label} is missing required field ${field}`);
    }
  }
  return record;
}

function optimizerSchemaVersionOption(
  options: Record<string, unknown>,
  label: string,
): string | undefined {
  if (
    !Object.prototype.hasOwnProperty.call(options, "optimizerSchemaVersion")
  ) {
    return undefined;
  }
  if (typeof options.optimizerSchemaVersion !== "string") {
    throw new GuiIdentityError(
      `${label}.optimizerSchemaVersion must be a string`,
    );
  }
  return options.optimizerSchemaVersion;
}

const DIRECT_COMPILER_OPTION_FIELDS = new Set([
  "extractorVersion",
  "optimizerSchemaVersion",
]);
const FACTORY_OPTION_FIELDS = new Set(["extractorVersion"]);
const FACADE_COMPILE_OPTION_FIELDS = new Set(["optimizerSchemaVersion"]);
const STABLE_IDENTITY_INPUT_FIELDS = new Set([
  "applicationId",
  "qualifiedName",
  "componentKind",
  "packageNamespace",
  "screenId",
]);
const STABLE_IDENTITY_REQUIRED_FIELDS = new Set([
  "applicationId",
  "qualifiedName",
  "componentKind",
  "packageNamespace",
]);

// ---------------------------------------------------------------------------
// UiComponentVersionCompiler@1
// ---------------------------------------------------------------------------

export function compileComponentVersion(
  stableIdentity: UiComponentIdentity | Record<string, unknown>,
  material: ComponentMaterial,
  options: {
    extractorVersion: string;
    optimizerSchemaVersion?: string;
  },
): UiComponentVersion {
  const identity = decodeStableIdentity(stableIdentity);
  if (!isPlainObject(material)) {
    throw new GuiIdentityError(
      "material must be a plain object of named facets",
    );
  }
  const checkedOptions = requireClosedPlainObject(
    options,
    "compiler options",
    DIRECT_COMPILER_OPTION_FIELDS,
  );
  const extractorVersion = requireExtractorVersion(
    checkedOptions.extractorVersion,
  );
  const optimizerSchemaVersion = optimizerSchemaVersionOption(
    checkedOptions,
    "compiler options",
  );

  const digests: Record<string, string> = {};
  for (const name of FACET_NAMES) {
    const facet = Object.prototype.hasOwnProperty.call(material, name)
      ? material[name]
      : {};
    digests[`${name}_digest`] = facetDigest(facet);
  }

  return decodeUiComponentVersion({
    interface: UI_COMPONENT_VERSION_INTERFACE,
    schema_version: UI_COMPONENT_VERSION_SCHEMA,
    stable_identity: componentIdentityToDict(identity),
    structure_digest: digests.structure_digest,
    props_digest: digests.props_digest,
    state_digest: digests.state_digest,
    handlers_digest: digests.handlers_digest,
    accessibility_digest: digests.accessibility_digest,
    styles_digest: digests.styles_digest,
    actions_digest: digests.actions_digest,
    localization_digest: digests.localization_digest,
    extractor_version: extractorVersion,
    optimizer_schema_version:
      optimizerSchemaVersion === undefined
        ? UI_COMPONENT_VERSION_SCHEMA
        : optimizerSchemaVersion,
  });
}

export function componentVersionIdentity(
  version: UiComponentVersion | Record<string, unknown>,
): GuiCanonicalIdentity {
  if (!isPlainObject(version)) {
    throw new GuiIdentityError("component version must be a plain object");
  }
  decodeStableIdentity(version.stable_identity);
  const decoded = decodeUiComponentVersion(version);
  return canonicalIdentity(componentVersionToDict(decoded), {
    domain: DOMAIN_COMPONENT_VERSION,
    schemaVersion: UI_COMPONENT_VERSION_SCHEMA,
  });
}

function componentVersionToDict(
  version: UiComponentVersion,
): Record<string, unknown> {
  return {
    accessibility_digest: version.accessibility_digest,
    actions_digest: version.actions_digest,
    extractor_version: version.extractor_version,
    handlers_digest: version.handlers_digest,
    interface: version.interface,
    localization_digest: version.localization_digest,
    optimizer_schema_version: version.optimizer_schema_version,
    props_digest: version.props_digest,
    schema_version: version.schema_version,
    stable_identity: componentIdentityToDict(version.stable_identity),
    state_digest: version.state_digest,
    structure_digest: version.structure_digest,
    styles_digest: version.styles_digest,
  };
}

export function createComponentVersionCompiler(options: {
  extractorVersion: string;
}): UiComponentVersionCompiler {
  const checkedOptions = requireClosedPlainObject(
    options,
    "compiler factory options",
    FACTORY_OPTION_FIELDS,
  );
  const extractorVersion = requireExtractorVersion(
    checkedOptions.extractorVersion,
  );
  return Object.freeze({
    interface: UI_COMPONENT_VERSION_COMPILER_INTERFACE,
    schema_version: UI_COMPONENT_VERSION_COMPILER_SCHEMA,
    extractorVersion,
    compile(
      stableIdentity: UiComponentIdentity | Record<string, unknown>,
      material: ComponentMaterial,
      compileOptions?: { optimizerSchemaVersion?: string },
    ) {
      const checkedCompileOptions =
        compileOptions === undefined
          ? {}
          : requireClosedPlainObject(
              compileOptions,
              "compiler facade options",
              FACADE_COMPILE_OPTION_FIELDS,
            );
      const optimizerSchemaVersion = optimizerSchemaVersionOption(
        checkedCompileOptions,
        "compiler facade options",
      );
      return compileComponentVersion(stableIdentity, material, {
        extractorVersion,
        ...(optimizerSchemaVersion === undefined
          ? {}
          : { optimizerSchemaVersion }),
      });
    },
    identityFor(
      stableIdentity: UiComponentIdentity | Record<string, unknown>,
      material: ComponentMaterial,
      compileOptions?: { optimizerSchemaVersion?: string },
    ) {
      const checkedCompileOptions =
        compileOptions === undefined
          ? {}
          : requireClosedPlainObject(
              compileOptions,
              "compiler facade options",
              FACADE_COMPILE_OPTION_FIELDS,
            );
      const optimizerSchemaVersion = optimizerSchemaVersionOption(
        checkedCompileOptions,
        "compiler facade options",
      );
      const version = compileComponentVersion(stableIdentity, material, {
        extractorVersion,
        ...(optimizerSchemaVersion === undefined
          ? {}
          : { optimizerSchemaVersion }),
      });
      return componentVersionIdentity(version);
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers for tests / consumers
// ---------------------------------------------------------------------------

export function identityProfileDescriptor(): IdentityProfile {
  return IDENTITY_PROFILE;
}

export function canonicalBytesToString(bytes: Uint8Array): string {
  return utf8Decode(bytes);
}
