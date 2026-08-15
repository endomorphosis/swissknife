/**
 * VGO-075 — cross-language deterministic GUI identity vectors.
 *
 * Consumes the byte-identical fixture shared with
 * external/ipfs_datasets/tests/fixtures/gui_optimizer/identity-vectors.json
 * and checks canonical bytes, real CIDv1/SHA-256 identities, baseline
 * equality, mutation isolation, Unicode/key-order, domain separation,
 * rehash, and negative cases.
 */

// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  decodeUiBaseline,
  uiBaselineIdentity,
} from "../../../../src/services/gui-optimizer/baseline.js";
import {
  CID_VERSION,
  DOMAIN_APPLICATION,
  DOMAIN_COMPONENT_VERSION,
  DOMAIN_SCREEN,
  DOMAIN_STABLE_IDENTITY,
  GuiIdentityError,
  IDENTITY_PROFILE_NAME,
  MULTIBASE_NAME,
  MULTICODEC_CODE,
  MULTICODEC_NAME,
  MULTIHASH_CODE,
  MULTIHASH_NAME,
  artifactDigest,
  canonicalBytesToString,
  canonicalIdentity,
  canonicalJsonBytes,
  cidV1,
  compileComponentVersion,
  componentVersionIdentity,
  parseCidV1,
  rehashArtifactDigest,
  rehashIdentity,
  sha256Digest,
  stableIdentityRecord,
  type GuiArtifactDigest,
  type GuiCanonicalIdentity,
} from "../../../../src/services/gui-optimizer/identity.js";
import {
  CANONICAL_JSON_PROFILE,
  GUI_APPLICATION_IDENTITY_SCHEMA,
  GUI_SCREEN_IDENTITY_SCHEMA,
  UI_COMPONENT_IDENTITY_SCHEMA,
  UI_COMPONENT_VERSION_SCHEMA,
  decodeGuiApplicationIdentity,
  decodeGuiScreenIdentity,
} from "../../../../src/services/gui-optimizer/models.js";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/gui-optimizer/identity-vectors.json",
);

const DOMAIN_BASELINE = "gui.ui-baseline";
const DOMAIN_RECEIPT = "gui.improvement-receipt";
const RECEIPT_SCHEMA = "gui-improvement-receipt/v1";
const BASELINE_SCHEMA = "ui-baseline/v1";

interface VectorDocument {
  readonly interface: string;
  readonly schema_version: string;
  readonly identity_profile: string;
  readonly canonicalization: string;
  readonly cid_profile: {
    readonly cid_version: number;
    readonly digest: string;
    readonly multibase: string;
    readonly multicodec: string;
    readonly multicodec_code: number;
    readonly multihash: string;
    readonly multihash_code: number;
  };
  readonly domains: Record<string, string>;
  readonly schemas: Record<string, string>;
  readonly known_cid: { readonly cid: string; readonly preimage: string };
  readonly profile_vectors: IdentityVector[];
  readonly identity_vectors: IdentityVector[];
  readonly baseline_pairs: BaselinePair[];
  readonly mutation_matrix: MutationEntry[];
  readonly negative_cases: NegativeCase[];
  readonly domain_separation: DomainSeparation[];
}

interface IdentityVector {
  readonly id: string;
  readonly kind: string;
  readonly domain: string;
  readonly schema_version: string;
  readonly payload?: unknown;
  readonly shuffled_payload?: unknown;
  readonly payload_bytes?: string;
  readonly canonical_bytes?: string;
  readonly digest?: string;
  readonly cid?: string;
  readonly extractor_version?: string;
  readonly stable_identity?: Record<string, unknown>;
  readonly material?: Record<string, unknown>;
}

interface BaselinePair {
  readonly id: string;
  readonly expect_identical: boolean;
  readonly left: Record<string, unknown>;
  readonly right: Record<string, unknown>;
}

interface MutationEntry {
  readonly id: string;
  readonly description: string;
  readonly expect_changed: string[];
  readonly expect_unchanged: string[];
  readonly changed_facets: string[];
  readonly unchanged_facets: string[];
  readonly mutation: {
    readonly target: string;
    readonly path: string[];
    readonly value: unknown;
  };
}

