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
  rehashArtifactDigest,
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

const ARTIFACT_VECTOR_DOMAIN = 'gui.artifact-vector';
const ARTIFACT_VECTOR_MATERIAL = {
  facet: null,
  label: '\u0085value\u0085',
  route_path: '/docs/start',
};
const ARTIFACT_VECTOR_PREIMAGE =
  '{"canonicalization":"gui-optimizer-canonical-json/v1",' +
  '"domain":"gui.artifact-vector",' +
  '"identity_profile":"gui-optimizer-canonical-identity/v1",' +
  '"payload":{"facet":null,"label":"value",' +
  '"route_path":"/docs/start"},' +
  '"schema_version":"gui-artifact-digest/v1"}';
const ARTIFACT_VECTOR_DIGEST =
  'sha256:491a93ed0b5c2ee1a60a450cf6a65c331cbdf818541e3d3f5c90f0bd15aa80b6';
const ARTIFACT_VECTOR_CID =
  'bafkreicjdkj62c24f3q2mcsfbt3kmxbtds67qgcudy6t6xeq6c6rlkuawy';

const TRIM_VECTOR_DOMAIN = '\u001cgui.trim\uFEFF';
const TRIM_VECTOR_PREIMAGE =
  '{"canonicalization":"gui-optimizer-canonical-json/v1",' +
  '"domain":"\\u001cgui.trim\uFEFF",' +
  '"identity_profile":"gui-optimizer-canonical-identity/v1",' +
  '"payload":{},"schema_version":"trim-vector/v1"}';
const TRIM_VECTOR_DIGEST =
  'sha256:d7bddc07adbab269eb9cb770b95b6552bb01d348fb8ab3efe088478a1a013e10';
const TRIM_VECTOR_CID =
  'bafkreigxxxoapln2wju6xhfxoc4vwzksxma5gsh3rkz67yeii6fbuaj6ca';

const EXTRACTOR = 'gui-static-scanner-1.0.0';

