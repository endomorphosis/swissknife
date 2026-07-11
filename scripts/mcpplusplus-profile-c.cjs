const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ucans = require("@ucans/ucans");
const { cidForBytes } = require("./mcpplusplus-profile-a.cjs");

const PROFILE_C_CAPABILITY = "mcp++/ucan";
const IDENTITY_ABILITY = "IDENTIFY";
const IDENTITY_TTL_SECONDS = 120;
const MAX_DELEGATION_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_IDENTITY_ROOT = path.join(
  os.homedir(),
  ".cache",
  "swissknife",
  "mcpplusplus-ucan",
);
const services = new Map();

function identityCapability(service) {
  return {
    resource: `mcp++://${service}/peer`,
    ability: `mcp++/${IDENTITY_ABILITY}`,
  };
}

function validateDid(value, fieldName) {
  if (typeof value !== "string" || !/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
    throw new Error(`${fieldName} must be an Ed25519 did:key DID.`);
  }
  return value;
}

function cacheRoot() {
  return path.resolve(process.env.MCPPLUSPLUS_UCAN_KEY_DIR || DEFAULT_IDENTITY_ROOT);
}

function servicePath(service, suffix) {
  const safeService = String(service).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(cacheRoot(), `${safeService}.${suffix}.json`);
}

function writeJsonAtomically(filePath, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, mode);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

function resourcePointer(resource) {
  if (typeof resource !== "string") throw new Error("UCAN capability resource must be a string.");
  const separator = resource.indexOf(":");
  if (separator <= 0) throw new Error("UCAN capability resource must be a URI.");
  return { scheme: resource.slice(0, separator), hierPart: resource.slice(separator + 1) };
}

function abilityPointer(ability) {
  if (typeof ability !== "string" || ability.length === 0) {
    throw new Error("UCAN capability ability must be a non-empty string.");
  }
  const [namespace, ...segments] = ability.split("/");
  if (!namespace) throw new Error("UCAN capability ability must include a namespace.");
  return { namespace, segments };
}

function pointerToResource(pointer) {
  if (typeof pointer === "string") return pointer;
  if (!pointer || typeof pointer !== "object" || typeof pointer.scheme !== "string" || typeof pointer.hierPart !== "string") {
    throw new Error("UCAN capability resource pointer is invalid.");
  }
  return `${pointer.scheme}:${pointer.hierPart}`;
}

function pointerToAbility(pointer) {
  if (typeof pointer === "string") return pointer;
  if (!pointer || typeof pointer !== "object" || typeof pointer.namespace !== "string" || !Array.isArray(pointer.segments)) {
    throw new Error("UCAN capability ability pointer is invalid.");
  }
  return [pointer.namespace, ...pointer.segments].join("/");
}

function normalizeCapability(value) {
  if (!value || typeof value !== "object") throw new Error("UCAN capability must be an object.");
  const resource = value.resource ?? value.rsc ?? value.with;
  const ability = value.ability ?? value.cap ?? value.can;
  return {
    resource: pointerToResource(resource),
    ability: pointerToAbility(ability),
  };
}

function normalizeCapabilities(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("UCAN capabilities must be a non-empty array.");
  }
  return value.map(normalizeCapability);
}

function toUcanCapability(capability) {
  return {
    with: resourcePointer(capability.resource),
    can: abilityPointer(capability.ability),
  };
}

function describeToken(token, proofCid) {
  const parsed = ucans.parse(token);
  const payload = parsed.payload;
  return {
    cid: proofCid,
    issuer: payload.iss,
    audience: payload.aud,
    capabilities: (payload.att || []).map(normalizeCapability),
    expiry: payload.exp ?? null,
    not_before: payload.nbf ?? null,
    nonce: payload.nnc ?? null,
    proof_cids: (payload.prf || []).map((proof) => cidForBytes(Buffer.from(proof, "utf8"))),
  };
}

class ProfileCService {
  constructor(service, keypair, revoked) {
    this.service = service;
    this.keypair = keypair;
    this.did = keypair.did();
    this.issued = new Map();
    this.revoked = new Set(revoked);
    this.revocationPath = servicePath(service, "revocations");
  }