interface NegativeCase {
  readonly id: string;
  readonly kind: string;
  readonly error_substring?: string;
  readonly input?: { type: string; value?: unknown; units?: number[] };
  readonly domain?: string;
  readonly schema_version?: string;
  readonly payload?: unknown;
  readonly cid?: string;
}

interface DomainSeparation {
  readonly id: string;
  readonly payload: unknown;
  readonly schema_version: string;
  readonly left_domain: string;
  readonly right_domain: string;
}

type IdentityLike = GuiCanonicalIdentity | GuiArtifactDigest;

const DOC = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as VectorDocument;

function setPath(value: unknown, path: string[], replacement: unknown): unknown {
  const clone = structuredClone(value) as Record<string, unknown> | unknown[];
  let cursor: Record<string, unknown> | unknown[] = clone;
  for (const key of path.slice(0, -1)) {
    cursor = (cursor as Record<string, unknown>)[key] as
      | Record<string, unknown>
      | unknown[];
  }
  (cursor as Record<string, unknown>)[path[path.length - 1]] =
    structuredClone(replacement);
  return clone;
}

function identityText(identity: IdentityLike): string {
  return canonicalBytesToString(identity.canonical_bytes);
}

function rehash(identity: IdentityLike): IdentityLike {
  if ("profile" in identity) {
    return rehashIdentity(identity);
  }
  return rehashArtifactDigest(identity);
}

function assertRealIdentity(
  identity: IdentityLike,
  options: {
    domain: string;
    schemaVersion: string;
    expectedBytes?: string;
    expectedDigest?: string;
    expectedCid?: string;
  },
): void {
  if ("profile" in identity) {
    expect(identity.profile).toBe(IDENTITY_PROFILE_NAME);
  }
  expect(identity.domain).toBe(options.domain);
  expect(identity.schema_version).toBe(options.schemaVersion);
  if (options.expectedBytes !== undefined) {
    expect(identityText(identity)).toBe(options.expectedBytes);
  }
  expect(identity.digest).toBe(sha256Digest(identity.canonical_bytes));
  const parsed = parseCidV1(identity.cid);
  expect(parsed.version).toBe(CID_VERSION);
  expect(parsed.multicodec).toBe(MULTICODEC_NAME);
  expect(parsed.multicodec_code).toBe(MULTICODEC_CODE);
  expect(parsed.multihash).toBe(MULTIHASH_NAME);
  expect(parsed.multihash_code).toBe(MULTIHASH_CODE);
  expect(parsed.digest_label).toBe(identity.digest);
  const recomputed = rehash(identity);
  expect(recomputed.cid).toBe(identity.cid);
  expect(recomputed.digest).toBe(identity.digest);
  if (options.expectedDigest !== undefined) {
    expect(identity.digest).toBe(options.expectedDigest);
  }
  if (options.expectedCid !== undefined) {
    expect(identity.cid).toBe(options.expectedCid);
  }
}

function canonicalFor(
  kind: string,
  payload: unknown,
  domain: string,
  schemaVersion: string,
): IdentityLike {
  if (kind === "canonical") {
    return canonicalIdentity(payload, { domain, schemaVersion });
  }
  if (kind === "artifact") {
    return artifactDigest(payload, { domain });
  }
  if (kind === "application") {
    return canonicalIdentity(decodeGuiApplicationIdentity(payload), {
      domain: DOMAIN_APPLICATION,
      schemaVersion: GUI_APPLICATION_IDENTITY_SCHEMA,
    });
  }
  if (kind === "screen") {
    return canonicalIdentity(decodeGuiScreenIdentity(payload), {
      domain: DOMAIN_SCREEN,
      schemaVersion: GUI_SCREEN_IDENTITY_SCHEMA,
    });
  }
  if (kind === "stable") {
    return stableIdentityRecord(payload as Record<string, unknown>);
  }
  if (kind === "component_version") {
    return componentVersionIdentity(payload as Record<string, unknown>);
  }
  if (kind === "baseline") {
    return uiBaselineIdentity(decodeUiBaseline(payload));
  }
  if (kind === "receipt") {
    return canonicalIdentity(payload, {
      domain: DOMAIN_RECEIPT,
      schemaVersion: RECEIPT_SCHEMA,
    });
  }
  throw new Error(`unsupported identity kind ${kind}`);
}

