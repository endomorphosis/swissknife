/**
 * wasm-prover-sprint68.test.ts
 * Tests for Sprint 68 modules:
 *   - sprint68-prover-wrappers.ts (TalosWrapper, EngDCECWrapper, DCECLibraryWrapper, ZKPVerifier)
 *   - sprint68-eth-bridge.ts     (ETH VK registry, onchain pipeline, contract artifacts, EVM public inputs)
 *   - sprint68-utils-types.ts    (FOL session types, bridge types, input validation, translation types, proof cache)
 */

import {
  ProofResultStatus, TalosWrapper,
  EngDCECWrapper,
  DCECStatement, DCECLibraryWrapper,
  ZKPVerifier,
} from '../../src/services/sprint68-prover-wrappers';

import {
  normalizeBytes32Hex, vkHashHexToBytes32, circuitIdTextToBytes32,
  buildRegisterVkPayload, buildRegisterVkCalldata,
  loadContractArtifact, loadContractAbi, normalizeHexPrefixed,
  hashTextToFieldSha256, packPublicInputsForEvm, packManyPublicInputsForEvm,
} from '../../src/services/sprint68-eth-bridge';

import {
  createSession, addStatement,
  BridgeCapability, ConversionStatus, DEFAULT_BRIDGE_CONFIG,
  validateText, validateFormula, validateFormulaList, ValidationError, InputValidator,
  LogicTranslationTarget,
  getGlobalProofCache, clearGlobalProofCache,
} from '../../src/services/sprint68-utils-types';

