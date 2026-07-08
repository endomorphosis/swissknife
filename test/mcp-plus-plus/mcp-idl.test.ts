/**
 * Phase 3 — MCP-IDL tests
 * Tests for Interface Descriptor canonicalization, CID stability,
 * and InterfaceRepository APIs.
 */

import {
  canonicalize,
  computeInterfaceCID,
  InterfaceRepository,
  InterfaceDescriptor,
} from '../../src/services/mcp/mcp-idl';
import {
  bytesToHex,
  bytesToUtf8,
} from '../../src/services/shared/browser-bytes';

const SAMPLE_DESCRIPTOR: InterfaceDescriptor = {
  name: 'search',
  namespace: 'com.example.tools',
  version: '1.0.0',
  methods: [
    {
      name: 'query',
      description: 'Search for information',
    },
  ],
  errors: [{ name: 'NotFound' }],
  requires: ['mcp++/ucan'],
  compatibility: {
    compatibleWith: [],
    supersedes: [],
  },
  semanticTags: ['search', 'web'],
};

describe('canonicalize', () => {
  it('produces deterministic JSON for the same descriptor', () => {
    const a = canonicalize(SAMPLE_DESCRIPTOR);
    const b = canonicalize(SAMPLE_DESCRIPTOR);
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });

  it('sorts keys lexicographically', () => {
    const json = bytesToUtf8(canonicalize(SAMPLE_DESCRIPTOR));
    // 'compatibility' should appear before 'errors' (c < e)
    expect(json.indexOf('"compatibility"')).toBeLessThan(json.indexOf('"errors"'));
  });

  it('produces different bytes for different descriptors', () => {
    const other = { ...SAMPLE_DESCRIPTOR, version: '2.0.0' };
    const a = canonicalize(SAMPLE_DESCRIPTOR);
    const b = canonicalize(other);
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });
});

describe('computeInterfaceCID', () => {
  it('produces a sha256: prefixed CID', () => {
    const cid = computeInterfaceCID(SAMPLE_DESCRIPTOR);
    expect(cid).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('same descriptor always produces the same CID', () => {
    expect(computeInterfaceCID(SAMPLE_DESCRIPTOR)).toBe(
      computeInterfaceCID({ ...SAMPLE_DESCRIPTOR }),
    );
  });

  it('different descriptors produce different CIDs', () => {
    const other = { ...SAMPLE_DESCRIPTOR, name: 'other-tool' };
    expect(computeInterfaceCID(SAMPLE_DESCRIPTOR)).not.toBe(
      computeInterfaceCID(other),
    );
  });
});

describe('InterfaceRepository', () => {
  let repo: InterfaceRepository;

  beforeEach(() => {
    repo = new InterfaceRepository();
  });

  it('registers a descriptor and returns a CID', () => {
    const cid = repo.register(SAMPLE_DESCRIPTOR);
    expect(cid).toMatch(/^sha256:/);
  });

  it('lists registered CIDs', () => {
    const cid = repo.register(SAMPLE_DESCRIPTOR);
    expect(repo.list()).toContain(cid);
  });

  it('retrieves canonical bytes by CID', () => {
    const cid = repo.register(SAMPLE_DESCRIPTOR);
    const bytes = repo.get(cid);
    expect(bytes).not.toBeNull();
    expect(bytesToUtf8(bytes!)).toContain('"search"');
  });

  it('returns null for unknown CID', () => {
    expect(repo.get('sha256:unknown')).toBeNull();
  });

  it('is idempotent: same descriptor → same CID', () => {
    const cid1 = repo.register(SAMPLE_DESCRIPTOR);
    const cid2 = repo.register({ ...SAMPLE_DESCRIPTOR });
    expect(cid1).toBe(cid2);
    expect(repo.list().length).toBe(1);
  });

  describe('compat()', () => {
    it('returns compatible for a descriptor with all requires met', () => {
      const dep: InterfaceDescriptor = {
        name: 'mcp++/ucan',
        namespace: 'mcp++',
        version: '1.0.0',
        methods: [],
        errors: [],
        requires: [],
        compatibility: {},
      };
      repo.register(dep);
      const cid = repo.register(SAMPLE_DESCRIPTOR);
      const verdict = repo.compat(cid);
      expect(verdict.compatible).toBe(true);
      expect(verdict.requiresMissing.length).toBe(0);
    });

    it('returns incompatible when a required capability is missing', () => {
      const cid = repo.register(SAMPLE_DESCRIPTOR); // requires mcp++/ucan
      const verdict = repo.compat(cid);
      expect(verdict.compatible).toBe(false);
      expect(verdict.requiresMissing).toContain('mcp++/ucan');
    });

    it('returns not found verdict for unknown CID', () => {
      const verdict = repo.compat('sha256:notfound');
      expect(verdict.compatible).toBe(false);
    });
  });

  describe('select()', () => {
    it('selects descriptors within the token budget', () => {
      const cheap: InterfaceDescriptor = {
        ...SAMPLE_DESCRIPTOR,
        name: 'cheap',
        resourceCostHints: { tokensPerCall: 100 },
      };
      const expensive: InterfaceDescriptor = {
        ...SAMPLE_DESCRIPTOR,
        name: 'expensive',
        resourceCostHints: { tokensPerCall: 5000 },
      };
      repo.register(cheap);
      repo.register(expensive);
      const selected = repo.select('hint', 200);
      expect(selected.length).toBe(1);
      // Should have selected the cheap one
      const desc = repo.getDescriptor(selected[0]);
      expect(desc?.name).toBe('cheap');
    });

    it('selects nothing when budget is 0', () => {
      const d: InterfaceDescriptor = {
        ...SAMPLE_DESCRIPTOR,
        resourceCostHints: { tokensPerCall: 1 },
      };
      repo.register(d);
      const selected = repo.select('hint', 0);
      expect(selected.length).toBe(0);
    });
  });
});