function compileVersion(vector: IdentityVector) {
  return compileComponentVersion(
    vector.stable_identity as Record<string, unknown>,
    vector.material as Record<string, unknown>,
    { extractorVersion: vector.extractor_version as string },
  );
}

function buildSuite() {
  const byId = Object.fromEntries(
    DOC.identity_vectors.map((item) => [item.id, item]),
  );
  const version = byId["version-goal-form"];
  const compiled = compileVersion(version);
  return {
    application: {
      kind: "application",
      payload: structuredClone(byId["application-console"].payload),
      identity: canonicalFor(
        "application",
        byId["application-console"].payload,
        DOMAIN_APPLICATION,
        GUI_APPLICATION_IDENTITY_SCHEMA,
      ),
    },
    screen: {
      kind: "screen",
      payload: structuredClone(byId["screen-console"].payload),
      identity: canonicalFor(
        "screen",
        byId["screen-console"].payload,
        DOMAIN_SCREEN,
        GUI_SCREEN_IDENTITY_SCHEMA,
      ),
    },
    stable: {
      kind: "stable",
      payload: structuredClone(byId["stable-goal-form"].payload),
      identity: canonicalFor(
        "stable",
        byId["stable-goal-form"].payload,
        DOMAIN_STABLE_IDENTITY,
        UI_COMPONENT_IDENTITY_SCHEMA,
      ),
    },
    version: {
      kind: "component_version",
      payload: compiled,
      identity: componentVersionIdentity(compiled),
      facets: {
        accessibility_digest: compiled.accessibility_digest,
        actions_digest: compiled.actions_digest,
        handlers_digest: compiled.handlers_digest,
        localization_digest: compiled.localization_digest,
        props_digest: compiled.props_digest,
        state_digest: compiled.state_digest,
        structure_digest: compiled.structure_digest,
        styles_digest: compiled.styles_digest,
      },
      material: structuredClone(version.material),
      stable_identity: structuredClone(version.stable_identity),
      extractor_version: version.extractor_version as string,
    },
    baseline: {
      kind: "baseline",
      payload: structuredClone(byId["baseline-console"].payload),
      identity: canonicalFor(
        "baseline",
        byId["baseline-console"].payload,
        DOMAIN_BASELINE,
        BASELINE_SCHEMA,
      ),
    },
    receipt: {
      kind: "receipt",
      payload: structuredClone(byId["receipt-accepted"].payload),
      identity: canonicalFor(
        "receipt",
        byId["receipt-accepted"].payload,
        DOMAIN_RECEIPT,
        RECEIPT_SCHEMA,
      ),
    },
  };
}

function negativeInput(caseItem: NegativeCase): unknown {
  const recipe = caseItem.input;
  if (recipe?.type === "number") return recipe.value;
  if (recipe?.type === "surrogate_string") {
    return String.fromCharCode(...(recipe.units ?? []));
  }
  if (recipe?.type === "nfc_collision") {
    return { é: 1, "e\u0301": 2 };
  }
  throw new Error(`unsupported negative input ${JSON.stringify(recipe)}`);
}

