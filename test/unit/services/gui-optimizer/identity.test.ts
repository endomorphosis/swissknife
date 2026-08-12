/**
 * VGO-010 — canonical GUI content identity and provenance tests.
 *
 * Mirrors external/ipfs_datasets/tests/unit/logic/gui_optimizer/test_identity.py
 * so Python and TypeScript share golden vectors, domain separation, rehash
 * checks, stable-vs-version identity behavior, and version-compiler cases.
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/services/shared/shared-browser-crypto.js';
import {
  CANONICAL_JSON_PROFILE,
  UI_COMPONENT_IDENTITY_SCHEMA,
  UI_COMPONENT_VERSION_SCHEMA,
} from '../../../../src/services/gui-optimizer/models.js';
import {
  DOMAIN_ARTIFACT,
  DOMAIN_COMPONENT_VERSION,
  DOMAIN_STABLE_IDENTITY,
  GUI_ARTIFACT_DIGEST_INTERFACE,
  GUI_CANONICAL_IDENTITY_INTERFACE,
  IDENTITY_PROFILE,
  IDENTITY_PROFILE_NAME,
  MAX_SAFE_INTEGER,
  MULTICODEC_CODE,
  MULTIHASH_CODE,
  TYPESCRIPT_GUI_CANONICAL_IDENTITY_INTERFACE,
  UI_COMPONENT_VERSION_COMPILER_INTERFACE,
  artifactDigest,
  buildStableIdentity,
  canonicalBytesToString,
  canonicalIdentity,
  canonicalJsonBytes,
  cidV1,
  compileComponentVersion,
  componentVersionIdentity,
  createComponentVersionCompiler,
  facetDigest,
  identityPreimage,
  normalizeMaterial,
  parseCidV1,
  rehashIdentity,
  sha256Digest,
  stableIdentityRecord,
  verifyIdentity,
  GuiIdentityError,
} from '../../../../src/services/gui-optimizer/identity.js';

const GOLDEN_PAYLOAD = {
  component: 'ConsoleRoot',
  kind: 'screen',
  tags: ['primary', 'workspace'],
  title: 'Cafe\u0301',
};

const GOLDEN_DOMAIN = 'gui.test-vector';
const GOLDEN_SCHEMA = 'gui-test-vector/v1';

const GOLDEN_PAYLOAD_BYTES =
  '{"component":"ConsoleRoot","kind":"screen","tags":["primary","workspace"],"title":"Café"}';

// Literal cross-runtime contract. Keep byte-for-byte identical to the vector
// in ipfs_datasets_py/tests/unit/logic/gui_optimizer/test_identity.py.
const CROSS_RUNTIME_DOMAIN = 'gui.cross-runtime-vector';
const CROSS_RUNTIME_SCHEMA = 'gui-cross-runtime-vector/v1';
const CROSS_RUNTIME_PAYLOAD = {
  astral_and_bmp: { '\uE000': 'bmp', '\u{10000}': 'astral' },
  boolean_false: false,
  boolean_true: true,
  float_one: 1.0,
  negative_zero: -0.0,
  safe_integer: 9_007_199_254_740_991,
  small_exponent: 1e-7,
  smallest_subnormal: 5e-324,
};
const CROSS_RUNTIME_PAYLOAD_JSON =
  '{"astral_and_bmp":{"\uE000":"bmp","\u{10000}":"astral"},"boolean_false":false' +
  ',"boolean_true":true,"float_one":1,"negative_zero":0,"safe_integ' +
  'er":9007199254740991,"small_exponent":0.0000001,"smallest_subnor' +
  'mal":0.000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '00000000005}';
const CROSS_RUNTIME_PREIMAGE_JSON =
  '{"canonicalization":"gui-optimizer-canonical-json/v1",' +
  '"domain":"gui.cross-runtime-vector",' +
  '"identity_profile":"gui-optimizer-canonical-identity/v1","payload":' +
  CROSS_RUNTIME_PAYLOAD_JSON +
  ',"schema_version":"gui-cross-runtime-vector/v1"}';
const CROSS_RUNTIME_DIGEST =
  'sha256:ca283ecb68a9e75a2b143628f2c98888b749fe0f7fbfc269341d9549c180b93c';
const CROSS_RUNTIME_CID =
  'bafkreigkfa7mw2fj45ncwfbwfdzmtceiw5e74d37x7bgsna5sve4dafzhq';

const EXTRACTOR = 'gui-static-scanner-1.0.0';

function baseMaterial(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    structure: {
      tag: 'form',
      children: ['input', 'button'],
      start_line: 10,
      path: '/home/user/checkout/web/js/apps/agent-supervisor.js',
    },
    props: { name: 'goal', required: true, comments: 'ignore me' },
    state: { ready: true },
    handlers: { onSubmit: 'dispatchGoal' },
    accessibility: { role: 'form', label: 'Goal form' },
    styles: { tokens: ['color.primary'], start_column: 4 },
    actions: { dispatch: 'agentSupervisor.dispatch' },
    localization: { keys: ['agentSupervisor.goal.label'] },
    ...overrides,
  };
}

describe('TypeScriptGuiCanonicalIdentity@1 profile', () => {
  it('exports fixed profile constants matching Python', () => {
    expect(IDENTITY_PROFILE_NAME).toBe('gui-optimizer-canonical-identity/v1');
    expect(CANONICAL_JSON_PROFILE).toBe('gui-optimizer-canonical-json/v1');
    expect(IDENTITY_PROFILE.multicodec).toBe('raw');
    expect(IDENTITY_PROFILE.multihash).toBe('sha2-256');
    expect(MULTICODEC_CODE).toBe(0x55);
    expect(MULTIHASH_CODE).toBe(0x12);
    expect(TYPESCRIPT_GUI_CANONICAL_IDENTITY_INTERFACE).toBe(
      'TypeScriptGuiCanonicalIdentity@1',
    );
    expect(IDENTITY_PROFILE.canonicalization).toBe(CANONICAL_JSON_PROFILE);
  });

  it('canonical JSON normalizes NFC and sorts keys', () => {
    const encoded = canonicalBytesToString(
      canonicalJsonBytes({ b: 1, a: 2, title: 'Cafe\u0301' }),
    );
    expect(encoded).toBe('{"a":2,"b":1,"title":"Café"}');
  });

  it('canonical JSON rejects non-finite numbers and key collisions', () => {
    expect(() => canonicalJsonBytes(Number.NaN)).toThrow(GuiIdentityError);
    expect(() => canonicalJsonBytes({ é: 1, 'e\u0301': 2 })).toThrow(/collide/);
  });

  it('locks a literal cross-runtime JSON, digest, and CID vector', () => {
    expect(
      canonicalBytesToString(canonicalJsonBytes(CROSS_RUNTIME_PAYLOAD)),
    ).toBe(CROSS_RUNTIME_PAYLOAD_JSON);
    const identity = canonicalIdentity(CROSS_RUNTIME_PAYLOAD, {
      domain: CROSS_RUNTIME_DOMAIN,
      schemaVersion: CROSS_RUNTIME_SCHEMA,
    });
    expect(canonicalBytesToString(identity.canonical_bytes)).toBe(
      CROSS_RUNTIME_PREIMAGE_JSON,
    );
    expect(identity.digest).toBe(CROSS_RUNTIME_DIGEST);
    expect(identity.cid).toBe(CROSS_RUNTIME_CID);
    expect(
      canonicalBytesToString(
        canonicalJsonBytes([false, 0, true, 1, 1.0, -0.0]),
      ),
    ).toBe('[false,0,true,1,1,0]');
  });

  it('rejects integers outside the GUI cross-runtime numeric domain', () => {
    expect(MAX_SAFE_INTEGER).toBe(9_007_199_254_740_991);
    for (const value of [
      MAX_SAFE_INTEGER + 1,
      -(MAX_SAFE_INTEGER + 1),
      1e20,
      Number.MAX_VALUE,
    ]) {
      expect(() => canonicalJsonBytes(value)).toThrow(/safe-integer/);
      expect(() => normalizeMaterial({ nested: [value] })).toThrow(
        /safe-integer/,
      );
    }
  });

  it('rejects unpaired surrogates and recursive NFC collisions', () => {
    for (const value of [
      '\ud800',
      { '\udc00': 'value' },
      { nested: ['\udfff'] },
    ]) {
      expect(() => canonicalJsonBytes(value)).toThrow(
        /unpaired Unicode surrogate/,
      );
      expect(() => normalizeMaterial(value)).toThrow(
        /unpaired Unicode surrogate/,
      );
    }

    const collision = { outer: { é: 1, 'e\u0301': 2 } };
    expect(() => canonicalJsonBytes(collision)).toThrow(/collide/);
    expect(() => normalizeMaterial(collision)).toThrow(/collide/);
    expect(() =>
      canonicalIdentity(
        {},
        {
          domain: 'gui.\ud800',
          schemaVersion: CROSS_RUNTIME_SCHEMA,
        },
      ),
    ).toThrow(/unpaired Unicode surrogate/);
  });

  it('fails closed on JavaScript containers with no JSON counterpart', () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => canonicalJsonBytes(sparse)).toThrow(/sparse array/);
    expect(() => normalizeMaterial(sparse)).toThrow(/sparse array/);

    const hidden = {};
    Object.defineProperty(hidden, 'invisible', {
      enumerable: false,
      value: 1,
    });
    expect(() => canonicalJsonBytes(hidden)).toThrow(/non-enumerable/);
    expect(() => normalizeMaterial(hidden)).toThrow(/non-enumerable/);
  });

  it('cidV1 matches the raw sha2-256 base32 vector for hello', () => {
    expect(cidV1(new TextEncoder().encode('hello'))).toBe(
      'bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq',
    );
    const parsed = parseCidV1(cidV1(new TextEncoder().encode('hello')));
    expect(parsed.version).toBe(1);
    expect(parsed.multicodec).toBe('raw');
    expect(parsed.multihash).toBe('sha2-256');
    expect(parsed.digest).toHaveLength(64);
  });

  it('parseCidV1 rejects malformed CIDs', () => {
    expect(() => parseCidV1('not-a-cid')).toThrow(GuiIdentityError);
    expect(() =>
      parseCidV1('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'),
    ).toThrow(GuiIdentityError);
  });
});

describe('golden identity vectors', () => {
  it('locks golden payload bytes, digest, and CID', () => {
    expect(canonicalBytesToString(canonicalJsonBytes(GOLDEN_PAYLOAD))).toBe(
      GOLDEN_PAYLOAD_BYTES,
    );
    const identity = canonicalIdentity(GOLDEN_PAYLOAD, {
      domain: GOLDEN_DOMAIN,
      schemaVersion: GOLDEN_SCHEMA,
    });
    const preimage = identityPreimage(GOLDEN_PAYLOAD, {
      domain: GOLDEN_DOMAIN,
      schemaVersion: GOLDEN_SCHEMA,
    });
    const expectedDigest = `sha256:${sha256Hex(preimage)}`;
    const expectedCid = cidV1(preimage);
    expect(canonicalBytesToString(identity.canonical_bytes)).toBe(
      canonicalBytesToString(preimage),
    );
    expect(identity.digest).toBe(expectedDigest);
    expect(identity.cid).toBe(expectedCid);
    expect(identity.profile).toBe(IDENTITY_PROFILE_NAME);
    expect(identity.domain).toBe(GOLDEN_DOMAIN);
    expect(identity.interface).toBe(GUI_CANONICAL_IDENTITY_INTERFACE);

    // Key order independence + precomposed NFC.
    const shuffled = {
      title: 'Café',
      tags: ['primary', 'workspace'],
      kind: 'screen',
      component: 'ConsoleRoot',
    };
    const again = canonicalIdentity(shuffled, {
      domain: GOLDEN_DOMAIN,
      schemaVersion: GOLDEN_SCHEMA,
    });
    expect(again.cid).toBe(identity.cid);
    expect(again.digest).toBe(identity.digest);
  });

  it('domain-separates identical payloads', () => {
    const left = canonicalIdentity(GOLDEN_PAYLOAD, {
      domain: 'gui.domain-a',
      schemaVersion: GOLDEN_SCHEMA,
    });
    const right = canonicalIdentity(GOLDEN_PAYLOAD, {
      domain: 'gui.domain-b',
      schemaVersion: GOLDEN_SCHEMA,
    });
    expect(left.cid).not.toBe(right.cid);
    expect(left.digest).not.toBe(right.digest);
  });

  it('schema-version-separates identical payloads', () => {
    const left = canonicalIdentity(GOLDEN_PAYLOAD, {
      domain: GOLDEN_DOMAIN,
      schemaVersion: 'v1',
    });
    const right = canonicalIdentity(GOLDEN_PAYLOAD, {
      domain: GOLDEN_DOMAIN,
      schemaVersion: 'v2',
    });
    expect(left.cid).not.toBe(right.cid);
  });

  it('rehashes from retained canonical bytes and verifies', () => {
    const identity = canonicalIdentity(GOLDEN_PAYLOAD, {
      domain: GOLDEN_DOMAIN,
      schemaVersion: GOLDEN_SCHEMA,
    });
    expect(rehashIdentity(identity).cid).toBe(identity.cid);
    expect(verifyIdentity(identity, GOLDEN_PAYLOAD).cid).toBe(identity.cid);
  });

  it('verifyIdentity rejects tampered payloads', () => {
    const identity = canonicalIdentity(GOLDEN_PAYLOAD, {
      domain: GOLDEN_DOMAIN,
      schemaVersion: GOLDEN_SCHEMA,
    });
    expect(() =>
      verifyIdentity(identity, { ...GOLDEN_PAYLOAD, kind: 'dialog' }),
    ).toThrow(GuiIdentityError);
  });
});

describe('stable logical identity', () => {
  it('ignores line numbers and preserves logical equality', () => {
    const identity = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.ConsoleRoot',
      componentKind: 'screen',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    expect(identity).not.toHaveProperty('start_line');
    expect(identity.qualified_name).toBe('apps.agent-supervisor.ConsoleRoot');
    expect(identity.schema_version).toBe(UI_COMPONENT_IDENTITY_SCHEMA);

    const moved = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.ConsoleRoot',
      componentKind: 'screen',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    expect(stableIdentityRecord(identity).cid).toBe(
      stableIdentityRecord(moved).cid,
    );
    expect(stableIdentityRecord(identity).domain).toBe(DOMAIN_STABLE_IDENTITY);
  });

  it('changes when the qualified name changes', () => {
    const a = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.ConsoleRoot',
      componentKind: 'screen',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    const b = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.GoalForm',
      componentKind: 'form',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    expect(stableIdentityRecord(a).cid).not.toBe(stableIdentityRecord(b).cid);
  });
});

describe('material normalization and version compiler', () => {
  it('drops provenance keys and absolute paths', () => {
    const normalized = normalizeMaterial({
      tag: 'button',
      start_line: 42,
      end_line: 44,
      path: '/abs/checkout/file.tsx',
      label: '  Save   now  ',
      comments: '// ignore',
    }) as Record<string, unknown>;
    expect(normalized).not.toHaveProperty('start_line');
    expect(normalized).not.toHaveProperty('end_line');
    expect(normalized).not.toHaveProperty('path');
    expect(normalized).not.toHaveProperty('comments');
    expect(normalized.label).toBe('Save now');
    expect(normalized.tag).toBe('button');
  });

  it('preserves version identity across line movement and path noise', () => {
    const identity = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.GoalForm',
      componentKind: 'form',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    const materialA = baseMaterial();
    const materialB = baseMaterial({
      structure: {
        tag: 'form',
        children: ['input', 'button'],
        start_line: 999,
        path: '/other/checkout/web/js/apps/agent-supervisor.js',
        comments: 'moved down the file',
      },
      styles: {
        tokens: ['color.primary'],
        start_column: 80,
        absolute_path: '/tmp/styles.css',
      },
    });
    const versionA = compileComponentVersion(identity, materialA, {
      extractorVersion: EXTRACTOR,
    });
    const versionB = compileComponentVersion(identity, materialB, {
      extractorVersion: EXTRACTOR,
    });
    expect(versionA.structure_digest).toBe(versionB.structure_digest);
    expect(versionA.styles_digest).toBe(versionB.styles_digest);
    expect(componentVersionIdentity(versionA).cid).toBe(
      componentVersionIdentity(versionB).cid,
    );
  });

  it('alters version identity on meaningful material changes', () => {
    const identity = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.GoalForm',
      componentKind: 'form',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    const versionBase = compileComponentVersion(identity, baseMaterial(), {
      extractorVersion: EXTRACTOR,
    });
    const versionChanged = compileComponentVersion(
      identity,
      baseMaterial({
        handlers: { onSubmit: 'dispatchGoal', onCancel: 'cancelGoal' },
      }),
      { extractorVersion: EXTRACTOR },
    );
    expect(versionBase.handlers_digest).not.toBe(
      versionChanged.handlers_digest,
    );
    expect(versionBase.structure_digest).toBe(versionChanged.structure_digest);
    expect(componentVersionIdentity(versionBase).cid).not.toBe(
      componentVersionIdentity(versionChanged).cid,
    );
    expect(versionBase.stable_identity.qualified_name).toBe(
      versionChanged.stable_identity.qualified_name,
    );
  });

  it('exposes UiComponentVersionCompiler@1 facade', () => {
    const compiler = createComponentVersionCompiler({
      extractorVersion: EXTRACTOR,
    });
    expect(compiler.interface).toBe(UI_COMPONENT_VERSION_COMPILER_INTERFACE);
    const identity = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.GoalForm',
      componentKind: 'form',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    const version = compiler.compile(identity, baseMaterial());
    expect(version.schema_version).toBe(UI_COMPONENT_VERSION_SCHEMA);
    for (const digest of [
      version.structure_digest,
      version.props_digest,
      version.state_digest,
      version.handlers_digest,
      version.accessibility_digest,
      version.styles_digest,
      version.actions_digest,
      version.localization_digest,
    ]) {
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    const record = compiler.identityFor(identity, baseMaterial());
    expect(record.domain).toBe(DOMAIN_COMPONENT_VERSION);
    expect(rehashIdentity(record).cid).toBe(record.cid);
  });

  it('artifact digests rehash and drop provenance', () => {
    const art = artifactDigest({ tokens: ['a', 'b'], start_line: 1 });
    expect(art.interface).toBe(GUI_ARTIFACT_DIGEST_INTERFACE);
    expect(art.domain).toBe(DOMAIN_ARTIFACT);
    expect(art.digest).toBe(facetDigest({ tokens: ['a', 'b'] }));
    expect(sha256Digest(art.canonical_bytes)).toBe(art.digest);
    expect(parseCidV1(art.cid).digest_label).toBe(art.digest);
  });

  it('empty and provenance-only facets share a digest', () => {
    expect(facetDigest({})).toBe(facetDigest({ start_line: 3, comments: 'x' }));
    expect(facetDigest({ a: 1 })).not.toBe(facetDigest({ a: 2 }));
  });
});