  static async create(service) {
    const keyPath = servicePath(service, "identity");
    const existing = readJson(keyPath, null);
    let keypair;
    if (existing && existing.schema === "swissknife.mcpplusplus.ucan-identity.v1" && typeof existing.secret === "string") {
      keypair = ucans.EdKeypair.fromSecretKey(existing.secret);
    } else {
      keypair = await ucans.EdKeypair.create({ exportable: true });
      writeJsonAtomically(keyPath, {
        schema: "swissknife.mcpplusplus.ucan-identity.v1",
        service,
        did: keypair.did(),
        secret: await keypair.export(),
      });
    }
    const revocations = readJson(servicePath(service, "revocations"), { revoked: [] });
    return new ProfileCService(service, keypair, Array.isArray(revocations.revoked) ? revocations.revoked : []);
  }

  getIdentityDescriptor() {
    return { did: this.did, service: this.service, profile: "C" };
  }

  async identity(params = {}) {
    const audience = validateDid(params.audience, "audience");
    const nonce = String(params.nonce || "");
    if (nonce.length < 16 || nonce.length > 512) {
      throw new Error("identity nonce must contain between 16 and 512 characters.");
    }
    const transport = params.transport === "libp2p" ? "libp2p" : "http";
    const capability = identityCapability(this.service);
    const facts = [{
      mcpplusplus: {
        schema: "mcp++/profile-c-peer-identity@1",
        service: this.service,
        nonce,
        transport,
        peer_id: typeof params.peer_id === "string" ? params.peer_id : null,
        multiaddr: typeof params.multiaddr === "string" ? params.multiaddr : null,
      },
    }];
    const token = await ucans.build({
      issuer: this.keypair,
      audience,
      capabilities: [toUcanCapability(capability)],
      lifetimeInSeconds: IDENTITY_TTL_SECONDS,
      facts,
      addNonce: true,
    });
    const ucan = ucans.encode(token);
    const proofCid = cidForBytes(Buffer.from(ucan, "utf8"));
    return {
      schema: "mcp++/profile-c-peer-identity@1",
      did: this.did,
      service: this.service,
      transport,
      nonce,
      ucan,
      proof_cid: proofCid,
      expires_at: token.payload.exp,
      capability,
      peer_id: facts[0].mcpplusplus.peer_id,
      multiaddr: facts[0].mcpplusplus.multiaddr,
    };
  }

  async delegate(params = {}) {
    const audience = validateDid(params.audience, "audience");
    const capabilities = normalizeCapabilities(params.capabilities ?? params.att);
    const requestedLifetime = Number(params.expiration_seconds ?? params.lifetime_seconds ?? 3600);
    const lifetimeInSeconds = Number.isFinite(requestedLifetime)
      ? Math.max(1, Math.min(Math.floor(requestedLifetime), MAX_DELEGATION_TTL_SECONDS))
      : 3600;
    const token = await ucans.build({
      issuer: this.keypair,
      audience,
      capabilities: capabilities.map(toUcanCapability),
      lifetimeInSeconds,
      facts: Array.isArray(params.facts) ? params.facts : [],
      addNonce: true,
    });
    const ucan = ucans.encode(token);
    const proofCid = cidForBytes(Buffer.from(ucan, "utf8"));
    const delegation = describeToken(ucan, proofCid);
    this.issued.set(proofCid, { ucan, delegation });
    return { proof_cid: proofCid, ucan, delegation };
  }