describe("GuiIdentityConformanceVectors@1 fixture", () => {
  it("declares the closed shared identity profile", () => {
    expect(DOC.interface).toBe("GuiIdentityConformanceVectors@1");
    expect(DOC.schema_version).toBe("gui-identity-conformance-vectors/v1");
    expect(DOC.identity_profile).toBe(IDENTITY_PROFILE_NAME);
    expect(DOC.canonicalization).toBe(CANONICAL_JSON_PROFILE);
    expect(DOC.cid_profile.cid_version).toBe(CID_VERSION);
    expect(DOC.cid_profile.multicodec).toBe(MULTICODEC_NAME);
    expect(DOC.cid_profile.multicodec_code).toBe(MULTICODEC_CODE);
    expect(DOC.cid_profile.multihash).toBe(MULTIHASH_NAME);
    expect(DOC.cid_profile.multihash_code).toBe(MULTIHASH_CODE);
    expect(DOC.cid_profile.multibase).toBe(MULTIBASE_NAME);
    expect(DOC.domains.application).toBe(DOMAIN_APPLICATION);
    expect(DOC.domains.screen).toBe(DOMAIN_SCREEN);
    expect(DOC.domains.stable).toBe(DOMAIN_STABLE_IDENTITY);
    expect(DOC.domains.component_version).toBe(DOMAIN_COMPONENT_VERSION);
    expect(DOC.domains.receipt).toBe(DOMAIN_RECEIPT);
    expect(DOC.domains.baseline).toBe(DOMAIN_BASELINE);
  });

  it("locks the known raw sha2-256 hello CID", () => {
    const encoded = new TextEncoder().encode(DOC.known_cid.preimage);
    expect(cidV1(encoded)).toBe(DOC.known_cid.cid);
    expect(parseCidV1(DOC.known_cid.cid).digest_label).toBe(sha256Digest(encoded));
  });
});

describe("profile vectors", () => {
  it.each(DOC.profile_vectors)(
    "locks $id canonical bytes, digest, and CID",
    (vector) => {
      const identity = canonicalFor(
        vector.kind,
        vector.payload,
        vector.domain,
        vector.schema_version,
      );
      if (vector.payload_bytes !== undefined) {
        expect(canonicalBytesToString(canonicalJsonBytes(vector.payload))).toBe(
          vector.payload_bytes,
        );
      }
      assertRealIdentity(identity, {
        domain: vector.domain,
        schemaVersion: vector.schema_version,
        expectedBytes: vector.canonical_bytes,
        expectedDigest: vector.digest,
        expectedCid: vector.cid,
      });
      if (vector.shuffled_payload !== undefined) {
        const again = canonicalFor(
          vector.kind,
          vector.shuffled_payload,
          vector.domain,
          vector.schema_version,
        );
        expect(again.cid).toBe(identity.cid);
        expect(again.digest).toBe(identity.digest);
        expect(identityText(again)).toBe(identityText(identity));
      }
    },
  );
});

describe("identity vectors", () => {
  it.each(DOC.identity_vectors.filter((item) => item.kind !== "component_version"))(
    "matches expected canonical bytes for $id",
    (vector) => {
      const identity = canonicalFor(
        vector.kind,
        vector.payload,
        vector.domain,
        vector.schema_version,
      );
      assertRealIdentity(identity, {
        domain: vector.domain,
        schemaVersion: vector.schema_version,
        expectedBytes: vector.canonical_bytes,
        expectedDigest: vector.digest,
        expectedCid: vector.cid,
      });
    },
  );

  it("compiles the component-version recipe to a real identity", () => {
    const vector = DOC.identity_vectors.find(
      (item) => item.kind === "component_version",
    );
    if (vector === undefined) {
      throw new Error("missing component_version vector");
    }
    const compiled = compileVersion(vector);
    const identity = componentVersionIdentity(compiled);
    assertRealIdentity(identity, {
      domain: DOMAIN_COMPONENT_VERSION,
      schemaVersion: UI_COMPONENT_VERSION_SCHEMA,
    });
    const again = componentVersionIdentity(compileVersion(vector));
    expect(again.cid).toBe(identity.cid);
    expect(compiled.stable_identity).toEqual(vector.stable_identity);
  });
});

describe("baseline pairs", () => {
  it.each(DOC.baseline_pairs)("$id", (pair) => {
    const left = canonicalFor(
      "baseline",
      pair.left,
      DOMAIN_BASELINE,
      BASELINE_SCHEMA,
    );
    const right = canonicalFor(
      "baseline",
      pair.right,
      DOMAIN_BASELINE,
      BASELINE_SCHEMA,
    );
    assertRealIdentity(left, {
      domain: DOMAIN_BASELINE,
      schemaVersion: BASELINE_SCHEMA,
    });
    assertRealIdentity(right, {
      domain: DOMAIN_BASELINE,
      schemaVersion: BASELINE_SCHEMA,
    });
    if (pair.expect_identical) {
      expect(left.cid).toBe(right.cid);
      expect(left.digest).toBe(right.digest);
      expect(identityText(left)).toBe(identityText(right));
    } else {
      expect(left.cid).not.toBe(right.cid);
      expect(left.digest).not.toBe(right.digest);
      expect(identityText(left)).not.toBe(identityText(right));
    }
  });
});

