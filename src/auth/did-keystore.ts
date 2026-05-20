/**
 * DIDKeystore: manages Ed25519 keypairs for did:key identities.
 *
 * Keys are stored in memory and, optionally, persisted encrypted to disk.
 * Node.js 18+ native `crypto` module provides `generateKeyPair('ed25519')`,
 * `sign`, and `verify` — no additional libraries required.
 */

import {
  createHash,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  randomBytes,
  scryptSync,
  KeyObject,
} from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyEntry {
  did: string;
  /** PKCS#8-PEM of the private key (encrypted at rest) */
  privateKeyPem: string;
  /** Raw public key bytes (32 bytes for Ed25519), base64 encoded */
  publicKeyBase64: string;
  createdAt: number;
}

export interface SerializedKeystore {
  version: 1;
  /** AES-256-GCM encrypted JSON of KeyEntry[] */
  encrypted: string;
  /** Random salt used for key derivation, hex */
  salt: string;
  /** Random IV for AES-GCM, hex */
  iv: string;
  /** GCM authentication tag, hex */
  authTag: string;
}

// ---------------------------------------------------------------------------
// Helpers: base58 (btc alphabet) for did:key encoding
// ---------------------------------------------------------------------------

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result += '1';
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

function base58Decode(str: string): Uint8Array {
  const bytes: number[] = [0];
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

// ---------------------------------------------------------------------------
// DID:key encoding
// The multicodec prefix for Ed25519 public keys is 0xed01 (varint-encoded).
// ---------------------------------------------------------------------------

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

function publicKeyBytesToDid(pubKeyBytes: Uint8Array): string {
  const prefixed = new Uint8Array(
    ED25519_MULTICODEC_PREFIX.length + pubKeyBytes.length,
  );
  prefixed.set(ED25519_MULTICODEC_PREFIX);
  prefixed.set(pubKeyBytes, ED25519_MULTICODEC_PREFIX.length);
  return `did:key:z${base58Encode(prefixed)}`;
}

export function didToPublicKeyBytes(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error(`Not a did:key DID: ${did}`);
  }
  const encoded = did.slice('did:key:z'.length);
  const prefixed = base58Decode(encoded);
  if (
    prefixed[0] !== ED25519_MULTICODEC_PREFIX[0] ||
    prefixed[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    throw new Error('DID is not an Ed25519 did:key');
  }
  return prefixed.slice(2);
}

// ---------------------------------------------------------------------------
// Encryption helpers for at-rest key storage
// ---------------------------------------------------------------------------

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32) as Buffer;
}

function encryptData(
  plaintext: string,
  passphrase: string,
): { encrypted: string; salt: string; iv: string; authTag: string } {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted =
    cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encrypted,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag,
  };
}

function decryptData(
  encrypted: string,
  passphrase: string,
  saltHex: string,
  ivHex: string,
  authTagHex: string,
): string {
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return (
    decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')
  );
}

// ---------------------------------------------------------------------------
// DIDKeystore class
// ---------------------------------------------------------------------------

export class DIDKeystore {
  /** In-memory map from DID string → KeyEntry */
  private keys: Map<string, KeyEntry> = new Map();

  /** Optional path where the keystore is persisted */
  private persistPath: string | null = null;

  /** Passphrase used to encrypt the persisted file */
  private passphrase: string | null = null;

  /**
   * Create a keystore.
   * @param persistDir  If provided, keys will be saved/loaded from `<persistDir>/did-keystore.json`.
   * @param passphrase  Passphrase for encrypting the persisted file.
   */
  constructor(persistDir?: string, passphrase?: string) {
    if (persistDir) {
      mkdirSync(persistDir, { recursive: true });
      this.persistPath = join(persistDir, 'did-keystore.json');
      this.passphrase = passphrase ?? 'swissknife-default-passphrase';
      this.load();
    }
  }

  /** Default singleton backed by `~/.swissknife/keys/` */
  private static _instance: DIDKeystore | null = null;
  static getInstance(): DIDKeystore {
    if (!DIDKeystore._instance) {
      DIDKeystore._instance = new DIDKeystore(
        join(homedir(), '.swissknife', 'keys'),
      );
    }
    return DIDKeystore._instance;
  }

  // -------------------------------------------------------------------------
  // Key Generation
  // -------------------------------------------------------------------------