function baseMaterial(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    structure: {
      tag: 'form',
      children: ['input', 'button'],
      start_line: 10,
      source_path: '/home/user/checkout/web/js/apps/agent-supervisor.js',
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

  it('locks the explicit cross-runtime trim policy vector', () => {
    expect(normalizeMaterial('\u0085value\u0085')).toBe('value');
    expect(normalizeMaterial('\u001cvalue\uFEFF')).toBe('\u001cvalue\uFEFF');
    expect(() =>
      canonicalIdentity(
        {},
        { domain: '\u0085gui.trim', schemaVersion: 'trim-vector/v1' },
      ),
    ).toThrow(/surrounding whitespace/);
    const identity = canonicalIdentity(
      {},
      { domain: TRIM_VECTOR_DOMAIN, schemaVersion: 'trim-vector/v1' },
    );
    expect(canonicalBytesToString(identity.canonical_bytes)).toBe(
      TRIM_VECTOR_PREIMAGE,
    );
    expect(identity.digest).toBe(TRIM_VECTOR_DIGEST);
    expect(identity.cid).toBe(TRIM_VECTOR_CID);
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

  it('rejects forged claimed identity metadata', () => {
    const identity = canonicalIdentity(GOLDEN_PAYLOAD, {
      domain: GOLDEN_DOMAIN,
      schemaVersion: GOLDEN_SCHEMA,
    });
    for (const change of [
      { profile: 'forged-profile/v1' },
      { interface: 'ForgedIdentity@1' },
      { wire_schema_version: 'forged-identity/v1' },
      { domain: 'gui.forged-domain' },
      { schema_version: 'forged-schema/v1' },
    ]) {
      const forged = { ...identity, ...change } as typeof identity;
      expect(() => verifyIdentity(forged, GOLDEN_PAYLOAD)).toThrow(
        GuiIdentityError,
      );
    }
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

  it('validates interface-tagged identities and screen identifiers', () => {
    const identity = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.ConsoleRoot',
      componentKind: 'screen',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    for (const malformed of [
      { ...identity, application_id: 'contains whitespace' },
      { ...identity, component_kind: 'not-a-kind' },
      { ...identity, schema_version: 'forged-schema/v1' },
      { ...identity, unexpected: true },
      { ...identity, screen_id: null },
      { ...identity, screen_id: 'contains whitespace' },
      { ...identity, screen_id: `s${'x'.repeat(256)}` },
    ]) {
      expect(() => stableIdentityRecord(malformed as never)).toThrow();
    }
    for (const screenId of [
      null,
      'contains whitespace',
      `s${'x'.repeat(256)}`,
    ]) {
      expect(() =>
        buildStableIdentity({
          applicationId: 'app:agent-supervisor',
          qualifiedName: 'apps.agent-supervisor.ConsoleRoot',
          componentKind: 'screen',
          packageNamespace: 'swissknife.web.js.apps',
          screenId: screenId as never,
        }),
      ).toThrow();
    }
  });
});

describe('material normalization and version compiler', () => {
  it('drops explicit source provenance but preserves semantic path fields', () => {
    const normalized = normalizeMaterial({
      tag: 'button',
      start_line: 42,
      end_line: 44,
      source_path: '/abs/checkout/file.tsx',
      path: '/settings/profile',
      href: '/help',
      label: '  Save   now  ',
      source_span: { start_line: 42 },
    }) as Record<string, unknown>;
    expect(normalized).not.toHaveProperty('start_line');
    expect(normalized).not.toHaveProperty('end_line');
    expect(normalized).not.toHaveProperty('source_path');
    expect(normalized).not.toHaveProperty('source_span');
    expect(normalized.path).toBe('/settings/profile');
    expect(normalized.href).toBe('/help');
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
        source_path: '/other/checkout/web/js/apps/agent-supervisor.js',
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

  it('keeps generic path-like and provenance-named fields identity-bearing', () => {
    for (const field of [
      'path',
      'href',
      'line',
      'column',
      'span',
      'offset',
      'comments',
    ]) {
      expect(facetDigest({ [field]: 'semantic-a' })).not.toBe(
        facetDigest({ [field]: 'semantic-b' }),
      );
    }
  });

  it('distinguishes an explicitly null facet from an absent facet', () => {
    const identity = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.GoalForm',
      componentKind: 'form',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    const explicitNull = compileComponentVersion(
      identity,
      { props: null },
      { extractorVersion: EXTRACTOR },
    );
    const absent = compileComponentVersion(
      identity,
      {},
      {
        extractorVersion: EXTRACTOR,
      },
    );
    expect(explicitNull.props_digest).toBe(facetDigest(null));
    expect(absent.props_digest).toBe(facetDigest({}));
    expect(explicitNull.props_digest).not.toBe(absent.props_digest);
  });

  it('rejects non-object material and invalid compiler versions early', () => {
    const identity = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.GoalForm',
      componentKind: 'form',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    for (const material of [[], 'x', 3, new Date(), null]) {
      expect(() =>
        compileComponentVersion(identity, material as never, {
          extractorVersion: EXTRACTOR,
        }),
      ).toThrow(/material/);
    }
    for (const extractorVersion of ['', null]) {
      expect(() =>
        createComponentVersionCompiler({ extractorVersion } as never),
      ).toThrow(/extractorVersion/);
      expect(() =>
        compileComponentVersion(identity, {}, { extractorVersion } as never),
      ).toThrow(/extractorVersion/);
    }
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

  it('closed-decodes interface-tagged component versions', () => {
    const identity = buildStableIdentity({
      applicationId: 'app:agent-supervisor',
      qualifiedName: 'apps.agent-supervisor.GoalForm',
      componentKind: 'form',
      packageNamespace: 'swissknife.web.js.apps',
      screenId: 'screen:agent-supervisor',
    });
    const version = compileComponentVersion(identity, baseMaterial(), {
      extractorVersion: EXTRACTOR,
    });
    for (const malformed of [
      { ...version, structure_digest: 'not-a-digest' },
      { ...version, schema_version: 'forged-schema/v1' },
      { ...version, extractor_version: '' },
      {
        ...version,
        stable_identity: {
          ...version.stable_identity,
          component_kind: 'not-a-kind',
        },
      },
      {
        ...version,
        stable_identity: {
          ...version.stable_identity,
          screen_id: 'contains whitespace',
        },
      },
    ]) {
      expect(() => componentVersionIdentity(malformed as never)).toThrow();
    }
  });

  it('artifact digests rehash and drop provenance', () => {
    const art = artifactDigest({ tokens: ['a', 'b'], start_line: 1 });
    expect(art.interface).toBe(GUI_ARTIFACT_DIGEST_INTERFACE);
    expect(art.domain).toBe(DOMAIN_ARTIFACT);
    expect(art.digest).toBe(facetDigest({ tokens: ['a', 'b'] }));
    expect(sha256Digest(art.canonical_bytes)).toBe(art.digest);
    expect(parseCidV1(art.cid).digest_label).toBe(art.digest);
    expect(rehashArtifactDigest(art)).toEqual(art);
  });

  it('locks a cross-runtime domain-separated null artifact vector', () => {
    const artifact = artifactDigest(ARTIFACT_VECTOR_MATERIAL, {
      domain: ARTIFACT_VECTOR_DOMAIN,
    });
    expect(canonicalBytesToString(artifact.canonical_bytes)).toBe(
      ARTIFACT_VECTOR_PREIMAGE,
    );
    expect(artifact.digest).toBe(ARTIFACT_VECTOR_DIGEST);
    expect(artifact.cid).toBe(ARTIFACT_VECTOR_CID);
    expect(rehashArtifactDigest(artifact)).toEqual(artifact);

    const domainA = artifactDigest(ARTIFACT_VECTOR_MATERIAL, {
      domain: 'gui.domain-a',
    });
    const domainB = artifactDigest(ARTIFACT_VECTOR_MATERIAL, {
      domain: 'gui.domain-b',
    });
    expect(domainA.digest).not.toBe(domainB.digest);
    expect(domainA.cid).not.toBe(domainB.cid);
    expect(canonicalBytesToString(domainA.canonical_bytes)).not.toBe(
      canonicalBytesToString(domainB.canonical_bytes),
    );
  });

  it('artifact rehash rejects forged metadata and retained bytes', () => {
    const artifact = artifactDigest(ARTIFACT_VECTOR_MATERIAL);
    for (const change of [
      { domain: 'gui.forged' },
      { interface: 'ForgedArtifact@1' },
      { schema_version: 'forged-artifact/v1' },
      { digest: `sha256:${'0'.repeat(64)}` },
    ]) {
      const forged = { ...artifact, ...change } as typeof artifact;
      expect(() => rehashArtifactDigest(forged)).toThrow(GuiIdentityError);
    }
  });

  it('empty and provenance-only facets share a digest', () => {
    expect(facetDigest({})).toBe(
      facetDigest({ start_line: 3, source_path: '/tmp/source.ts' }),
    );
    expect(facetDigest({ a: 1 })).not.toBe(facetDigest({ a: 2 }));
  });
});