describe("mutation matrix", () => {
  it.each(DOC.mutation_matrix)("$id", (entry) => {
    const suite = buildSuite();
    const { mutation } = entry;
    const slot = mutation.target === "material" ? "version" : mutation.target;
    const source =
      mutation.target === "material"
        ? suite.version.material
        : suite[slot as keyof typeof suite].payload;
    const mutated = setPath(source, mutation.path, mutation.value);
    let newIdentity: IdentityLike;
    let compiled = suite.version.payload;
    if (slot === "version") {
      compiled = compileComponentVersion(
        suite.version.stable_identity as Record<string, unknown>,
        mutated as Record<string, unknown>,
        { extractorVersion: suite.version.extractor_version },
      );
      newIdentity = componentVersionIdentity(compiled);
    } else {
      const record = suite[slot as keyof typeof suite];
      newIdentity = canonicalFor(
        record.kind,
        mutated,
        record.identity.domain,
        record.identity.schema_version,
      );
    }
    const before = suite[slot as keyof typeof suite].identity;
    const changed = newIdentity.cid !== before.cid;
    if (entry.expect_changed.includes(slot)) {
      expect(changed).toBe(true);
    } else {
      expect(changed).toBe(false);
      expect(newIdentity.digest).toBe(before.digest);
    }
    for (const other of entry.expect_unchanged) {
      if (other === slot) {
        expect(newIdentity.cid).toBe(before.cid);
        continue;
      }
      expect(suite[other as keyof typeof suite].identity.cid).toBe(
        suite[other as keyof typeof suite].identity.cid,
      );
    }
    if (mutation.target === "material") {
      for (const facet of entry.changed_facets) {
        expect(
          compiled[facet as keyof typeof compiled],
        ).not.toBe(suite.version.facets[facet as keyof typeof suite.version.facets]);
      }
      for (const facet of entry.unchanged_facets) {
        expect(compiled[facet as keyof typeof compiled]).toBe(
          suite.version.facets[facet as keyof typeof suite.version.facets],
        );
      }
      expect(compiled.stable_identity).toEqual(suite.stable.payload);
    }
  });
});

describe("negative cases", () => {
  it.each(DOC.negative_cases)("$id fails closed", (caseItem) => {
    const substring = caseItem.error_substring || undefined;
    if (caseItem.kind === "canonical_json") {
      expect(() => canonicalJsonBytes(negativeInput(caseItem))).toThrow(
        substring === undefined ? GuiIdentityError : substring,
      );
      return;
    }
    if (caseItem.kind === "canonical_identity") {
      expect(() =>
        canonicalIdentity(caseItem.payload, {
          domain: caseItem.domain as string,
          schemaVersion: caseItem.schema_version as string,
        }),
      ).toThrow(substring === undefined ? GuiIdentityError : substring);
      return;
    }
    if (caseItem.kind === "parse_cid") {
      expect(() => parseCidV1(caseItem.cid as string)).toThrow(GuiIdentityError);
      return;
    }
    throw new Error(`unsupported negative case ${caseItem.kind}`);
  });
});

describe("domain separation", () => {
  it.each(DOC.domain_separation)("$id", (entry) => {
    const left = canonicalIdentity(entry.payload, {
      domain: entry.left_domain,
      schemaVersion: entry.schema_version,
    });
    const right = canonicalIdentity(entry.payload, {
      domain: entry.right_domain,
      schemaVersion: entry.schema_version,
    });
    expect(left.cid).not.toBe(right.cid);
    expect(left.digest).not.toBe(right.digest);
    expect(identityText(left)).not.toBe(identityText(right));
    assertRealIdentity(left, {
      domain: entry.left_domain,
      schemaVersion: entry.schema_version,
    });
    assertRealIdentity(right, {
      domain: entry.right_domain,
      schemaVersion: entry.schema_version,
    });
  });
});