  /**
   * Generate a new Ed25519 keypair, derive its did:key DID, and store it.
   * @returns The DID string for the generated key.
   */
  generateKey(): string {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });
    // The last 32 bytes of the 44-byte SPKI-DER for Ed25519 are the raw public key
    const pubKeyBytes = new Uint8Array(pubKeyDer.slice(-32));
    const did = publicKeyBytesToDid(pubKeyBytes);
    const entry: KeyEntry = {
      did,
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
      publicKeyBase64: Buffer.from(pubKeyBytes).toString('base64'),
      createdAt: Date.now(),
    };
    this.keys.set(did, entry);
    this.save();
    return did;
  }

  // -------------------------------------------------------------------------
  // Lookup
  // -------------------------------------------------------------------------

  hasDID(did: string): boolean {
    return this.keys.has(did);
  }

  listDIDs(): string[] {
    return Array.from(this.keys.keys());
  }

  getPublicKeyBytes(did: string): Uint8Array {
    const entry = this.keys.get(did);
    if (!entry) throw new Error(`DID not found in keystore: ${did}`);
    return new Uint8Array(Buffer.from(entry.publicKeyBase64, 'base64'));
  }

  // -------------------------------------------------------------------------
  // Signing / Verification
  // -------------------------------------------------------------------------

  /**
   * Sign `data` with the Ed25519 private key for `did`.
   * Returns the 64-byte signature as a `Uint8Array`.
   */
  sign(data: Uint8Array, did: string): Uint8Array {
    const entry = this.keys.get(did);
    if (!entry) throw new Error(`DID not found in keystore: ${did}`);
    const privateKey = createPrivateKey({
      key: entry.privateKeyPem,
      format: 'pem',
      type: 'pkcs8',
    });
    const sigBuffer = cryptoSign(null, data, privateKey);
    return new Uint8Array(sigBuffer);
  }

  /**
   * Verify a 64-byte Ed25519 signature against `data` for a given DID.
   */
  verify(data: Uint8Array, signature: Uint8Array, did: string): boolean {
    try {
      const pubKeyBytes = this.keys.get(did)
        ? this.getPublicKeyBytes(did)
        : didToPublicKeyBytes(did); // fallback: decode public key from DID
      // Reconstruct KeyObject from raw bytes via SPKI DER
      const spkiDer = buildEd25519SpkiDer(pubKeyBytes);
      const publicKey = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
      return cryptoVerify(null, data, publicKey, signature);
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private save(): void {
    if (!this.persistPath || !this.passphrase) return;
    const entries = Array.from(this.keys.values());
    const plaintext = JSON.stringify(entries);
    const { encrypted, salt, iv, authTag } = encryptData(
      plaintext,
      this.passphrase,
    );
    const serialized: SerializedKeystore = {
      version: 1,
      encrypted,
      salt,
      iv,
      authTag,
    };
    writeFileSync(this.persistPath, JSON.stringify(serialized, null, 2), 'utf8');
  }

  private load(): void {
    if (!this.persistPath || !this.passphrase) return;
    if (!existsSync(this.persistPath)) return;
    try {
      const raw = readFileSync(this.persistPath, 'utf8');
      const serialized: SerializedKeystore = JSON.parse(raw);
      const plaintext = decryptData(
        serialized.encrypted,
        this.passphrase,
        serialized.salt,
        serialized.iv,
        serialized.authTag,
      );
      const entries: KeyEntry[] = JSON.parse(plaintext);
      for (const entry of entries) {
        this.keys.set(entry.did, entry);
      }
    } catch {
      // Corrupt or unreadable keystore — start fresh
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: build SPKI DER for a raw 32-byte Ed25519 public key
// ---------------------------------------------------------------------------

/**
 * Constructs the 44-byte ASN.1 SPKI DER encoding for an Ed25519 public key
 * from its raw 32-byte form, without requiring any ASN.1 library.
 *
 * The structure is:
 *   SEQUENCE (44) {
 *     SEQUENCE (5) { OID 1.3.101.112 }
 *     BIT STRING (34) { 0x00 <32 bytes> }
 *   }
 */
function buildEd25519SpkiDer(rawPubKey: Uint8Array): Buffer {
  // OID for id-EdDSA (1.3.101.112) = 3b 65 70
  const oid = Buffer.from([0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]);
  // BIT STRING: leading 0x00 byte + 32 raw key bytes
  const bitStr = Buffer.concat([
    Buffer.from([0x03, 0x21, 0x00]),
    Buffer.from(rawPubKey),
  ]);
  const inner = Buffer.concat([oid, bitStr]);
  const outer = Buffer.concat([
    Buffer.from([0x30, inner.length]),
    inner,
  ]);
  return outer;
}

// Export hash helper for use by other modules
export function sha256(data: Uint8Array | string): string {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  return createHash('sha256').update(input).digest('hex');
}

// Export base64url encoder/decoder
export function base64urlEncode(data: Buffer | Uint8Array): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function base64urlDecode(str: string): Buffer {
  const padded = str.padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