  async validate(params = {}) {
    const proofCid = typeof params.proof_cid === "string" ? params.proof_cid : "";
    const stored = proofCid ? this.issued.get(proofCid) : null;
    const ucan = typeof params.ucan === "string" ? params.ucan : stored?.ucan;
    if (!ucan) return { valid: false, chain: [], reason: "UCAN proof was not supplied or is not known to this service." };
    const cid = proofCid || cidForBytes(Buffer.from(ucan, "utf8"));
    try {
      const parsed = ucans.parse(ucan);
      const required = params.required_capability ?? (params.resource && params.ability
        ? { resource: params.resource, ability: params.ability }
        : null);
      const audience = params.audience ?? stored?.delegation?.audience ?? this.did;
      validateDid(audience, "audience");
      const verifyOptions = {
        audience,
        requiredCapabilities: required
          ? [{ capability: toUcanCapability(normalizeCapability(required)), rootIssuer: params.root_issuer ?? parsed.payload.iss }]
          : (parsed.payload.att || []).map((capability) => ({
              capability,
              rootIssuer: params.root_issuer ?? parsed.payload.iss,
            })),
        isRevoked: async (candidate) => this.revoked.has(cidForBytes(Buffer.from(ucans.encode(candidate), "utf8"))),
      };
      const verification = await ucans.verify(ucan, verifyOptions);
      if (!verification.ok || this.revoked.has(cid)) {
        return { valid: false, proof_cid: cid, chain: [], reason: this.revoked.has(cid) ? "UCAN proof is revoked." : "UCAN verification failed." };
      }
      return { valid: true, proof_cid: cid, chain: [describeToken(ucan, cid)] };
    } catch (error) {
      return { valid: false, proof_cid: cid, chain: [], reason: error instanceof Error ? error.message : String(error) };
    }
  }

  revoke(params = {}) {
    const proofCid = String(params.proof_cid || "");
    if (!this.issued.has(proofCid)) throw new Error("Only a locally issued UCAN proof can be revoked by this service.");
    this.revoked.add(proofCid);
    writeJsonAtomically(this.revocationPath, {
      schema: "swissknife.mcpplusplus.ucan-revocations.v1",
      revoked: [...this.revoked].sort(),
    });
    return { revoked: true, proof_cid: proofCid, issuer: this.did };
  }
}

async function getProfileCService(service) {
  if (!services.has(service)) {
    const pending = ProfileCService.create(service);
    services.set(service, pending);
    pending.catch(() => services.delete(service));
  }
  return services.get(service);
}

async function verifyPeerIdentity(response, { audience, nonce, service, transport }) {
  try {
    if (!response || typeof response !== "object") throw new Error("Profile C peer identity response is missing.");
    const did = validateDid(response.did, "peer did");
    if (response.service !== service || response.transport !== transport || response.nonce !== nonce) {
      throw new Error("Profile C peer identity response is not bound to this request.");
    }
    const capability = toUcanCapability(identityCapability(service));
    const verification = await ucans.verify(response.ucan, {
      audience: validateDid(audience, "audience"),
      requiredCapabilities: [{ capability, rootIssuer: did }],
      isRevoked: async () => false,
      checkFacts: (facts) => facts.some((fact) => fact?.mcpplusplus?.nonce === nonce
        && fact?.mcpplusplus?.service === service
        && fact?.mcpplusplus?.transport === transport),
    });
    if (!verification.ok) throw new Error("UCAN peer identity verification failed.");
    const proofCid = cidForBytes(Buffer.from(response.ucan, "utf8"));
    if (response.proof_cid !== proofCid) throw new Error("UCAN proof CID does not match the identity token.");
    return { valid: true, did, proofCid, peerId: response.peer_id ?? null, multiaddr: response.multiaddr ?? null };
  } catch (error) {
    return { valid: false, did: null, proofCid: null, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function validateProfileCInvocation(profileC, service, params, tool) {
  const proofCid = typeof params?.proof_cid === "string" ? params.proof_cid : "";
  const ucan = typeof params?.ucan === "string" ? params.ucan : undefined;
  const required = process.env.MCPPLUSPLUS_REQUIRE_UCAN === "1";
  if (!proofCid && !ucan) {
    return required
      ? { valid: false, reason: "This server requires a Profile C UCAN proof for execution." }
      : { valid: true, unauthenticated: true };
  }
  return profileC.validate({
    proof_cid: proofCid,
    ucan,
    audience: params?.ucan_audience,
    required_capability: {
      resource: `mcp++://${service}/tool/${tool}`,
      ability: "mcp++/invoke",
    },
  });
}

module.exports = {
  PROFILE_C_CAPABILITY,
  getProfileCService,
  identityCapability,
  verifyPeerIdentity,
  validateProfileCInvocation,
};