// ---------------------------------------------------------------------------
// TalosWrapper
// ---------------------------------------------------------------------------
describe('TalosWrapper', () => {
  it('isAvailable returns boolean', () => {
    const w = new TalosWrapper();
    expect(typeof w.isAvailable()).toBe('boolean');
  });

  it('prove returns ProofAttempt with required fields', async () => {
    const w = new TalosWrapper();
    const r = await w.prove('P → Q', []);
    expect(typeof r.attemptId).toBe('string');
    expect(Object.values(ProofResultStatus)).toContain(r.status);
    expect(r.formula).toBe('P → Q');
  });

  it('batchProve returns array of attempts', async () => {
    const w = new TalosWrapper();
    const results = await w.batchProve([{ formula: 'A' }, { formula: 'B' }]);
    expect(results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// EngDCECWrapper
// ---------------------------------------------------------------------------
describe('EngDCECWrapper', () => {
  const wrapper = new EngDCECWrapper();

  it('converts obligation sentence', () => {
    const r = wrapper.convert('The contractor must deliver the report');
    expect(r.clauses.length).toBeGreaterThan(0);
    expect(r.dcecText).toContain('O(');
  });

  it('converts permission sentence', () => {
    const r = wrapper.convert('The user may access the file');
    expect(r.dcecText).toContain('P(');
  });

  it('converts prohibition sentence', () => {
    const r = wrapper.convert('The vendor must not share data');
    expect(r.dcecText).toContain('F(');
  });

  it('returns error for empty input', () => {
    const r = wrapper.convert('');
    expect(r.success).toBe(false);
  });

  it('convertBatch handles multiple texts', () => {
    const results = wrapper.convertBatch(['must do', 'may do']);
    expect(results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// DCECLibraryWrapper
// ---------------------------------------------------------------------------
describe('DCECLibraryWrapper', () => {
  let lib: DCECLibraryWrapper;
  beforeEach(() => { lib = new DCECLibraryWrapper(); });

  it('addStatement parses O formula', () => {
    const s = lib.addStatement('O(Alice, deliver)');
    expect(s).not.toBeNull();
    expect(s!.operator).toBe('O');
    expect(s!.agent).toBe('Alice');
  });

  it('returns null for unparseable formula', () => {
    expect(lib.addStatement('invalid formula')).toBeNull();
  });

  it('listStatements returns added statements', () => {
    lib.addStatement('O(Alice, deliver)');
    lib.addStatement('P(Bob, access)');
    expect(lib.listStatements()).toHaveLength(2);
  });

  it('checkConsistency returns false for O+F conflict', () => {
    lib.addStatement('O(Alice, deliver)');
    lib.addStatement('F(Alice, deliver)');
    expect(lib.checkConsistency()).toBe(false);
  });

  it('checkConsistency returns true for consistent set', () => {
    lib.addStatement('O(Alice, deliver)');
    lib.addStatement('P(Bob, access)');
    expect(lib.checkConsistency()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ZKPVerifier
// ---------------------------------------------------------------------------
describe('ZKPVerifier', () => {
  it('verify returns valid for groth16-backup proof with verified:true', async () => {
    const verifier = new ZKPVerifier();
    const proof = JSON.stringify({ type: 'groth16-backup', verified: true });
    const result = await verifier.verify(proof, 'vkhash');
    expect(result.isValid).toBe(true);
  });

  it('verify returns invalid for malformed JSON', async () => {
    const verifier = new ZKPVerifier();
    const result = await verifier.verify('not json', 'vk');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('getStats tracks verified count', async () => {
    const verifier = new ZKPVerifier();
    await verifier.verify('{}', 'vk');
    expect(verifier.getStats().verified).toBe(1);
  });

  it('batchVerify handles multiple proofs', async () => {
    const verifier = new ZKPVerifier();
    const results = await verifier.batchVerify([
      { proofJson: JSON.stringify({ type: 'groth16-backup', verified: true }), vkHash: 'v1' },
      { proofJson: '{}', vkHash: 'v2' },
    ]);
    expect(results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// ETH VK Registry Payloads
// ---------------------------------------------------------------------------
describe('normalizeBytes32Hex', () => {
  it('pads to 64 chars', () => {
    expect(normalizeBytes32Hex('abc')).toHaveLength(64);
  });
  it('strips 0x prefix', () => {
    expect(normalizeBytes32Hex('0xdeadbeef')).not.toContain('0x');
  });
});

describe('vkHashHexToBytes32', () => {
  it('returns 0x-prefixed 66-char string', () => {
    const r = vkHashHexToBytes32('deadbeef');
    expect(r.startsWith('0x')).toBe(true);
    expect(r.length).toBe(66);
  });
});

describe('circuitIdTextToBytes32', () => {
  it('is deterministic', () => {
    expect(circuitIdTextToBytes32('circ1')).toBe(circuitIdTextToBytes32('circ1'));
  });
  it('differs for different circuit IDs', () => {
    expect(circuitIdTextToBytes32('a')).not.toBe(circuitIdTextToBytes32('b'));
  });
});

describe('buildRegisterVkPayload', () => {
  it('returns object with required fields', () => {
    const payload = buildRegisterVkPayload('circ1', { key: 'val' }, 'aabbcc');
    expect(payload.circuitIdBytes32).toBeDefined();
    expect(payload.vkHashBytes32).toBeDefined();
    expect(typeof payload.vkData).toBe('string');
  });
});

describe('buildRegisterVkCalldata', () => {
  it('returns hex string starting with 0x', () => {
    const payload = buildRegisterVkPayload('c', {}, 'ff');
    const calldata = buildRegisterVkCalldata(payload);
    expect(calldata.startsWith('0x')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ETH Contract Artifacts
// ---------------------------------------------------------------------------
describe('loadContractArtifact', () => {
  it('parses a JSON artifact', () => {
    const artifact = loadContractArtifact({ contractName: 'VKRegistry', abi: [{ type: 'function' }], bytecode: '0xabc' });
    expect(artifact.contractName).toBe('VKRegistry');
    expect(artifact.abi).toHaveLength(1);
  });
  it('handles missing fields gracefully', () => {
    const artifact = loadContractArtifact({});
    expect(artifact.contractName).toBe('Unknown');
    expect(artifact.abi).toHaveLength(0);
  });
});

describe('loadContractAbi', () => {
  it('returns ABI array', () => {
    const abi = loadContractAbi({ contractName: 'X', abi: [{ type: 'event' }] });
    expect(abi).toHaveLength(1);
  });
});

describe('normalizeHexPrefixed', () => {
  it('adds 0x prefix if missing', () => {
    expect(normalizeHexPrefixed('deadbeef')).toBe('0xdeadbeef');
  });
  it('keeps 0x prefix if present', () => {
    expect(normalizeHexPrefixed('0xdeadbeef')).toBe('0xdeadbeef');
  });
});

// ---------------------------------------------------------------------------
// EVM Public Inputs
// ---------------------------------------------------------------------------
describe('hashTextToFieldSha256', () => {
  it('returns 0x-prefixed 66-char string', () => {
    const h = hashTextToFieldSha256('hello');
    expect(h.startsWith('0x')).toBe(true);
    expect(h.length).toBe(66);
  });
  it('is deterministic', () => {
    expect(hashTextToFieldSha256('test')).toBe(hashTextToFieldSha256('test'));
  });
});

describe('packPublicInputsForEvm', () => {
  it('returns array of hex strings', () => {
    const packed = packPublicInputsForEvm({ a: '0x1234', b: 'abcd' });
    expect(packed.length).toBe(2);
    expect(packed[0]!.startsWith('0x')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Interactive FOL Session Types
// ---------------------------------------------------------------------------
describe('createSession', () => {
  it('creates session with domain', () => {
    const s = createSession('legal');
    expect(s.domain).toBe('legal');
    expect(s.statements).toHaveLength(0);
  });
});

describe('addStatement', () => {
  it('adds a statement record', () => {
    const s = createSession();
    const r = addStatement(s, 'P → Q', 'axiom');
    expect(r.formula).toBe('P → Q');
    expect(s.statements).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Bridge Types
// ---------------------------------------------------------------------------
describe('BridgeCapability', () => {
  it('has DEONTIC_TO_UCAN', () => expect(BridgeCapability.DEONTIC_TO_UCAN).toBe('deontic_to_ucan'));
});

describe('DEFAULT_BRIDGE_CONFIG', () => {
  it('has maxTokens 4096', () => expect(DEFAULT_BRIDGE_CONFIG.maxTokens).toBe(4096));
});

// ---------------------------------------------------------------------------
// Input Validation
// ---------------------------------------------------------------------------
describe('validateText', () => {
  it('passes for valid text', () => expect(() => validateText('hello')).not.toThrow());
  it('throws for text exceeding max length', () => {
    expect(() => validateText('a'.repeat(100_001))).toThrow(ValidationError);
  });
});

describe('validateFormula', () => {
  it('passes for balanced formula', () => expect(() => validateFormula('(P ∧ Q) → R')).not.toThrow());
  it('throws for unbalanced parens', () => expect(() => validateFormula('(P ∧ Q')).toThrow(ValidationError));
  it('throws for empty formula', () => expect(() => validateFormula('')).toThrow(ValidationError));
});

describe('InputValidator', () => {
  const v = new InputValidator();
  it('isValid returns true for valid text', () => expect(v.isValid('hello world')).toBe(true));
  it('isValid returns false for oversized text', () => expect(v.isValid('x'.repeat(200_000))).toBe(false));
});

// ---------------------------------------------------------------------------
// Translation Types
// ---------------------------------------------------------------------------
describe('LogicTranslationTarget', () => {
  it('has DCEC and TPTP', () => {
    expect(LogicTranslationTarget.DCEC).toBe('dcec');
    expect(LogicTranslationTarget.TPTP).toBe('tptp');
  });
});

// ---------------------------------------------------------------------------
// TDFOL Proof Cache
// ---------------------------------------------------------------------------
describe('getGlobalProofCache', () => {
  beforeEach(() => clearGlobalProofCache());

  it('returns singleton cache', () => {
    const c1 = getGlobalProofCache();
    const c2 = getGlobalProofCache();
    expect(c1).toBe(c2);
  });

  it('stores and retrieves results', () => {
    const cache = getGlobalProofCache();
    cache.set('P → Q', { isProved: true, ttl: 60_000 });
    const r = cache.get('P → Q');
    expect(r).not.toBeNull();
    expect(r!.isProved).toBe(true);
  });

  it('clearGlobalProofCache empties the cache', () => {
    const cache = getGlobalProofCache();
    cache.set('A', { isProved: false, ttl: 60_000 });
    clearGlobalProofCache();
    expect(cache.get('A')).toBeNull();
  });
});
